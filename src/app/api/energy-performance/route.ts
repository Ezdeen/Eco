import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/authorization'

// Helper: compute period start date from period type
function getPeriodStart(period: string): Date {
  const now = new Date()
  switch (period) {
    case 'today':
      const today = new Date(now)
      today.setHours(0, 0, 0, 0)
      return today
    case 'week':
      const week = new Date(now)
      week.setDate(week.getDate() - 7)
      return week
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1)
    case 'quarter':
      const qMonth = Math.floor(now.getMonth() / 3) * 3
      return new Date(now.getFullYear(), qMonth, 1)
    case 'year':
      return new Date(now.getFullYear(), 0, 1)
    default:
      return new Date(0) // all time
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('project:read')
    if (!auth.authorized) return auth.response

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const period = searchParams.get('period') || 'all' // today, week, month, quarter, year, all
    const city = searchParams.get('city')
    const projectType = searchParams.get('projectType')
    const deviceStatus = searchParams.get('deviceStatus')

    const periodStart = getPeriodStart(period)

    // Build where clause with filters
    const where: any = {
      projectType: { not: 'afforestation' },
      ...(projectId ? { id: projectId } : {}),
      ...(city ? { city } : {}),
      ...(projectType ? { projectType } : {}),
    }

    const projects = await db.project.findMany({
      where,
      select: {
        id: true, name: true, nameAr: true, code: true,
        projectType: true, status: true, city: true,
        capacityKwp: true, currency: true,
        tariffRetail: true, tariffFeedIn: true, commissionedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    const now = new Date()
    const result: any[] = []
    const allAlerts: any[] = []

    for (const project of projects) {
      // Fetch export readings within the selected period
      const readings = await db.energyReading.findMany({
        where: {
          projectId: project.id,
          metricType: 'energy_export_kwh',
          measuredAt: { gte: periodStart },
          qualityStatus: { in: ['validated', 'approved', 'corrected'] },
        },
        select: { value: true, measuredAt: true, qualityStatus: true, deviceId: true },
        orderBy: { measuredAt: 'asc' },
      })

      // Fetch import/self-consumption readings within the selected period (real data, not a fixed ratio)
      const importReadings = await db.energyReading.findMany({
        where: {
          projectId: project.id,
          metricType: 'energy_import_kwh',
          measuredAt: { gte: periodStart },
          qualityStatus: { in: ['validated', 'approved', 'corrected'] },
        },
        select: { value: true },
      })

      // Also fetch suspect/rejected readings for SLA
      const suspectReadings = await db.energyReading.findMany({
        where: {
          projectId: project.id,
          metricType: 'energy_export_kwh',
          measuredAt: { gte: periodStart },
          qualityStatus: { in: ['suspect', 'rejected'] },
        },
        select: { value: true, measuredAt: true, qualityStatus: true, suspectReason: true, suspectSeverity: true },
        orderBy: { measuredAt: 'asc' },
      })

      // Fetch devices with optional status filter
      const devices = await db.device.findMany({
        where: {
          projectId: project.id,
          ...(deviceStatus ? { status: deviceStatus } : {}),
        },
        select: { id: true, name: true, status: true, lastSeenAt: true, serialNumber: true },
      })

      // Skip project if deviceStatus filter doesn't match
      if (deviceStatus && devices.length === 0) continue

      // Energy aggregation
      const totalEnergy = readings.reduce((s, r) => s + r.value, 0)
      const totalImportEnergy = importReadings.reduce((s, r) => s + r.value, 0)
      const maxPower = readings.length > 0 ? Math.max(...readings.map((r) => r.value)) : 0
      const currentPower = readings.length > 0 ? readings[readings.length - 1].value : 0

      const operationalDays = project.commissionedAt
        ? Math.floor((now.getTime() - project.commissionedAt.getTime()) / (1000 * 60 * 60 * 24))
        : 0

      const periodDays = Math.max(1, Math.ceil((now.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)))

      // Expected energy: derive PSH (peak sun hours) from actual stored weather observations
      // for this project/period instead of a fixed constant. Falls back to a documented
      // regional default only when no weather data has been recorded yet.
      const systemLosses = 0.14
      const inverterEfficiency = 0.97

      const weatherObservations = await db.weatherObservation.findMany({
        where: {
          projectId: project.id,
          observedAt: { gte: periodStart, lte: now },
          irradianceWm2: { not: null },
        },
        select: { irradianceWm2: true },
      })

      const FALLBACK_PSH = 5.5 // used only when no weather observations exist yet for this project
      let psh = FALLBACK_PSH
      let pshSource: 'weather_observed' | 'fallback_default' = 'fallback_default'

      if (weatherObservations.length > 0) {
        // irradianceWm2 is stored as MJ/m²/day (see src/lib/weather.ts); convert to kWh/m²/day (PSH equivalent)
        const avgIrradianceMJ = weatherObservations.reduce((s, w) => s + (w.irradianceWm2 || 0), 0) / weatherObservations.length
        const avgPsh = avgIrradianceMJ * 0.277778
        if (avgPsh > 0) {
          psh = avgPsh
          pshSource = 'weather_observed'
        }
      }

      const expectedEnergyPeriod = project.capacityKwp
        ? project.capacityKwp * psh * periodDays * (1 - systemLosses) * inverterEfficiency
        : 0
      const achievementRate = expectedEnergyPeriod > 0 ? (totalEnergy / expectedEnergyPeriod) * 100 : 0

      // Performance Ratio
      const referenceYield = project.capacityKwp ? psh * periodDays * (1 - systemLosses) : 0
      const finalYield = project.capacityKwp ? totalEnergy / project.capacityKwp : 0
      const performanceRatio = referenceYield > 0 ? (finalYield / referenceYield) * 100 : 0
      const specificYield = project.capacityKwp ? totalEnergy / project.capacityKwp : 0

      // Availability
      const latestReadingByDevice = new Map<string, Date>()
      for (const reading of readings) {
        if (!reading.deviceId) continue
        const current = latestReadingByDevice.get(reading.deviceId)
        if (!current || reading.measuredAt > current) {
          latestReadingByDevice.set(reading.deviceId, reading.measuredAt)
        }
      }

      const deviceHealth = devices.map((device) => {
        const latestReadingAt = latestReadingByDevice.get(device.id)
        const referenceSignalAt = latestReadingAt || device.lastSeenAt || null
        const hoursSinceLastSignal = referenceSignalAt
          ? (now.getTime() - referenceSignalAt.getTime()) / (1000 * 60 * 60)
          : Number.POSITIVE_INFINITY

        if (!referenceSignalAt) {
          return { ...device, connectivity: 'stopped' as const, hoursSinceLastSignal: Number.POSITIVE_INFINITY }
        }

        if (hoursSinceLastSignal <= 8) {
          return { ...device, connectivity: 'connected' as const, hoursSinceLastSignal }
        }
        if (hoursSinceLastSignal <= 16) {
          return { ...device, connectivity: 'warning' as const, hoursSinceLastSignal }
        }

        return { ...device, connectivity: 'stopped' as const, hoursSinceLastSignal }
      })

      const connectedDevices = deviceHealth.filter((d) => d.connectivity === 'connected')

      // === SLA Indicators ===
      // 1. Device downtime (minutes since last seen for offline devices) — computed first
      // so technicalAvailability below can be derived from it instead of a fixed ratio.
      let deviceDowntimeMinutes = 0
      for (const device of devices) {
        if (device.status !== 'connected' && device.lastSeenAt) {
          const downtime = Math.floor((now.getTime() - device.lastSeenAt.getTime()) / (1000 * 60))
          deviceDowntimeMinutes += downtime
        }
      }

      // Technical availability = uptime / total possible time, based on actual recorded
      // device downtime (deviceDowntimeMinutes) rather than an assumed fixed 98% ratio.
      const periodMinutes = Math.max(1, periodDays * 24 * 60) * Math.max(1, devices.length)
      const cappedDowntimeMinutes = Math.min(deviceDowntimeMinutes, periodMinutes)
      const technicalAvailability = devices.length > 0
        ? Math.max(0, Math.min(100, ((periodMinutes - cappedDowntimeMinutes) / periodMinutes) * 100))
        : 0
      const deviceUptimeHours = (periodMinutes - cappedDowntimeMinutes) / 60

      const expectedReadingsCount = periodDays * 14
      const actualReadingsCount = readings.length
      const dataAvailability = expectedReadingsCount > 0 ? Math.min(100, (actualReadingsCount / expectedReadingsCount) * 100) : 0
      const availability = Math.min(technicalAvailability, dataAvailability)

      // Capacity Factor
      const capacityFactor = project.capacityKwp && operationalDays > 0
        ? (totalEnergy / (project.capacityKwp * 24 * periodDays)) * 100
        : 0

      // Operating/downtime hours derived from the same real per-device downtime figure
      const operatingHours = Math.round(deviceUptimeHours)
      const downtimeHours = Math.round(cappedDowntimeMinutes / 60)

      // 2. Case processing time (average time to resolve cases in this period)
      const cases = await db.case.findMany({
        where: {
          projectId: project.id,
          createdAt: { gte: periodStart },
        },
        select: { status: true, createdAt: true, updatedAt: true },
      })
      const resolvedCases = cases.filter((c) => c.status === 'resolved' || c.status === 'closed')
      const avgCaseProcessingHours = resolvedCases.length > 0
        ? resolvedCases.reduce((s, c) => {
            const hours = (c.updatedAt.getTime() - c.createdAt.getTime()) / (1000 * 60 * 60)
            return s + hours
          }, 0) / resolvedCases.length
        : 0

      // 3. Missing readings percentage
      const missingReadingsPct = expectedReadingsCount > 0
        ? Math.max(0, ((expectedReadingsCount - actualReadingsCount) / expectedReadingsCount) * 100)
        : 0

      // Energy flow — derived from actual readings, not a fixed ratio:
      // - selfConsumed comes from real energy_import_kwh readings for the same project/period.
      // - exportedToGrid is what's actually left after self-consumption (never negative).
      // - lostDueToFaults is estimated from the actual value of suspect/rejected readings
      //   in the period (a real, if partial, proxy for energy lost to fault conditions).
      // - lostDueToWeather is not separately measured by any sensor in this system yet,
      //   so it is reported as null/unavailable rather than a made-up constant.
      const selfConsumed = Math.min(totalImportEnergy, totalEnergy)
      const energyExported = Math.max(0, totalEnergy - selfConsumed)
      const energyLostFaults = suspectReadings.reduce((s, r) => s + Math.abs(r.value), 0)

      // === Smart Alerts ===
      const projectAlerts: any[] = []

      // 1. Performance drop: PR < 70%
      if (performanceRatio > 0 && performanceRatio < 70) {
        projectAlerts.push({
          type: 'performance_drop',
          severity: performanceRatio < 50 ? 'critical' : 'high',
          title: 'انخفاض الأداء',
          message: `Performance Ratio = ${performanceRatio.toFixed(1)}% (أقل من 70%)`,
          projectId: project.id,
          projectCode: project.code,
        })
      }

      // 2. Missing data: missing readings > 20%
      if (missingReadingsPct > 20) {
        projectAlerts.push({
          type: 'missing_data',
          severity: missingReadingsPct > 50 ? 'critical' : 'high',
          title: 'بيانات مفقودة',
          message: `${missingReadingsPct.toFixed(1)}% من القراءات المتوقعة غير متوفرة`,
          projectId: project.id,
          projectCode: project.code,
        })
      }

      // 3. Device stopped/warning: based on last reading or last seen time
      const warningDevices = deviceHealth.filter((d) => d.connectivity === 'warning')
      if (warningDevices.length > 0) {
        projectAlerts.push({
          type: 'device_warning',
          severity: 'high',
          title: 'تأخر استقبال البيانات',
          message: `${warningDevices.length} جهاز لم يستقبل قراءة جديدة خلال 8-16 ساعة: ${warningDevices.map((d) => d.name).join(', ')}`,
          projectId: project.id,
          projectCode: project.code,
        })
      }

      const stoppedDevices = deviceHealth.filter((d) => d.connectivity === 'stopped')
      if (stoppedDevices.length > 0) {
        projectAlerts.push({
          type: 'device_stopped',
          severity: 'critical',
          title: 'جهاز متوقف',
          message: `${stoppedDevices.length} جهاز لم يستقبل قراءة جديدة خلال 24 ساعة أو لم توجد له قراءة حديثة: ${stoppedDevices.map((d) => d.name).join(', ')}`,
          projectId: project.id,
          projectCode: project.code,
        })
      }

      // 4. Anomalous reading: suspect readings exist
      if (suspectReadings.length > 0) {
        const criticalReadings = suspectReadings.filter((r) => r.suspectSeverity === 'critical')
        projectAlerts.push({
          type: 'anomalous_reading',
          severity: criticalReadings.length > 0 ? 'critical' : 'medium',
          title: 'قراءة شاذة',
          message: `${suspectReadings.length} قراءة مشبوهة (${criticalReadings.length} حرجة)`,
          projectId: project.id,
          projectCode: project.code,
        })
      }

      allAlerts.push(...projectAlerts)

      result.push({
        project: {
          id: project.id, name: project.name, nameAr: project.nameAr,
          code: project.code, projectType: project.projectType,
          status: project.status, city: project.city,
          capacityKwp: project.capacityKwp, currency: project.currency,
          tariffRetail: project.tariffRetail, tariffFeedIn: project.tariffFeedIn,
          commissionedAt: project.commissionedAt, operationalDays,
          devicesCount: devices.length,
          connectedDevices: connectedDevices.length,
        },
        energy: {
          total: Math.round(totalEnergy),
          currentPower: Math.round(currentPower),
          maxPower: Math.round(maxPower),
          expected: Math.round(expectedEnergyPeriod),
          achievementRate: Math.round(achievementRate * 10) / 10,
          pshUsed: Math.round(psh * 100) / 100,
          pshSource, // 'weather_observed' when derived from real WeatherObservation rows, 'fallback_default' otherwise
        },
        performance: {
          performanceRatio: Math.round(performanceRatio * 10) / 10,
          specificYield: Math.round(specificYield * 10) / 10,
          availability: Math.round(availability * 10) / 10,
          technicalAvailability: Math.round(technicalAvailability * 10) / 10,
          dataAvailability: Math.round(dataAvailability * 10) / 10,
          capacityFactor: Math.round(capacityFactor * 10) / 10,
          operatingHours: Math.round(operatingHours),
          downtimeHours: Math.round(downtimeHours),
        },
        sla: {
          deviceDowntimeMinutes: Math.round(deviceDowntimeMinutes),
          avgCaseProcessingHours: Math.round(avgCaseProcessingHours * 10) / 10,
          missingReadingsPct: Math.round(missingReadingsPct * 10) / 10,
          openCases: cases.filter((c) => c.status === 'open' || c.status === 'in_progress').length,
        },
        energyFlow: {
          exportedToGrid: Math.round(energyExported),
          selfConsumed: Math.round(selfConsumed),
          lostDueToFaults: Math.round(energyLostFaults),
          // No sensor in this system currently isolates weather-specific losses from
          // export readings, so we report null (unavailable) instead of a fabricated number.
          lostDueToWeather: null,
          hasImportData: totalImportEnergy > 0, // lets the UI show a note when selfConsumed is 0 due to missing import readings, not zero real consumption
        },
        alerts: projectAlerts,
      })
    }

    // Aggregate stats
    const stats = {
      totalProjects: result.length,
      totalCapacityKwp: projects.reduce((s, p) => s + (p.capacityKwp || 0), 0),
      totalEnergy: result.reduce((s, p) => s + p.energy.total, 0),
      totalCurrentPower: result.reduce((s, p) => s + p.energy.currentPower, 0),
      totalMaxPower: result.reduce((s, p) => s + p.energy.maxPower, 0),
      totalExported: result.reduce((s, p) => s + p.energyFlow.exportedToGrid, 0),
      totalSelfConsumed: result.reduce((s, p) => s + p.energyFlow.selfConsumed, 0),
      averagePR: result.length > 0 ? result.reduce((s, p) => s + p.performance.performanceRatio, 0) / result.length : 0,
      averageAvailability: result.length > 0 ? result.reduce((s, p) => s + p.performance.availability, 0) / result.length : 0,
      averageTechnicalAvailability: result.length > 0 ? result.reduce((s, p) => s + p.performance.technicalAvailability, 0) / result.length : 0,
      averageDataAvailability: result.length > 0 ? result.reduce((s, p) => s + p.performance.dataAvailability, 0) / result.length : 0,
      averageCapacityFactor: result.length > 0 ? result.reduce((s, p) => s + p.performance.capacityFactor, 0) / result.length : 0,
      averageAchievementRate: result.length > 0 ? result.reduce((s, p) => s + p.energy.achievementRate, 0) / result.length : 0,
      // SLA aggregate
      totalDeviceDowntimeMinutes: result.reduce((s, p) => s + p.sla.deviceDowntimeMinutes, 0),
      avgCaseProcessingHours: result.length > 0 ? result.reduce((s, p) => s + p.sla.avgCaseProcessingHours, 0) / result.length : 0,
      avgMissingReadingsPct: result.length > 0 ? result.reduce((s, p) => s + p.sla.missingReadingsPct, 0) / result.length : 0,
      totalOpenCases: result.reduce((s, p) => s + p.sla.openCases, 0),
      // Alerts
      totalAlerts: allAlerts.length,
      criticalAlerts: allAlerts.filter((a) => a.severity === 'critical').length,
      highAlerts: allAlerts.filter((a) => a.severity === 'high').length,
      mediumAlerts: allAlerts.filter((a) => a.severity === 'medium').length,
    }

    // Available filter options
    const filterOptions = {
      cities: [...new Set(projects.map((p) => p.city).filter(Boolean))],
      projectTypes: [...new Set(projects.map((p) => p.projectType).filter(Boolean))],
    }

    return NextResponse.json({
      projects: result,
      stats,
      alerts: allAlerts,
      filterOptions,
      period,
    })
  } catch (error) {
    console.error('Energy performance API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

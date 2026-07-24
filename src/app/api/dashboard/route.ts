import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, projectScopeFilter } from '@/lib/authorization'
import { getEmissionFactor } from '@/lib/reference-data'

export async function GET() {
  try {
    // === PRIORITY 3: Use user's organization, not findFirst() ===
    const auth = await requireAuth()
    if (!auth.authorized) return auth.response

    const { user } = auth

    // Filter by user's organization
    const org = await db.organization.findUnique({
      where: { id: user.organizationId! },
      include: {
        projects: true,
        members: { include: { user: true } },
        impactAccounts: true,
      },
    })

    if (!org) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 })
    }

    // Data isolation: project_manager only sees their own assigned projects.
    // Everything downstream (readings, calculations, savings) is derived from `projects`,
    // so scoping it here automatically scopes the entire dashboard.
    const scope = projectScopeFilter(user)
    const projects = Object.keys(scope).length
      ? org.projects.filter((p) => p.managerId === user.userId)
      : org.projects
    const activeProjects = projects.filter((p) => p.status === 'active')

    // === PRIORITY 3: Filter readings by organization's projects only ===
    // All-time readings (unchanged scope from before): used for the headline
    // KPI totals (totalEnergyKwh, totalCo2AvoidedKg, totalSavingsSar, data
    // quality rates), exactly as previously.
    const readings = await db.energyReading.findMany({
      where: {
        projectId: { in: activeProjects.map((p) => p.id) },
        metricType: 'energy_export_kwh',
      },
      select: { value: true, measuredAt: true, qualityStatus: true, validationStatus: true, projectId: true },
    })

    const totalEnergyKwh = readings.reduce((sum, r) => sum + r.value, 0)

    // === PRIORITY 1: Use reference table for emission factor ===
    const countryCode = (org.country || 'SA').substring(0, 2).toUpperCase()
    const emissionFactorData = await getEmissionFactor(countryCode)
    const totalCo2AvoidedKg = totalEnergyKwh * emissionFactorData.factor

    // Per-project tariff map, reused below for totalSavingsSar, the daily chart,
    // and the average-tariff KPI, so all of these stay consistent with each other.
    const tariffByProject: Record<string, number> = {}
    for (const p of activeProjects) tariffByProject[p.id] = p.tariffRetail || 0.18

    const computeSavings = (rows: typeof readings) =>
      activeProjects.reduce((sum, p) => {
        const projectEnergy = rows.filter((r) => r.projectId === p.id).reduce((s, r) => s + r.value, 0)
        return sum + projectEnergy * tariffByProject[p.id]
      }, 0)

    const totalSavingsSar = computeSavings(readings)

    // Weighted average retail tariff across active projects, weighted by each
    // project's actual all-time energy - replaces the previously hardcoded
    // "0.18 SAR/kWh" label shown under the savings KPI regardless of real tariffs.
    const avgTariffRetail = totalEnergyKwh > 0
      ? activeProjects.reduce((sum, p) => {
          const projectEnergy = readings.filter((r) => r.projectId === p.id).reduce((s, r) => s + r.value, 0)
          return sum + projectEnergy * tariffByProject[p.id]
        }, 0) / totalEnergyKwh
      : (activeProjects.reduce((s, p) => s + tariffByProject[p.id], 0) / Math.max(1, activeProjects.length))

    // --- 30-day windows, used only for the daily chart and the period-over-period
    // trend percentages below. These are a separate, narrower slice of `readings`
    // and do NOT change the all-time headline KPIs above. ---
    const now = new Date()
    const period1Start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    period1Start.setHours(0, 0, 0, 0)
    const period2Start = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
    period2Start.setHours(0, 0, 0, 0)

    const readings30d = readings.filter((r) => r.measuredAt >= period1Start)
    const priorReadings30d = readings.filter((r) => r.measuredAt >= period2Start && r.measuredAt < period1Start)

    const energy30d = readings30d.reduce((sum, r) => sum + r.value, 0)
    const priorEnergy30d = priorReadings30d.reduce((sum, r) => sum + r.value, 0)
    const co2_30d = energy30d * emissionFactorData.factor
    const priorCo2_30d = priorEnergy30d * emissionFactorData.factor
    const savings30d = computeSavings(readings30d)
    const priorSavings30d = computeSavings(priorReadings30d)

    // Real trend percentages (last 30 days vs. the 30 days before that),
    // replacing the previously hardcoded +12.4% / +11.8% / +9.2% shown in the UI.
    // null when there's no prior-period data to compare against (avoids a
    // misleading +/-100% or divide-by-zero artifact for brand-new projects).
    const pctChange = (current: number, prior: number): number | null => {
      if (prior <= 0) return current > 0 ? null : 0
      return ((current - prior) / prior) * 100
    }
    const periodTrends = {
      energy: pctChange(energy30d, priorEnergy30d),
      co2: pctChange(co2_30d, priorCo2_30d),
      savings: pctChange(savings30d, priorSavings30d),
    }

    // Readings by day for the last 30 days (chart).
    // co2/savings per day now use each project's own real tariff and the org's
    // real emission factor (same values as the headline KPIs above), instead of
    // the previously hardcoded 0.432 kgCO2/kWh and 0.18 SAR/kWh constants -
    // which could silently disagree with the headline totals whenever a
    // project's tariff or the country's emission factor differed from those
    // fixed numbers.
    const daysData: { date: string; energy: number; co2: number; savings: number }[] = []
    for (let day = 29; day >= 0; day--) {
      const dayStart = new Date(now.getTime() - day * 24 * 60 * 60 * 1000)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
      const dayReadings = readings30d.filter((r) => r.measuredAt >= dayStart && r.measuredAt < dayEnd)
      const dayEnergy = dayReadings.reduce((s, r) => s + r.value, 0)
      const daySavings = computeSavings(dayReadings)
      daysData.push({
        date: dayStart.toISOString().slice(0, 10),
        energy: Math.round(dayEnergy),
        co2: Math.round(dayEnergy * emissionFactorData.factor),
        savings: Math.round(daySavings),
      })
    }

    // Devices status
    const devices = await db.device.findMany({
      where: { projectId: { in: activeProjects.map((p) => p.id) } },
      select: { status: true, lastSeenAt: true, projectId: true },
    })
    const connectedDevices = devices.filter((d) => d.status === 'connected').length
    const offlineDevices = devices.filter((d) => d.status === 'offline' || (d.lastSeenAt && Date.now() - d.lastSeenAt.getTime() > 6 * 60 * 60 * 1000)).length

    // Cases
    // Same tenant-isolation bug as attestations above: these were unscoped and
    // counted Case rows for every project on the platform, not just this
    // organization's/user's own projects.
    const caseScope = { projectId: { in: activeProjects.map((p) => p.id) } }
    const openCases = await db.case.count({ where: { ...caseScope, status: { in: ['open', 'in_progress'] } } })
    const criticalCases = await db.case.count({ where: { ...caseScope, priority: 'critical', status: { in: ['open', 'in_progress'] } } })

    // Attestations
    // IMPORTANT FIX: previously these two queries had no projectId filter at all,
    // so they counted AttestationBatch rows across every organization on the
    // platform - not just this user's/organization's own projects. Every other
    // query in this file (readings, devices, cases, etc.) is scoped to
    // activeProjects; these were the one exception, causing "Hedera
    // confirmations" and "attestation rate" to show platform-wide numbers
    // regardless of which organization or project-manager was logged in.
    const attestationScope = { projectId: { in: activeProjects.map((p) => p.id) }, status: 'confirmed' }
    const attestations = await db.attestationBatch.count({ where: attestationScope })
    const attestationItems = await db.attestationBatch.aggregate({ where: attestationScope, _sum: { itemCount: true } })

    // Data quality
    const validatedReadings = readings.filter((r) => r.qualityStatus === 'validated').length
    const suspectReadings = readings.filter((r) => r.qualityStatus === 'suspect').length
    const dataQualityRate = readings.length > 0 ? (validatedReadings / readings.length) * 100 : 0
    const attestationRate = readings.length > 0 ? Math.min(100, (attestationItems._sum.itemCount || 0) / readings.length * 100) : 0

    // Top/bottom projects by energy
    const projectEnergyMap = new Map<string, number>()
    for (const r of readings) {
      projectEnergyMap.set(r.projectId, (projectEnergyMap.get(r.projectId) || 0) + r.value)
    }
    const projectRanking = activeProjects
      .map((p) => ({
        id: p.id,
        name: p.name,
        nameAr: p.nameAr,
        code: p.code,
        energy: projectEnergyMap.get(p.id) || 0,
        capacity: p.capacityKwp || 0,
        specificYield: p.capacityKwp ? (projectEnergyMap.get(p.id) || 0) / p.capacityKwp : 0,
      }))
      .sort((a, b) => b.energy - a.energy)

    // Unread notifications
    // IMPORTANT FIX: this previously had no filter at all, so it counted
    // unread notifications for every user on the entire platform rather than
    // just the logged-in user. Scope to notifications addressed to this user,
    // or to one of their own projects (Notification.userId/projectId are both
    // optional on this model, so a notification may be tied to either).
    const unreadNotifications = await db.notification.count({
      where: {
        isRead: false,
        OR: [
          { userId: user.userId },
          { projectId: { in: activeProjects.map((p) => p.id) } },
        ],
      },
    })

    // Capacity total
    const totalCapacityKwp = activeProjects.reduce((s, p) => s + (p.capacityKwp || 0), 0)

    return NextResponse.json({
      organization: {
        id: org.id,
        name: org.name,
        nameAr: org.nameAr,
        code: org.code,
        currency: org.currency,
      },
      kpis: {
        totalEnergyKwh: Math.round(totalEnergyKwh),
        totalCo2AvoidedKg: Math.round(totalCo2AvoidedKg),
        totalCo2AvoidedTons: Math.round(totalCo2AvoidedKg / 1000),
        totalSavingsSar: Math.round(totalSavingsSar),
        totalCapacityKwp,
        activeProjects: activeProjects.length,
        totalProjects: projects.length,
        connectedDevices,
        offlineDevices,
        totalDevices: devices.length,
        openCases,
        criticalCases,
        confirmedAttestations: attestations,
        attestedItems: attestationItems._sum.itemCount || 0,
        dataQualityRate: Math.round(dataQualityRate * 10) / 10,
        attestationRate: Math.round(attestationRate * 10) / 10,
        unreadNotifications,
        treeEquivalent: Math.round(totalCo2AvoidedKg / 21), // kg CO2 per tree per year
        carKmAvoided: Math.round(totalCo2AvoidedKg / 0.12), // kg CO2 per km
        avgTariffRetail: Math.round(avgTariffRetail * 1000) / 1000, // real energy-weighted average across active projects, replaces the previously hardcoded "0.18" label
      },
      // Real percentage change vs. the prior 30-day period, replacing the
      // previously hardcoded +12.4% / +11.8% / +9.2% trend values in the UI.
      // Each value is null when there's no prior-period data to compare against.
      periodTrends,
      trends: daysData,
      projectRanking,
      dataQuality: {
        validated: validatedReadings,
        suspect: suspectReadings,
        total: readings.length,
      },
      lastUpdated: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Dashboard API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

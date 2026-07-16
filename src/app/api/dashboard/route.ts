import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/authorization'
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

    const projects = org.projects
    const activeProjects = projects.filter((p) => p.status === 'active')

    // === PRIORITY 3: Filter readings by organization's projects only ===
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

    const totalSavingsSar =
      activeProjects.reduce((sum, p) => {
        const projectReadings = readings.filter((r) => r.projectId === p.id)
        const projectEnergy = projectReadings.reduce((s, r) => s + r.value, 0)
        return sum + projectEnergy * (p.tariffRetail || 0.18)
      }, 0)

    // Readings by day for the last 30 days
    const now = new Date()
    const daysData: { date: string; energy: number; co2: number; savings: number }[] = []
    for (let day = 29; day >= 0; day--) {
      const dayStart = new Date(now.getTime() - day * 24 * 60 * 60 * 1000)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
      const dayReadings = readings.filter((r) => r.measuredAt >= dayStart && r.measuredAt < dayEnd)
      const dayEnergy = dayReadings.reduce((s, r) => s + r.value, 0)
      daysData.push({
        date: dayStart.toISOString().slice(0, 10),
        energy: Math.round(dayEnergy),
        co2: Math.round(dayEnergy * 0.432),
        savings: Math.round(dayEnergy * 0.18),
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
    const openCases = await db.case.count({ where: { status: { in: ['open', 'in_progress'] } } })
    const criticalCases = await db.case.count({ where: { priority: 'critical', status: { in: ['open', 'in_progress'] } } })

    // Attestations
    const attestations = await db.attestationBatch.count({ where: { status: 'confirmed' } })
    const attestationItems = await db.attestationBatch.aggregate({ where: { status: 'confirmed' }, _sum: { itemCount: true } })

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
    const unreadNotifications = await db.notification.count({ where: { isRead: false } })

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
      },
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

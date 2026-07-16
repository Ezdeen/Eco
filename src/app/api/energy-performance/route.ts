import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    // Fetch all solar projects (not afforestation)
    const projects = await db.project.findMany({
      where: {
        projectType: { not: 'afforestation' },
        ...(projectId ? { id: projectId } : {}),
      },
      select: {
        id: true,
        name: true,
        nameAr: true,
        code: true,
        projectType: true,
        status: true,
        city: true,
        capacityKwp: true,
        currency: true,
        tariffRetail: true,
        tariffFeedIn: true,
        commissionedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    const now = new Date()
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const yearStart = new Date(now.getFullYear(), 0, 1)

    const result = []

    for (const project of projects) {
      // Fetch all validated readings for this project
      const readings = await db.energyReading.findMany({
        where: {
          projectId: project.id,
          metricType: 'energy_export_kwh',
          qualityStatus: { in: ['validated', 'approved', 'corrected'] },
        },
        select: { value: true, measuredAt: true },
        orderBy: { measuredAt: 'asc' },
      })

      // Time-based energy aggregation
      let dailyEnergy = 0, monthlyEnergy = 0, yearlyEnergy = 0, totalEnergy = 0
      let maxPower = 0
      const hourlyPowers: number[] = []

      for (const r of readings) {
        totalEnergy += r.value
        if (r.measuredAt >= todayStart) dailyEnergy += r.value
        if (r.measuredAt >= monthStart) monthlyEnergy += r.value
        if (r.measuredAt >= yearStart) yearlyEnergy += r.value
        // Max power = max energy in 1 hour (kWh ≈ kW for 1h interval)
        if (r.value > maxPower) maxPower = r.value
        hourlyPowers.push(r.value)
      }

      // Current power (last reading)
      const currentPower = readings.length > 0 ? readings[readings.length - 1].value : 0

      // Expected energy (based on capacity and PSH)
      const PSH = 5.5 // peak sun hours average
      const systemLosses = 0.14
      const inverterEfficiency = 0.97
      const operationalDays = project.commissionedAt
        ? Math.floor((now.getTime() - project.commissionedAt.getTime()) / (1000 * 60 * 60 * 24))
        : 0
      const expectedEnergyLifetime = project.capacityKwp
        ? project.capacityKwp * PSH * 365 * (operationalDays / 365) * (1 - systemLosses) * inverterEfficiency
        : 0
      const expectedEnergyDaily = project.capacityKwp
        ? project.capacityKwp * PSH * (1 - systemLosses) * inverterEfficiency
        : 0
      const expectedEnergyMonthly = expectedEnergyDaily * 30
      const expectedEnergyYearly = expectedEnergyDaily * 365

      // Achievement rate (%)
      const achievementRate = expectedEnergyLifetime > 0 ? (totalEnergy / expectedEnergyLifetime) * 100 : 0

      // Performance Ratio (PR)
      const referenceYield = project.capacityKwp ? (expectedEnergyDaily / project.capacityKwp) : 0
      const finalYield = project.capacityKwp ? (dailyEnergy / project.capacityKwp) : 0
      const performanceRatio = referenceYield > 0 ? (finalYield / referenceYield) * 100 : 0

      // Specific Yield (kWh/kWp)
      const specificYield = project.capacityKwp ? totalEnergy / project.capacityKwp : 0

      // Availability (estimated based on readings count vs expected)
      const expectedReadingsCount = operationalDays * 14 // 14 hours of production per day
      const actualReadingsCount = readings.length
      const availability = expectedReadingsCount > 0 ? Math.min(100, (actualReadingsCount / expectedReadingsCount) * 100) : 0

      // Capacity Factor (%)
      const capacityFactor = project.capacityKwp && operationalDays > 0
        ? (totalEnergy / (project.capacityKwp * 24 * operationalDays)) * 100
        : 0

      // Operating hours (estimated: 14 hours/day * operational days)
      const operatingHours = operationalDays * 14

      // Downtime hours (estimated: 2% of total time)
      const downtimeHours = operationalDays * 24 * 0.02

      // Energy exported to grid (estimated 30% of total)
      const energyExported = totalEnergy * 0.3

      // Self-consumed energy (estimated 70%)
      const selfConsumed = totalEnergy * 0.7

      // Energy lost due to faults (estimated 1%)
      const energyLostFaults = totalEnergy * 0.01

      // Energy lost due to weather (estimated 5%)
      const energyLostWeather = totalEnergy * 0.05

      result.push({
        project: {
          id: project.id,
          name: project.name,
          nameAr: project.nameAr,
          code: project.code,
          projectType: project.projectType,
          status: project.status,
          city: project.city,
          capacityKwp: project.capacityKwp,
          currency: project.currency,
          tariffRetail: project.tariffRetail,
          tariffFeedIn: project.tariffFeedIn,
          commissionedAt: project.commissionedAt,
          operationalDays,
        },
        energy: {
          daily: Math.round(dailyEnergy),
          monthly: Math.round(monthlyEnergy),
          yearly: Math.round(yearlyEnergy),
          lifetime: Math.round(totalEnergy),
          currentPower: Math.round(currentPower),
          maxPower: Math.round(maxPower),
          expectedDaily: Math.round(expectedEnergyDaily),
          expectedMonthly: Math.round(expectedEnergyMonthly),
          expectedYearly: Math.round(expectedEnergyYearly),
          expectedLifetime: Math.round(expectedEnergyLifetime),
          achievementRate: Math.round(achievementRate * 10) / 10,
        },
        performance: {
          performanceRatio: Math.round(performanceRatio * 10) / 10,
          specificYield: Math.round(specificYield * 10) / 10,
          availability: Math.round(availability * 10) / 10,
          capacityFactor: Math.round(capacityFactor * 10) / 10,
          operatingHours: Math.round(operatingHours),
          downtimeHours: Math.round(downtimeHours),
        },
        energyFlow: {
          exportedToGrid: Math.round(energyExported),
          selfConsumed: Math.round(selfConsumed),
          lostDueToFaults: Math.round(energyLostFaults),
          lostDueToWeather: Math.round(energyLostWeather),
        },
      })
    }

    // Aggregate stats
    const stats = {
      totalProjects: result.length,
      totalCapacityKwp: projects.reduce((s, p) => s + (p.capacityKwp || 0), 0),
      totalEnergyLifetime: result.reduce((s, p) => s + p.energy.lifetime, 0),
      totalEnergyDaily: result.reduce((s, p) => s + p.energy.daily, 0),
      totalEnergyMonthly: result.reduce((s, p) => s + p.energy.monthly, 0),
      totalEnergyYearly: result.reduce((s, p) => s + p.energy.yearly, 0),
      totalCurrentPower: result.reduce((s, p) => s + p.energy.currentPower, 0),
      totalMaxPower: result.reduce((s, p) => s + p.energy.maxPower, 0),
      totalExported: result.reduce((s, p) => s + p.energyFlow.exportedToGrid, 0),
      totalSelfConsumed: result.reduce((s, p) => s + p.energyFlow.selfConsumed, 0),
      averagePR: result.length > 0 ? result.reduce((s, p) => s + p.performance.performanceRatio, 0) / result.length : 0,
      averageAvailability: result.length > 0 ? result.reduce((s, p) => s + p.performance.availability, 0) / result.length : 0,
      averageCapacityFactor: result.length > 0 ? result.reduce((s, p) => s + p.performance.capacityFactor, 0) / result.length : 0,
      averageAchievementRate: result.length > 0 ? result.reduce((s, p) => s + p.energy.achievementRate, 0) / result.length : 0,
    }

    return NextResponse.json({ projects: result, stats })
  } catch (error) {
    console.error('Energy performance API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

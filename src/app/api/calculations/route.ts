import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Grid emission factors (kg CO2e per kWh) - Saudi Arabia, location-based
const GRID_EMISSION_FACTORS: Record<string, { factor: number; source: string; validFrom: string }> = {
  SA: { factor: 0.432, source: 'Saudi Electricity Company - 2024', validFrom: '2024-01-01' },
  AE: { factor: 0.401, source: 'UAE Ministry of Energy - 2024', validFrom: '2024-01-01' },
  default: { factor: 0.432, source: 'Default Saudi Grid - 2024', validFrom: '2024-01-01' },
}

const TREE_FACTOR = 21 // kg CO2 per tree per year (EPA)
const CAR_FACTOR = 0.12 // kg CO2 per km (average passenger car)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    const where = projectId ? { projectId } : {}
    const runs = await db.calculationRun.findMany({
      where,
      include: { project: { select: { name: true, nameAr: true, code: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ calculationRuns: runs })
  } catch (error) {
    console.error('Calculations API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { projectId, periodStart, periodEnd, methodologyVersion } = body

    if (!projectId || !periodStart || !periodEnd) {
      return NextResponse.json({ error: 'projectId, periodStart, periodEnd required' }, { status: 400 })
    }

    const project = await db.project.findUnique({
      where: { id: projectId },
      include: { assets: { include: { solarProfile: true } } },
    })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    // Fetch readings in the period
    const readings = await db.energyReading.findMany({
      where: {
        projectId,
        metricType: 'energy_export_kwh',
        measuredAt: { gte: new Date(periodStart), lte: new Date(periodEnd) },
        qualityStatus: { in: ['validated', 'approved'] },
      },
      orderBy: { measuredAt: 'asc' },
    })

    const totalEnergyKwh = readings.reduce((s, r) => s + r.value, 0)

    // Carbon avoided (location-based)
    const country = project.country || 'SA'
    const emissionFactor = GRID_EMISSION_FACTORS[country] || GRID_EMISSION_FACTORS.default
    const totalCo2AvoidedKg = totalEnergyKwh * emissionFactor.factor

    // Financial savings
    const selfConsumptionRate = 0.7 // 70% self-consumed, 30% exported
    const selfConsumedKwh = totalEnergyKwh * selfConsumptionRate
    const exportedKwh = totalEnergyKwh * (1 - selfConsumptionRate)
    const totalSavings = selfConsumedKwh * (project.tariffRetail || 0.18) + exportedKwh * (project.tariffFeedIn || 0.10)

    // Performance metrics
    const capacityKwp = project.capacityKwp || 0
    const specificYield = capacityKwp > 0 ? totalEnergyKwh / capacityKwp : 0
    const days = (new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / (1000 * 60 * 60 * 24)
    const referenceYield = days * 5.5 // peak sun hours average
    const performanceRatio = referenceYield > 0 && capacityKwp > 0 ? (totalEnergyKwh / capacityKwp) / referenceYield : 0
    const availability = 0.985 // placeholder

    // Equivalences
    const treeEquivalent = totalCo2AvoidedKg / TREE_FACTOR
    const carKmAvoided = totalCo2AvoidedKg / CAR_FACTOR

    // Hash of inputs
    const crypto = await import('crypto')
    const parametersHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ projectId, periodStart, periodEnd, methodologyVersion, emissionFactor }))
      .digest('hex')

    const run = await db.calculationRun.create({
      data: {
        projectId,
        runType: 'comprehensive',
        status: 'completed',
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        methodologyVersion: methodologyVersion || 'ghg_protocol_scope2_v1.2',
        parametersHash,
        result: JSON.stringify({
          emissionFactor,
          tariffRetail: project.tariffRetail,
          tariffFeedIn: project.tariffFeedIn,
          selfConsumptionRate,
          treeEquivalent: Math.round(treeEquivalent),
          carKmAvoided: Math.round(carKmAvoided),
        }),
        totalEnergyKwh: Math.round(totalEnergyKwh * 100) / 100,
        totalCo2AvoidedKg: Math.round(totalCo2AvoidedKg * 100) / 100,
        totalSavings: Math.round(totalSavings * 100) / 100,
        performanceRatio: Math.round(performanceRatio * 1000) / 1000,
        availability,
        completedAt: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      run,
      details: {
        totalEnergyKwh,
        totalCo2AvoidedKg,
        totalSavings,
        specificYield,
        performanceRatio,
        availability,
        treeEquivalent: Math.round(treeEquivalent),
        carKmAvoided: Math.round(carKmAvoided),
        emissionFactor,
        selfConsumedKwh,
        exportedKwh,
        readingsCount: readings.length,
      },
    })
  } catch (error) {
    console.error('Run calculation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

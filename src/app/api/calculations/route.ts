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

    // Fetch comprehensive KPI data
    const allProjects = await db.project.findMany({
      select: {
        id: true,
        name: true,
        nameAr: true,
        code: true,
        projectType: true,
        capacityKwp: true,
        currency: true,
        tariffRetail: true,
        treeSpecies: true,
        treeCount: true,
        plantedAreaM2: true,
        survivalRateTarget: true,
        plantingDate: true,
      },
    })

    const allReadings = await db.energyReading.findMany({
      where: { qualityStatus: { in: ['validated', 'approved', 'corrected'] } },
      select: { value: true, measuredAt: true, projectId: true, qualityStatus: true, validationStatus: true },
    })

    // Calculate KPIs by category
    const totalEnergy = allReadings.reduce((s, r) => s + r.value, 0)
    const emissionFactor = 0.432
    const totalCo2Avoided = totalEnergy * emissionFactor

    // Energy KPIs
    const energyExported = totalEnergy * 0.3
    const energyImported = 0 // not tracked yet
    const selfConsumption = totalEnergy * 0.7
    const renewableFraction = totalEnergy > 0 ? 100 : 0

    // Carbon KPIs
    const co2Avoided = totalCo2Avoided
    const co2Stored = 0 // for storage projects
    const co2Sequestered = allProjects
      .filter((p) => p.projectType === 'afforestation')
      .reduce((s, p) => {
        const treeFactor = p.treeSpecies === 'السدر (Ziziphus spina-christi)' ? 22 : 21
        const alive = Math.round((p.treeCount || 0) * (p.survivalRateTarget || 0.85))
        const years = p.plantingDate ? (Date.now() - p.plantingDate.getTime()) / (1000 * 60 * 60 * 24 * 365) : 0
        return s + alive * treeFactor * Math.max(years, 0)
      }, 0)
    const carbonIntensity = totalEnergy > 0 ? totalCo2Avoided / totalEnergy : 0

    // Water KPIs (estimated for solar: 0 liters vs thermal plants)
    const waterSaved = totalEnergy * 1.5 // 1.5 liters per kWh saved vs thermal
    const waterConsumed = totalEnergy * 0.02 // minimal water for cleaning panels

    // Waste KPIs (estimated)
    const wasteDiverted = 0
    const wasteRecycled = 0

    // Afforestation KPIs
    const treesPlanted = allProjects
      .filter((p) => p.projectType === 'afforestation')
      .reduce((s, p) => s + (p.treeCount || 0), 0)
    const survivalRate = allProjects.filter((p) => p.projectType === 'afforestation').length > 0
      ? allProjects
          .filter((p) => p.projectType === 'afforestation')
          .reduce((s, p) => s + (p.survivalRateTarget || 0.85), 0) / allProjects.filter((p) => p.projectType === 'afforestation').length
      : 0
    const biomass = allProjects
      .filter((p) => p.projectType === 'afforestation')
      .reduce((s, p) => {
        const alive = Math.round((p.treeCount || 0) * (p.survivalRateTarget || 0.85))
        const years = p.plantingDate ? (Date.now() - p.plantingDate.getTime()) / (1000 * 60 * 60 * 24 * 365) : 0
        return s + alive * 50 * Math.max(years, 0)
      }, 0)
    const carbonStock = co2Sequestered
    const carbonSequestration = allProjects
      .filter((p) => p.projectType === 'afforestation')
      .reduce((s, p) => {
        const treeFactor = p.treeSpecies === 'السدر (Ziziphus spina-christi)' ? 22 : 21
        const alive = Math.round((p.treeCount || 0) * (p.survivalRateTarget || 0.85))
        return s + alive * treeFactor
      }, 0)

    // Biodiversity KPIs (estimated for afforestation)
    const restoredArea = allProjects
      .filter((p) => p.projectType === 'afforestation')
      .reduce((s, p) => s + (p.plantedAreaM2 || 0) / 10000, 0) // hectares
    const protectedArea = 0
    const habitatIndex = restoredArea > 0 ? Math.min(100, restoredArea * 10) : 0
    const speciesCount = new Set(
      allProjects
        .filter((p) => p.projectType === 'afforestation')
        .map((p) => p.treeSpecies)
        .filter(Boolean),
    ).size

    // Economy KPIs
    const costSavings = allProjects.reduce((s, p) => {
      const projectEnergy = allReadings.filter((r) => r.projectId === p.id).reduce((sum, r) => sum + r.value, 0)
      return s + projectEnergy * (p.tariffRetail || 0.18)
    }, 0)
    const greenInvestment = allProjects.reduce((s, p) => s + (p.capacityKwp || 0) * 3000, 0) // ~3000 SAR/kWp CAPEX
    const costPerTCo2e = totalCo2Avoided > 0 ? greenInvestment / (totalCo2Avoided / 1000) : 0
    const costPerKwh = totalEnergy > 0 ? greenInvestment / totalEnergy : 0

    // Data Quality KPIs
    const totalReadingsCount = allReadings.length
    const validatedCount = allReadings.filter((r) => r.qualityStatus === 'validated' || r.qualityStatus === 'approved').length
    const completeness = totalReadingsCount > 0 ? (validatedCount / totalReadingsCount) * 100 : 0
    const accuracy = 95.5 // estimated
    const timeliness = 92.0 // estimated
    const validationRate = totalReadingsCount > 0 ? (validatedCount / totalReadingsCount) * 100 : 0

    // Attestation KPIs
    const attestationCount = await db.attestationBatch.count({ where: { status: 'confirmed' } })
    const totalReadingsDb = await db.energyReading.count()
    const attestedItems = await db.attestationBatch.aggregate({
      where: { status: 'confirmed' },
      _sum: { itemCount: true },
    })
    const verifiedDataPercent = totalReadingsDb > 0 ? Math.min(100, ((attestedItems._sum.itemCount || 0) / totalReadingsDb) * 100) : 0
    const traceabilityPercent = verifiedDataPercent
    const auditCoveragePercent = 87.5 // estimated

    const kpiCatalog = {
      energy: {
        energyGenerated: Math.round(totalEnergy),
        energyExported: Math.round(energyExported),
        energyImported: Math.round(energyImported),
        selfConsumption: Math.round(selfConsumption),
        renewableFraction: Math.round(renewableFraction * 10) / 10,
      },
      carbon: {
        co2Avoided: Math.round(co2Avoided),
        co2Stored: Math.round(co2Stored),
        co2Sequestered: Math.round(co2Sequestered),
        carbonIntensity: Math.round(carbonIntensity * 1000) / 1000,
      },
      water: {
        waterSaved: Math.round(waterSaved),
        waterConsumed: Math.round(waterConsumed),
      },
      waste: {
        wasteDiverted: Math.round(wasteDiverted),
        wasteRecycled: Math.round(wasteRecycled),
      },
      afforestation: {
        treesPlanted,
        survivalRate: Math.round(survivalRate * 100),
        biomass: Math.round(biomass),
        carbonStock: Math.round(carbonStock),
        carbonSequestration: Math.round(carbonSequestration),
      },
      biodiversity: {
        restoredArea: Math.round(restoredArea * 100) / 100,
        protectedArea: Math.round(protectedArea * 100) / 100,
        habitatIndex: Math.round(habitatIndex),
        speciesCount,
      },
      economy: {
        costSavings: Math.round(costSavings),
        greenInvestment: Math.round(greenInvestment),
        costPerTCo2e: Math.round(costPerTCo2e),
        costPerKwh: Math.round(costPerKwh * 100) / 100,
      },
      dataQuality: {
        completeness: Math.round(completeness * 10) / 10,
        accuracy: Math.round(accuracy * 10) / 10,
        timeliness: Math.round(timeliness * 10) / 10,
        validationRate: Math.round(validationRate * 10) / 10,
      },
      attestation: {
        verifiedDataPercent: Math.round(verifiedDataPercent * 10) / 10,
        traceabilityPercent: Math.round(traceabilityPercent * 10) / 10,
        auditCoveragePercent: Math.round(auditCoveragePercent * 10) / 10,
        attestationCount,
      },
    }

    return NextResponse.json({ calculationRuns: runs, kpiCatalog })
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

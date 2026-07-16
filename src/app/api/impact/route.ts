import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Grid emission factors by country (kg CO2e per kWh) - location-based
const GRID_EMISSION_FACTORS: Record<string, { factor: number; source: string; version: string; type: string }> = {
  SA: { factor: 0.432, source: 'Saudi Electricity Company - 2024', version: 'v1.2-2024', type: 'location-based' },
  AE: { factor: 0.401, source: 'UAE Ministry of Energy - 2024', version: 'v1.1-2024', type: 'location-based' },
  QA: { factor: 0.410, source: 'Qatar General Electricity - 2024', version: 'v1.0-2024', type: 'location-based' },
  KW: { factor: 0.520, source: 'Kuwait Ministry of Electricity - 2024', version: 'v1.0-2024', type: 'location-based' },
  BH: { factor: 0.470, source: 'Bahrain Electricity Authority - 2024', version: 'v1.0-2024', type: 'location-based' },
  OM: { factor: 0.480, source: 'Oman Authority for Electricity - 2024', version: 'v1.0-2024', type: 'location-based' },
  EG: { factor: 0.450, source: 'Egyptian Electricity Holding - 2024', version: 'v1.0-2024', type: 'location-based' },
  JO: { factor: 0.480, source: 'Jordan Ministry of Energy - 2024', version: 'v1.0-2024', type: 'location-based' },
  PS: { factor: 0.450, source: 'Palestinian Energy Authority - 2024', version: 'v1.0-2024', type: 'location-based' },
  default: { factor: 0.432, source: 'Default Saudi Grid - 2024', version: 'v1.2-2024', type: 'location-based' },
}

// Fossil fuel equivalents per kWh
const DIESEL_LITER_PER_KWH = 0.083 // 1 kWh ≈ 0.083 liter diesel
const NATURAL_GAS_M3_PER_KWH = 0.095 // 1 kWh ≈ 0.095 m³ natural gas

// Tree absorption factors (kg CO2 per tree per year)
const TREE_ABSORPTION_FACTORS: Record<string, number> = {
  'السدر (Ziziphus spina-christi)': 22,
  'الغاف (Prosopis cineraria)': 18,
  'الأثل (Tamarix)': 15,
  'السمر (Acacia tortilis)': 20,
  'العرعر (Juniperus)': 12,
  'الزيتون (Olea europaea)': 25,
  'النخيل (Phoenix dactylifera)': 30,
  'اللوز (Prunus dulcis)': 20,
  default: 21, // EPA average
}

export async function GET() {
  try {
    const accounts = await db.impactAccount.findMany({
      include: {
        organization: { select: { name: true, nameAr: true, code: true } },
        impactUnits: {
          include: { project: { select: { name: true, nameAr: true, code: true, projectType: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    // Fetch all projects with their details for calculations
    const allProjects = await db.project.findMany({
      select: {
        id: true,
        name: true,
        nameAr: true,
        code: true,
        projectType: true,
        status: true,
        country: true,
        city: true,
        capacityKwp: true,
        currency: true,
        commissionedAt: true,
        // Afforestation fields
        treeSpecies: true,
        treeCount: true,
        plantedAreaM2: true,
        plantingDate: true,
        survivalRateTarget: true,
        iotSensorType: true,
        iotSensorSerial: true,
        _count: { select: { readings: true, devices: true } },
      },
    })

    // Fetch all readings for carbon calculations
    const allReadings = await db.energyReading.findMany({
      where: { metricType: 'energy_export_kwh', qualityStatus: { in: ['validated', 'approved', 'corrected'] } },
      select: {
        value: true,
        measuredAt: true,
        projectId: true,
      },
      orderBy: { measuredAt: 'asc' },
    })

    // Calculate carbon avoided per project
    const projectCarbonMap = new Map<string, any>()
    const now = new Date()

    for (const project of allProjects) {
      const projectReadings = allReadings.filter((r) => r.projectId === project.id)
      const totalEnergy = projectReadings.reduce((s, r) => s + r.value, 0)

      // Determine country code (project.country may be full name)
      const countryCode = (project.country || 'SA').substring(0, 2).toUpperCase()
      const emissionFactor = GRID_EMISSION_FACTORS[countryCode] || GRID_EMISSION_FACTORS.default

      // Carbon avoided (kg CO2e)
      const totalCo2AvoidedKg = totalEnergy * emissionFactor.factor

      // Time-based breakdown
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const yearStart = new Date(now.getFullYear(), 0, 1)

      let dailyEnergy = 0, monthlyEnergy = 0, yearlyEnergy = 0
      for (const r of projectReadings) {
        if (r.measuredAt >= today) dailyEnergy += r.value
        if (r.measuredAt >= monthStart) monthlyEnergy += r.value
        if (r.measuredAt >= yearStart) yearlyEnergy += r.value
      }

      // Operational lifetime (from commissionedAt)
      const operationalDays = project.commissionedAt
        ? Math.floor((now.getTime() - project.commissionedAt.getTime()) / (1000 * 60 * 60 * 24))
        : 0

      // Fossil fuel equivalents
      const dieselReplaced = totalEnergy * DIESEL_LITER_PER_KWH
      const gasReplaced = totalEnergy * NATURAL_GAS_M3_PER_KWH

      // Renewable energy percentage (vs grid)
      const renewablePercentage = totalEnergy > 0 ? 100 : 0 // simplified

      // Carbon intensity (kg CO2e per kWh)
      const carbonIntensity = totalEnergy > 0 ? totalCo2AvoidedKg / totalEnergy : 0

      // Baseline comparison (grid would produce this much CO2)
      const baselineEmissions = totalEnergy * emissionFactor.factor // same as avoided for solar
      const avoidanceRate = baselineEmissions > 0 ? (totalCo2AvoidedKg / baselineEmissions) * 100 : 0

      // Afforestation-specific metrics
      let afforestationMetrics: any = null
      if (project.projectType === 'afforestation' && project.treeCount) {
        const treeFactor = TREE_ABSORPTION_FACTORS[project.treeSpecies || ''] || TREE_ABSORPTION_FACTORS.default
        const plantedTrees = project.treeCount
        const survivalRate = project.survivalRateTarget || 0.85
        const aliveTrees = Math.round(plantedTrees * survivalRate)
        const lostTrees = plantedTrees - aliveTrees

        // Carbon stored (kg CO2) - cumulative
        const yearsSincePlanting = project.plantingDate
          ? (now.getTime() - project.plantingDate.getTime()) / (1000 * 60 * 60 * 24 * 365)
          : 0
        const carbonStoredPerTree = treeFactor * Math.max(yearsSincePlanting, 0)
        const totalCarbonStored = aliveTrees * carbonStoredPerTree

        // Annual absorption
        const annualCarbonAbsorbed = aliveTrees * treeFactor

        // Area in hectares
        const plantedAreaHa = project.plantedAreaM2 ? project.plantedAreaM2 / 10000 : 0
        const absorptionPerHectare = plantedAreaHa > 0 ? annualCarbonAbsorbed / plantedAreaHa : 0
        const absorptionPerTree = treeFactor

        // Tree density (trees per hectare)
        const treeDensity = plantedAreaHa > 0 ? plantedTrees / plantedAreaHa : 0

        // Average tree age (years)
        const averageTreeAge = yearsSincePlanting

        // Estimated biomass (kg) - rough estimate: 50 kg per tree per year
        const biomassPerTree = 50 * Math.max(yearsSincePlanting, 0)
        const totalBiomass = aliveTrees * biomassPerTree

        // Growth rate (cm/year) - estimated
        const growthRate = 25 // cm per year average for young trees

        // Irrigation count (estimated based on age)
        const irrigationCount = Math.floor(yearsSincePlanting * 52) // weekly irrigation

        // Site visits (estimated)
        const siteVisits = Math.floor(yearsSincePlanting * 12) // monthly visits

        // Health score (0-100) - based on survival rate
        const healthScore = Math.round(survivalRate * 100)

        afforestationMetrics = {
          plantedTrees,
          aliveTrees,
          lostTrees,
          survivalRate: Math.round(survivalRate * 100),
          plantedAreaHa: Math.round(plantedAreaHa * 100) / 100,
          treeDensity: Math.round(treeDensity),
          averageTreeAge: Math.round(yearsSincePlanting * 10) / 10,
          growthRate,
          estimatedBiomass: Math.round(totalBiomass),
          carbonStored: Math.round(totalCarbonStored),
          annualCarbonAbsorbed: Math.round(annualCarbonAbsorbed),
          totalCarbonAbsorbed: Math.round(totalCarbonStored + annualCarbonAbsorbed * Math.max(yearsSincePlanting, 0)),
          absorptionPerHectare: Math.round(absorptionPerHectare),
          absorptionPerTree,
          irrigationCount,
          siteVisits,
          healthScore,
          treeSpecies: project.treeSpecies,
          iotSensor: project.iotSensorType ? {
            type: project.iotSensorType,
            serial: project.iotSensorSerial,
          } : null,
        }
      }

      projectCarbonMap.set(project.id, {
        projectId: project.id,
        projectName: project.nameAr || project.name,
        projectCode: project.code,
        projectType: project.projectType,
        status: project.status,
        country: project.country,
        city: project.city,
        capacityKwp: project.capacityKwp,
        currency: project.currency,
        commissionedAt: project.commissionedAt,
        operationalDays,
        // Carbon avoided
        carbonAvoided: {
          daily: {
            kgCO2e: Math.round(dailyEnergy * emissionFactor.factor),
            tCO2e: Math.round((dailyEnergy * emissionFactor.factor) / 1000 * 100) / 100,
          },
          monthly: {
            kgCO2e: Math.round(monthlyEnergy * emissionFactor.factor),
            tCO2e: Math.round((monthlyEnergy * emissionFactor.factor) / 1000 * 100) / 100,
          },
          yearly: {
            kgCO2e: Math.round(yearlyEnergy * emissionFactor.factor),
            tCO2e: Math.round((yearlyEnergy * emissionFactor.factor) / 1000 * 100) / 100,
          },
          lifetime: {
            kgCO2e: Math.round(totalCo2AvoidedKg),
            tCO2e: Math.round((totalCo2AvoidedKg / 1000) * 100) / 100,
          },
        },
        // Emission factor details
        emissionFactor: {
          value: emissionFactor.factor,
          unit: 'kgCO₂e/kWh',
          source: emissionFactor.source,
          version: emissionFactor.version,
          type: emissionFactor.type,
        },
        // Energy
        energy: {
          daily: Math.round(dailyEnergy),
          monthly: Math.round(monthlyEnergy),
          yearly: Math.round(yearlyEnergy),
          lifetime: Math.round(totalEnergy),
        },
        // Additional indicators
        fossilFuelReplaced: {
          dieselLiters: Math.round(dieselReplaced),
          naturalGasM3: Math.round(gasReplaced),
        },
        traditionalElectricityReplaced: Math.round(totalEnergy),
        renewablePercentage: Math.round(renewablePercentage),
        carbonIntensity: Math.round(carbonIntensity * 1000) / 1000,
        baselineComparison: {
          baselineEmissions: Math.round(baselineEmissions),
          avoidedEmissions: Math.round(totalCo2AvoidedKg),
          avoidanceRate: Math.round(avoidanceRate),
        },
        // Afforestation metrics (null for non-afforestation projects)
        afforestation: afforestationMetrics,
      })
    }

    // Aggregate stats
    const solarProjects = allProjects.filter((p) => p.projectType !== 'afforestation')
    const afforestationProjects = allProjects.filter((p) => p.projectType === 'afforestation')

    const totalEnergy = allReadings.reduce((s, r) => s + r.value, 0)
    const defaultFactor = GRID_EMISSION_FACTORS.default
    const totalCo2Avoided = totalEnergy * defaultFactor.factor

    // Aggregate afforestation stats
    const totalPlantedTrees = afforestationProjects.reduce((s, p) => s + (p.treeCount || 0), 0)
    const totalAliveTrees = afforestationProjects.reduce((s, p) => s + Math.round((p.treeCount || 0) * (p.survivalRateTarget || 0.85)), 0)
    const totalPlantedAreaHa = afforestationProjects.reduce((s, p) => s + (p.plantedAreaM2 || 0) / 10000, 0)

    const totalCarbonAbsorbed = afforestationProjects.reduce((s, p) => {
      const treeFactor = TREE_ABSORPTION_FACTORS[p.treeSpecies || ''] || TREE_ABSORPTION_FACTORS.default
      const alive = Math.round((p.treeCount || 0) * (p.survivalRateTarget || 0.85))
      const years = p.plantingDate ? (now.getTime() - p.plantingDate.getTime()) / (1000 * 60 * 60 * 24 * 365) : 0
      return s + alive * treeFactor * Math.max(years, 0)
    }, 0)

    const annualCarbonAbsorbed = afforestationProjects.reduce((s, p) => {
      const treeFactor = TREE_ABSORPTION_FACTORS[p.treeSpecies || ''] || TREE_ABSORPTION_FACTORS.default
      const alive = Math.round((p.treeCount || 0) * (p.survivalRateTarget || 0.85))
      return s + alive * treeFactor
    }, 0)

    const stats = {
      // Carbon stats
      totalBalance: accounts.reduce((s, a) => s + a.balance, 0),
      totalEnergyLifetime: Math.round(totalEnergy),
      totalCo2AvoidedKg: Math.round(totalCo2Avoided),
      totalCo2AvoidedTons: Math.round((totalCo2Avoided / 1000) * 100) / 100,
      totalIssued: accounts.reduce((s, a) => s + (a.impactUnits || []).filter((u) => u.status === 'issued' || u.status === 'verified').reduce((sum, u) => sum + u.amount, 0), 0),
      totalRetired: accounts.reduce((s, a) => s + (a.impactUnits || []).filter((u) => u.status === 'retired').reduce((sum, u) => sum + u.amount, 0), 0),
      totalCancelled: accounts.reduce((s, a) => s + (a.impactUnits || []).filter((u) => u.status === 'cancelled').reduce((sum, u) => sum + u.amount, 0), 0),
      totalEstimated: accounts.reduce((s, a) => s + (a.impactUnits || []).filter((u) => u.status === 'estimated').reduce((sum, u) => sum + u.amount, 0), 0),
      // Fossil fuel replaced
      totalDieselReplaced: Math.round(totalEnergy * DIESEL_LITER_PER_KWH),
      totalGasReplaced: Math.round(totalEnergy * NATURAL_GAS_M3_PER_KWH),
      // Afforestation stats
      afforestation: {
        totalProjects: afforestationProjects.length,
        totalPlantedTrees,
        totalAliveTrees,
        totalLostTrees: totalPlantedTrees - totalAliveTrees,
        averageSurvivalRate: totalPlantedTrees > 0 ? Math.round((totalAliveTrees / totalPlantedTrees) * 100) : 0,
        totalPlantedAreaHa: Math.round(totalPlantedAreaHa * 100) / 100,
        totalCarbonStored: Math.round(totalCarbonAbsorbed),
        annualCarbonAbsorbed: Math.round(annualCarbonAbsorbed),
        totalCarbonAbsorbed: Math.round(totalCarbonAbsorbed + annualCarbonAbsorbed),
      },
      // Project counts
      solarProjectsCount: solarProjects.length,
      afforestationProjectsCount: afforestationProjects.length,
    }

    return NextResponse.json({
      accounts: accounts.map((acc) => {
        const units = acc.impactUnits
        const byStatus = units.reduce(
          (map, u) => {
            map[u.status] = (map[u.status] || 0) + u.amount
            return map
          },
          {} as Record<string, number>,
        )

        return {
          id: acc.id,
          name: acc.name,
          accountType: acc.accountType,
          balance: acc.balance,
          unit: acc.unit,
          organization: acc.organization,
          unitsCount: units.length,
          byStatus,
          recentUnits: units.slice(0, 10).map((u) => ({
            id: u.id,
            project: u.project,
            amount: u.amount,
            unit: u.unit,
            status: u.status,
            periodStart: u.periodStart,
            periodEnd: u.periodEnd,
            methodologyVersion: u.methodologyVersion,
            createdAt: u.createdAt,
            retiredAt: u.retiredAt,
          })),
        }
      }),
      projectCarbon: Array.from(projectCarbonMap.values()),
      stats,
      emissionFactors: GRID_EMISSION_FACTORS,
    })
  } catch (error) {
    console.error('Impact API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

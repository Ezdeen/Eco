import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, projectScopeFilter } from '@/lib/authorization'
import { getEmissionFactor, getConversionFactor } from '@/lib/reference-data'

// Tree absorption factors (kg CO2 per tree per year), by species.
// IMPORTANT: unlike the grid emission factor above, there is currently no
// per-species reference table in the database (ConversionFactor only stores
// one generic 'tree_co2' value - see getConversionFactor in reference-data.ts).
// These per-species numbers are therefore hardcoded estimates, not values
// backed by an approved reference row, and are labelled as such
// (`fromApprovedReference: false`) everywhere they're used below. The generic
// 'default' fallback here is replaced with the real getConversionFactor
// ('tree_co2') value at request time so at least the fallback case matches
// the rest of the system.
const TREE_ABSORPTION_FACTORS: Record<string, number> = {
  'السدر (Ziziphus spina-christi)': 22,
  'الغاف (Prosopis cineraria)': 18,
  'الأثل (Tamarix)': 15,
  'السمر (Acacia tortilis)': 20,
  'العرعر (Juniperus)': 12,
  'الزيتون (Olea europaea)': 25,
  'النخيل (Phoenix dactylifera)': 30,
  'اللوز (Prunus dulcis)': 20,
}

export async function GET() {
  try {
    const auth = await requireAuth()
    if (!auth.authorized) return auth.response
    const { user } = auth

    // IMPORTANT FIX: this entire endpoint previously had no organization/project
    // scoping at all - impactAccount, project, and energyReading were all
    // fetched with no `where` filter, so every user on the platform saw every
    // organization's impact ledger, projects, and readings combined. Scoped
    // below to this user's own organization (and, for project_manager users,
    // to only their assigned projects via projectScopeFilter).
    const scope = projectScopeFilter(user)

    const accounts = await db.impactAccount.findMany({
      where: { organizationId: user.organizationId! },
      include: {
        organization: { select: { name: true, nameAr: true, code: true } },
        impactUnits: {
          include: { project: { select: { name: true, nameAr: true, code: true, projectType: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    // Fetch this organization's (scoped) projects with their details for calculations
    const allProjects = await db.project.findMany({
      where: { organizationId: user.organizationId!, ...scope },
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

    // Fetch readings only for this organization's own (scoped) projects
    const allReadings = await db.energyReading.findMany({
      where: {
        projectId: { in: allProjects.map((p) => p.id) },
        metricType: 'energy_export_kwh',
        qualityStatus: { in: ['validated', 'approved', 'corrected'] },
      },
      select: {
        value: true,
        measuredAt: true,
        projectId: true,
      },
      orderBy: { measuredAt: 'asc' },
    })

    // Real reference-table conversion factors, fetched once (not per-project),
    // replacing the previously hardcoded DIESEL_LITER_PER_KWH / NATURAL_GAS_M3_PER_KWH
    // constants and matching what src/app/api/calculations/route.ts already uses.
    const dieselFactorData = await getConversionFactor('diesel_per_kwh')
    const gasFactorData = await getConversionFactor('gas_per_kwh')
    const genericTreeFactorData = await getConversionFactor('tree_co2') // fallback for species not in TREE_ABSORPTION_FACTORS

    // Real per-country emission factors, fetched once per distinct country
    // present in this organization's projects (not per-project, to avoid
    // redundant DB round-trips), replacing the hardcoded GRID_EMISSION_FACTORS map.
    const distinctCountryCodes: string[] = []
    for (const p of allProjects) {
      const code: string = (p.country || 'SA').substring(0, 2).toUpperCase()
      if (!distinctCountryCodes.includes(code)) distinctCountryCodes.push(code)
    }
    const emissionFactorByCountry = new Map<string, Awaited<ReturnType<typeof getEmissionFactor>>>()
    for (const code of distinctCountryCodes) {
      const factor: Awaited<ReturnType<typeof getEmissionFactor>> = await getEmissionFactor(code)
      emissionFactorByCountry.set(code, factor)
    }

    // Calculate carbon avoided per project
    const projectCarbonMap = new Map<string, any>()
    const now = new Date()

    for (const project of allProjects) {
      const projectReadings = allReadings.filter((r) => r.projectId === project.id)
      const totalEnergy = projectReadings.reduce((s, r) => s + r.value, 0)

      // Determine country code (project.country may be full name) and use the
      // real reference-table emission factor for that country (same source as
      // the dashboard/calculations endpoints), instead of the hardcoded map.
      const countryCode = (project.country || 'SA').substring(0, 2).toUpperCase()
      const emissionFactor = emissionFactorByCountry.get(countryCode)!

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
      const dieselReplaced = totalEnergy * dieselFactorData.value
      const gasReplaced = totalEnergy * gasFactorData.value

      // Renewable energy percentage (vs grid)
      // Simplified: assumes 100% renewable whenever the project has any solar
      // export energy at all, even for 'hybrid' projects that may also draw
      // from a non-renewable source. A precise figure would require actual
      // import/grid-draw readings (see the real import-vs-export split added
      // in src/app/api/energy-performance/route.ts) broken down by source,
      // which this endpoint does not currently have for hybrid projects.
      const renewablePercentage = totalEnergy > 0 ? 100 : 0

      // Carbon intensity (kg CO2e per kWh)
      const carbonIntensity = totalEnergy > 0 ? totalCo2AvoidedKg / totalEnergy : 0

      // Baseline comparison (grid would produce this much CO2)
      const baselineEmissions = totalEnergy * emissionFactor.factor // same as avoided for solar
      const avoidanceRate = baselineEmissions > 0 ? (totalCo2AvoidedKg / baselineEmissions) * 100 : 0

      // Afforestation-specific metrics
      let afforestationMetrics: any = null
      if (project.projectType === 'afforestation' && project.treeCount) {
        // treeFactor: per-species value from the hardcoded TREE_ABSORPTION_FACTORS
        // map when the species is recognized, otherwise the generic
        // getConversionFactor('tree_co2') reference value. NEITHER of these is
        // backed by an approved, species-specific reference row in the database
        // today - see the comment on TREE_ABSORPTION_FACTORS above. This is
        // surfaced explicitly via treeFactorSource/fromApprovedReference below
        // rather than presented as a measured figure.
        const knownSpeciesFactor = TREE_ABSORPTION_FACTORS[project.treeSpecies || '']
        const treeFactor = knownSpeciesFactor ?? genericTreeFactorData.value
        const treeFactorSource = knownSpeciesFactor !== undefined
          ? `estimate for species "${project.treeSpecies}" (not from an approved reference table)`
          : `${genericTreeFactorData.source} (generic fallback, species not recognized)`

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

        // Average tree age (years) - derived from the real plantingDate, not estimated
        const averageTreeAge = yearsSincePlanting

        // --- Everything below this line is a rough, undisclosed-until-now
        // estimate with no real sensor or field-record backing it, despite
        // the project having real IoT sensor fields (iotSensorType/Serial)
        // that go unused here. Each is now explicitly flagged as estimated
        // in the response instead of being presented as measured data. ---

        // Estimated biomass (kg): rough industry rule-of-thumb of ~50 kg/tree/year,
        // not species-specific and not derived from any biomass measurement.
        const biomassPerTree = 50 * Math.max(yearsSincePlanting, 0)
        const totalBiomass = aliveTrees * biomassPerTree

        // Growth rate (cm/year): a single fixed industry average for young
        // trees, identical for every species - not measured per project.
        const growthRate = 25

        // Irrigation count: purely derived from tree age assuming weekly
        // irrigation (age_years * 52) - not from any real irrigation log.
        const irrigationCount = Math.floor(yearsSincePlanting * 52)

        // Site visits: purely derived from tree age assuming monthly visits
        // (age_years * 12) - not from any real visit log.
        const siteVisits = Math.floor(yearsSincePlanting * 12)

        // Health score (0-100) - based on survival rate (a real project field)
        const healthScore = Math.round(survivalRate * 100)

        afforestationMetrics = {
          plantedTrees,
          aliveTrees,
          lostTrees,
          survivalRate: Math.round(survivalRate * 100),
          plantedAreaHa: Math.round(plantedAreaHa * 100) / 100,
          treeDensity: Math.round(treeDensity),
          averageTreeAge: Math.round(yearsSincePlanting * 10) / 10,
          carbonStored: Math.round(totalCarbonStored),
          annualCarbonAbsorbed: Math.round(annualCarbonAbsorbed),
          totalCarbonAbsorbed: Math.round(totalCarbonStored + annualCarbonAbsorbed * Math.max(yearsSincePlanting, 0)),
          absorptionPerHectare: Math.round(absorptionPerHectare),
          absorptionPerTree,
          treeFactorSource,
          healthScore,
          treeSpecies: project.treeSpecies,
          iotSensor: project.iotSensorType ? {
            type: project.iotSensorType,
            serial: project.iotSensorSerial,
          } : null,
          // Explicitly-flagged rough estimates (see comments above) - not
          // measured, not from sensor data, not from field logs.
          estimated: {
            growthRateCmPerYear: growthRate,
            estimatedBiomassKg: Math.round(totalBiomass),
            irrigationCount,
            siteVisits,
            note: 'هذه القيم تقديرية (معدلات عامة تقريبية) وليست مقاسة من حساسات أو سجلات ميدانية فعلية',
          },
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
    // IMPORTANT FIX: previously this multiplied total energy across ALL
    // projects by a single hardcoded "default" emission factor, ignoring the
    // fact that each project may be in a different country with a different
    // real emission factor (as correctly computed per-project in the loop
    // above). Summing each project's own already-correct lifetime CO2 avoids
    // silently misrepresenting the portfolio total whenever projects span
    // more than one country.
    const totalCo2Avoided = Array.from(projectCarbonMap.values()).reduce(
      (s, p) => s + p.carbonAvoided.lifetime.kgCO2e,
      0,
    )

    // Aggregate afforestation stats
    const totalPlantedTrees = afforestationProjects.reduce((s, p) => s + (p.treeCount || 0), 0)
    const totalAliveTrees = afforestationProjects.reduce((s, p) => s + Math.round((p.treeCount || 0) * (p.survivalRateTarget || 0.85)), 0)
    const totalPlantedAreaHa = afforestationProjects.reduce((s, p) => s + (p.plantedAreaM2 || 0) / 10000, 0)

    const totalCarbonAbsorbed = afforestationProjects.reduce((s, p) => {
      const treeFactor = TREE_ABSORPTION_FACTORS[p.treeSpecies || ''] ?? genericTreeFactorData.value
      const alive = Math.round((p.treeCount || 0) * (p.survivalRateTarget || 0.85))
      const years = p.plantingDate ? (now.getTime() - p.plantingDate.getTime()) / (1000 * 60 * 60 * 24 * 365) : 0
      return s + alive * treeFactor * Math.max(years, 0)
    }, 0)

    const annualCarbonAbsorbed = afforestationProjects.reduce((s, p) => {
      const treeFactor = TREE_ABSORPTION_FACTORS[p.treeSpecies || ''] ?? genericTreeFactorData.value
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
      totalDieselReplaced: Math.round(totalEnergy * dieselFactorData.value),
      totalGasReplaced: Math.round(totalEnergy * gasFactorData.value),
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
      // Real per-country emission factors actually used above (one entry per
      // country present in this organization's projects), replacing the
      // previously hardcoded GRID_EMISSION_FACTORS map.
      emissionFactors: Object.fromEntries(emissionFactorByCountry),
    })
  } catch (error) {
    console.error('Impact API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

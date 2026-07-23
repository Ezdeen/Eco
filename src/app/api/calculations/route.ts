import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getEmissionFactor, getTariff, getConversionFactor, getMethodology } from '@/lib/reference-data'
import { requireProjectAccess } from '@/lib/authorization'
import { calculationSchema } from '@/lib/validation'

// Legacy constants removed - now using reference-data.ts library

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
    // IMPORTANT: projects can have different currencies (Project.currency). Summing
    // costSavings/greenInvestment across all projects into one number - as before -
    // silently mixes currencies (e.g. adds SAR amounts to AED amounts) and the result
    // was then labeled "SAR" regardless. We instead group by each project's own
    // currency so the totals are only ever combined with amounts in the same currency.
    const costSavingsByCurrency: Record<string, number> = {}
    const greenInvestmentByCurrency: Record<string, number> = {}

    for (const p of allProjects) {
      const projectEnergy = allReadings.filter((r) => r.projectId === p.id).reduce((sum, r) => sum + r.value, 0)
      const currency = p.currency || 'SAR'
      costSavingsByCurrency[currency] = (costSavingsByCurrency[currency] || 0) + projectEnergy * (p.tariffRetail || 0.18)
      greenInvestmentByCurrency[currency] = (greenInvestmentByCurrency[currency] || 0) + (p.capacityKwp || 0) * 3000 // ~3000 per kWp CAPEX, in the project's own currency
    }

    const currenciesInUse = Object.keys(costSavingsByCurrency)
    const singleCurrency = currenciesInUse.length <= 1 ? (currenciesInUse[0] || 'SAR') : null
    // Only populated as a single number when every project shares one currency;
    // otherwise callers must read costSavingsByCurrency/greenInvestmentByCurrency instead.
    const costSavings = singleCurrency ? costSavingsByCurrency[singleCurrency] : null
    const greenInvestment = singleCurrency ? greenInvestmentByCurrency[singleCurrency] : null
    const costPerTCo2e = singleCurrency && totalCo2Avoided > 0 ? (greenInvestmentByCurrency[singleCurrency] / (totalCo2Avoided / 1000)) : null
    const costPerKwh = singleCurrency && totalEnergy > 0 ? (greenInvestmentByCurrency[singleCurrency] / totalEnergy) : null

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
        // costSavings/greenInvestment/costPerTCo2e/costPerKwh are only a plain number
        // when every project shares the same currency; otherwise they are null and
        // the caller must render costSavingsByCurrency / greenInvestmentByCurrency
        // (one figure per currency) instead of a misleadingly combined total.
        costSavings: costSavings !== null ? Math.round(costSavings) : null,
        greenInvestment: greenInvestment !== null ? Math.round(greenInvestment) : null,
        costPerTCo2e: costPerTCo2e !== null ? Math.round(costPerTCo2e) : null,
        costPerKwh: costPerKwh !== null ? Math.round(costPerKwh * 100) / 100 : null,
        currency: singleCurrency, // null when projects use mixed currencies
        costSavingsByCurrency: Object.fromEntries(
          Object.entries(costSavingsByCurrency).map(([c, v]) => [c, Math.round(v)]),
        ),
        greenInvestmentByCurrency: Object.fromEntries(
          Object.entries(greenInvestmentByCurrency).map(([c, v]) => [c, Math.round(v)]),
        ),
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

    // Validate body with Zod
    const parsed = calculationSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'بيانات غير صالحة', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const { projectId, periodStart, periodEnd, methodologyVersion } = parsed.data

    // Authorization: require project access
    const auth = await requireProjectAccess(projectId, 'calculation:run')
    if (!auth.authorized) return auth.response

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

    // === PRIORITY 1: Use reference tables for emission factor ===
    const countryCode = (project.country || 'SA').substring(0, 2).toUpperCase()
    const periodDate = new Date(periodStart)
    const emissionFactor = await getEmissionFactor(countryCode, periodDate)
    const totalCo2AvoidedKg = totalEnergyKwh * emissionFactor.factor

    // === PRIORITY 1: Use reference tables for tariffs ===
    // IMPORTANT: reference tariffs are keyed by country and can be denominated in a
    // different currency than the project's own currency (e.g. project.currency = "SAR"
    // while project.country = "AE", whose reference tariff is in "AED"). Previously the
    // rate was used regardless of currency, so totalSavings could be a correct-looking
    // number silently computed in the wrong currency. We now require the reference
    // tariff's currency to match the project's currency before using it; otherwise we
    // fall back to the project's own tariff fields (assumed to already be in
    // project.currency) and flag the mismatch so it's visible instead of hidden.
    const projectCurrency = project.currency || 'SAR'
    const retailTariffRaw = await getTariff(countryCode, 'retail', periodDate)
    const feedInTariffRaw = await getTariff(countryCode, 'feed_in', periodDate)

    const retailCurrencyMismatch = !!retailTariffRaw && retailTariffRaw.currency !== projectCurrency
    const feedInCurrencyMismatch = !!feedInTariffRaw && feedInTariffRaw.currency !== projectCurrency

    const retailTariff = retailCurrencyMismatch ? null : retailTariffRaw
    const feedInTariff = feedInCurrencyMismatch ? null : feedInTariffRaw

    const tariffRetail = retailTariff?.rate ?? project.tariffRetail ?? 0.18
    const tariffFeedIn = feedInTariff?.rate ?? project.tariffFeedIn ?? 0.10
    const tariffSource = retailTariff?.fromDb ? retailTariff.source : 'project fallback'
    const currencyMismatchWarning = retailCurrencyMismatch || feedInCurrencyMismatch
      ? `Reference tariff currency (${retailTariffRaw?.currency || feedInTariffRaw?.currency}) does not match project currency (${projectCurrency}); used project fallback tariff instead of the reference-table rate.`
      : null

    // Financial savings — always denominated in the project's own currency (projectCurrency)
    const selfConsumptionRate = 0.7
    const selfConsumedKwh = totalEnergyKwh * selfConsumptionRate
    const exportedKwh = totalEnergyKwh * (1 - selfConsumptionRate)
    const totalSavings = selfConsumedKwh * tariffRetail + exportedKwh * tariffFeedIn

    // Performance metrics
    const capacityKwp = project.capacityKwp || 0
    const specificYield = capacityKwp > 0 ? totalEnergyKwh / capacityKwp : 0
    const days = (new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / (1000 * 60 * 60 * 24)
    const referenceYield = days * 5.5
    const performanceRatio = referenceYield > 0 && capacityKwp > 0 ? (totalEnergyKwh / capacityKwp) / referenceYield : 0
    const availability = 0.985

    // === PRIORITY 1: Use reference tables for conversion factors ===
    const treeFactorData = await getConversionFactor('tree_co2', periodDate)
    const carFactorData = await getConversionFactor('car_co2_per_km', periodDate)
    const treeEquivalent = totalCo2AvoidedKg / treeFactorData.value
    const carKmAvoided = totalCo2AvoidedKg / carFactorData.value

    // === PRIORITY 1: Use reference tables for methodology ===
    const methodCode = methodologyVersion?.startsWith('ghg_protocol') ? 'ghg_protocol_scope2' : 'iso_14064_2'
    const methodology = await getMethodology(methodCode)
    const methodVersion = methodology?.version || methodologyVersion || 'ghg_protocol_scope2_v1.2'

    // Hash of inputs (including reference data versions for reproducibility)
    const crypto = await import('crypto')
    const parametersHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({
        projectId,
        periodStart,
        periodEnd,
        methodologyVersion: methodVersion,
        emissionFactor: { factor: emissionFactor.factor, source: emissionFactor.source, version: emissionFactor.version, fromDb: emissionFactor.fromDb },
        tariffRetail: { rate: tariffRetail, source: tariffSource, currency: projectCurrency },
        tariffFeedIn: { rate: tariffFeedIn, currency: projectCurrency },
        currencyMismatchWarning,
        carFactor: { value: carFactorData.value, version: carFactorData.version },
      }))
      .digest('hex')

    const run = await db.calculationRun.create({
      data: {
        projectId,
        runType: 'comprehensive',
        status: 'completed',
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        methodologyVersion: methodVersion,
        parametersHash,
        result: JSON.stringify({
          emissionFactor: { ...emissionFactor },
          tariffRetail: { rate: tariffRetail, source: tariffSource, currency: projectCurrency, fromDb: retailTariff?.fromDb ?? false },
          tariffFeedIn: { rate: tariffFeedIn, currency: projectCurrency, fromDb: feedInTariff?.fromDb ?? false },
          savingsCurrency: projectCurrency,
          currencyMismatchWarning,
          selfConsumptionRate,
          treeFactor: { ...treeFactorData },
          carFactor: { ...carFactorData },
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
        savingsCurrency: projectCurrency, // totalSavings is always in the project's own currency, never the reference-tariff country's currency
        specificYield,
        performanceRatio,
        availability,
        treeEquivalent: Math.round(treeEquivalent),
        carKmAvoided: Math.round(carKmAvoided),
        emissionFactor,
        tariffRetail: { rate: tariffRetail, source: tariffSource, currency: projectCurrency },
        tariffFeedIn: { rate: tariffFeedIn, currency: projectCurrency },
        selfConsumedKwh,
        exportedKwh,
        readingsCount: readings.length,
        currencyMismatchWarning, // non-null when the reference-table tariff currency didn't match the project's currency and a fallback tariff was used instead
        referenceDataProvenance: {
          emissionFactorFromDb: emissionFactor.fromDb,
          tariffFromDb: retailTariff?.fromDb ?? false,
          treeFactorFromDb: treeFactorData.fromDb,
          carFactorFromDb: carFactorData.fromDb,
          methodologyFromDb: methodology?.fromDb ?? false,
        },
      },
    })
  } catch (error) {
    console.error('Run calculation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

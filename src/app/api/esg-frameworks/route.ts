import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireProjectAccess, projectScopeFilter } from '@/lib/authorization'
import { getEmissionFactor } from '@/lib/reference-data'

// ESG Frameworks with mapping to KPIs
const ESG_FRAMEWORKS = [
  {
    code: 'GHG_PROTOCOL',
    name: 'GHG Protocol',
    nameAr: 'بروتوكول GHG',
    description: 'معيار لحساب وانبعاثات الغازات الدفيئة - Corporate Standard',
    scope: 'الانبعاثات',
    version: 'Corporate Standard v2015',
    website: 'https://ghgprotocol.org',
    applicableTo: ['solar', 'afforestation'],
    mapping: [
      { kpi: 'co2Avoided', frameworkRef: 'Scope 2 - Grid-Connected Electricity', category: 'carbon' },
      { kpi: 'energyGenerated', frameworkRef: 'Scope 2 - Avoided Emissions', category: 'energy' },
      { kpi: 'carbonIntensity', frameworkRef: 'Emission Factor Methodology', category: 'carbon' },
      { kpi: 'co2Sequestered', frameworkRef: 'Scope 1 - Biogenic CO₂', category: 'carbon' },
    ],
  },
  {
    code: 'IFC_PS',
    name: 'IFC Performance Standards',
    nameAr: 'معايير الأداء IFC',
    description: 'معايير الأداء البيئي والاجتماعي للتمويل الأخضر',
    scope: 'بيئي واجتماعي',
    version: 'PS1-PS8 (2012, updated 2020)',
    website: 'https://ifc.org/performancestandards',
    applicableTo: ['solar', 'afforestation'],
    mapping: [
      { kpi: 'co2Avoided', frameworkRef: 'PS3 - Resource Efficiency', category: 'carbon' },
      { kpi: 'treesPlanted', frameworkRef: 'PS6 - Biodiversity', category: 'afforestation' },
      { kpi: 'restoredArea', frameworkRef: 'PS6 - Habitat Restoration', category: 'biodiversity' },
      { kpi: 'waterSaved', frameworkRef: 'PS3 - Water Conservation', category: 'water' },
    ],
  },
  {
    code: 'ICMA_GBP',
    name: 'ICMA Green Bond Principles',
    nameAr: 'مبادئ سندات التمويل الأخضر ICMA',
    description: 'مبادئ السندات الخضراء للتقارير المالية',
    scope: 'تمويل أخضر',
    version: '2021',
    website: 'https://icmagroup.org',
    applicableTo: ['solar', 'afforestation'],
    mapping: [
      { kpi: 'co2Avoided', frameworkRef: 'Renewable Energy - Impact Reporting', category: 'carbon' },
      { kpi: 'energyGenerated', frameworkRef: 'Renewable Energy Output', category: 'energy' },
      { kpi: 'costSavings', frameworkRef: 'Financial Impact - Green Projects', category: 'economy' },
      { kpi: 'greenInvestment', frameworkRef: 'Use of Proceeds', category: 'economy' },
    ],
  },
  {
    code: 'CBI',
    name: 'Climate Bonds Initiative',
    nameAr: 'مبادرة سندات المناخ',
    description: 'معايير شهادة سندات المناخ حسب نوع المشروع',
    scope: 'مناخ',
    version: 'Climate Bonds Standard v3.0',
    website: 'https://climatebonds.net',
    applicableTo: ['solar'],
    mapping: [
      { kpi: 'co2Avoided', frameworkRef: 'Solar Energy - Certification Criteria', category: 'carbon' },
      { kpi: 'energyGenerated', frameworkRef: 'Mitigation Impact', category: 'energy' },
    ],
  },
  {
    code: 'GRI',
    name: 'GRI Standards',
    nameAr: 'معايير المبادرة العالمية للتقارير GRI',
    description: 'معايير التقارير العالمية للاستدامة',
    scope: 'استدامة شاملة',
    version: 'GRI Universal 2021',
    website: 'https://globalreporting.org',
    applicableTo: ['solar', 'afforestation'],
    mapping: [
      { kpi: 'energyGenerated', frameworkRef: 'GRI 302 - Energy', category: 'energy' },
      { kpi: 'co2Avoided', frameworkRef: 'GRI 305 - Emissions', category: 'carbon' },
      { kpi: 'waterSaved', frameworkRef: 'GRI 303 - Water', category: 'water' },
      { kpi: 'wasteRecycled', frameworkRef: 'GRI 306 - Waste', category: 'waste' },
      { kpi: 'costSavings', frameworkRef: 'GRI 201 - Economic Performance', category: 'economy' },
    ],
  },
  {
    code: 'ISSB_IFRS_S2',
    name: 'ISSB IFRS S2',
    nameAr: 'معيار ISSB IFRS S2',
    description: 'معيار الإفصاح المناخي للمجلس الدولي لمعايير الاستدامة',
    scope: 'مناخي',
    version: 'IFRS S2 (2023)',
    website: 'https://ifrs.org/issb',
    applicableTo: ['solar', 'afforestation'],
    mapping: [
      { kpi: 'co2Avoided', frameworkRef: 'Scope 2 Emissions Disclosure', category: 'carbon' },
      { kpi: 'carbonIntensity', frameworkRef: 'Carbon Intensity Metric', category: 'carbon' },
      { kpi: 'energyGenerated', frameworkRef: 'Climate-related Opportunities', category: 'energy' },
      { kpi: 'greenInvestment', frameworkRef: 'Capital Deployment', category: 'economy' },
    ],
  },
  {
    code: 'ESRS_E1',
    name: 'ESRS E1',
    nameAr: 'معيار ESRS E1',
    description: 'المعيار الأوروبي للإفصاح البيئي - تغير المناخ',
    scope: 'بيئي - مناخ',
    version: 'ESRS E1 Climate Change (2023)',
    website: 'https://efrag.org',
    applicableTo: ['solar', 'afforestation'],
    mapping: [
      { kpi: 'co2Avoided', frameworkRef: 'E1-6 - Total Gross Emissions Avoided', category: 'carbon' },
      { kpi: 'energyGenerated', frameworkRef: 'E1-5 - Energy Consumption & Mix', category: 'energy' },
      { kpi: 'carbonIntensity', frameworkRef: 'E1-6 - Carbon Intensity', category: 'carbon' },
      { kpi: 'co2Sequestered', frameworkRef: 'E1-7 - GHG Removals', category: 'carbon' },
    ],
  },
  {
    code: 'ISO_14064',
    name: 'ISO 14064',
    nameAr: 'معيار ISO 14064',
    description: 'تحديد والتحقق من انبعاثات الغازات الدفيئة',
    scope: 'انبعاثات',
    version: 'ISO 14064-1:2018, 14064-2:2019',
    website: 'https://iso.org',
    applicableTo: ['solar', 'afforestation'],
    mapping: [
      { kpi: 'co2Avoided', frameworkRef: 'Part 2 - GHG Reduction Projects', category: 'carbon' },
      { kpi: 'carbonIntensity', frameworkRef: 'Part 1 - Organization Level', category: 'carbon' },
      { kpi: 'verifiedDataPercent', frameworkRef: 'Part 3 - Verification', category: 'attestation' },
    ],
  },
  {
    code: 'ISO_14067',
    name: 'ISO 14067',
    nameAr: 'معيار ISO 14067',
    description: 'البصمة الكربونية للمنتجات',
    scope: 'بصمة كربونية',
    version: 'ISO 14067:2018',
    website: 'https://iso.org',
    applicableTo: ['solar'],
    mapping: [
      { kpi: 'carbonIntensity', frameworkRef: 'Product Carbon Footprint', category: 'carbon' },
      { kpi: 'co2Avoided', frameworkRef: 'Avoided Emissions', category: 'carbon' },
    ],
  },
  {
    code: 'IPCC',
    name: 'IPCC Emission Factors',
    nameAr: 'معاملات الانبعاثات IPCC',
    description: 'معاملات الانبعاثات من اللجنة الدولية لتغير المناخ',
    scope: 'معاملات',
    version: '2006 Guidelines + 2019 Refinement',
    website: 'https://ipcc.ch',
    applicableTo: ['solar', 'afforestation'],
    mapping: [
      { kpi: 'co2Avoided', frameworkRef: 'Energy - Grid Electricity', category: 'carbon' },
      { kpi: 'carbonIntensity', frameworkRef: 'EF Database - Grid Factors', category: 'carbon' },
      { kpi: 'co2Sequestered', frameworkRef: 'AFOLU - Forest Land', category: 'carbon' },
    ],
  },
  {
    code: 'IEA',
    name: 'IEA / National Grid Factors',
    nameAr: 'IEA / معاملات الشبكة الوطنية',
    description: 'معاملات الانبعاثات من وكالة الطاقة الدولية والجهات الوطنية',
    scope: 'معاملات',
    version: 'IEA 2024 + National Sources',
    website: 'https://iea.org',
    applicableTo: ['solar'],
    mapping: [
      { kpi: 'co2Avoided', frameworkRef: 'Grid Emission Factors by Country', category: 'carbon' },
      { kpi: 'carbonIntensity', frameworkRef: 'National Energy Mix', category: 'carbon' },
    ],
  },
]

// Traceability metadata for each KPI
const KPI_TRACEABILITY: Record<string, {
  source: string
  calculationMethod: string
  dataOrigin: string
  verificationStatus: string
  lastVerified: string
  auditTrail: string
}> = {
  energyGenerated: {
    source: 'Energy Meter Readings (Inverter API)',
    calculationMethod: 'Sum of validated hourly kWh readings',
    dataOrigin: 'energy_readings table (validated quality)',
    verificationStatus: 'Verified via Hedera attestation',
    lastVerified: '2024-07-16',
    auditTrail: 'Available in Audit Log + Attestation Batch',
  },
  co2Avoided: {
    source: 'Grid Emission Factor (per project country) × Energy Generated',
    calculationMethod: 'CO₂e = Energy (kWh) × EF (kgCO₂e/kWh), EF looked up per project.country',
    dataOrigin: 'gridEmissionFactor reference table (falls back to country default if unapproved/missing)',
    verificationStatus: 'Calculation reproducible via CalculationRun',
    lastVerified: '2024-07-16',
    auditTrail: 'parametersHash stored in calculation_runs',
  },
  co2Sequestered: {
    source: 'Tree Count × Species Factor × Age',
    calculationMethod: 'CO₂ = aliveTrees × sequestrationRate × years',
    dataOrigin: 'project.treeCount + treeSpecies factor',
    verificationStatus: 'Estimated - requires field verification',
    lastVerified: '2024-07-16',
    auditTrail: 'Afforestation project data',
  },
  carbonIntensity: {
    source: 'CO₂ Avoided / Energy Generated',
    calculationMethod: 'CI = totalCO2 / totalEnergy',
    dataOrigin: 'Derived from co2Avoided and energyGenerated',
    verificationStatus: 'Auto-calculated',
    lastVerified: '2024-07-16',
    auditTrail: 'Derived metric',
  },
  treesPlanted: {
    source: 'Project Registration Data',
    calculationMethod: 'Direct count from project setup',
    dataOrigin: 'project.treeCount field',
    verificationStatus: 'Verified at registration',
    lastVerified: '2024-07-16',
    auditTrail: 'project.create audit event',
  },
  costSavings: {
    source: 'Energy × Retail Tariff',
    calculationMethod: 'Savings = Energy × tariffRetail',
    dataOrigin: 'project.tariffRetail × energy_readings',
    verificationStatus: 'Calculation reproducible',
    lastVerified: '2024-07-16',
    auditTrail: 'CalculationRun with tariff snapshot',
  },
  waterSaved: {
    source: 'Energy × Water/Energy Ratio (thermal equivalent)',
    calculationMethod: 'Water = Energy × 1.5 L/kWh (vs thermal)',
    dataOrigin: 'IEA thermal plant water consumption factor',
    verificationStatus: 'Estimated factor',
    lastVerified: '2024-07-16',
    auditTrail: 'IEA reference',
  },
  verifiedDataPercent: {
    source: 'Attested Readings / Total Readings',
    calculationMethod: 'Percentage of readings with Hedera attestation',
    dataOrigin: 'attestation_batches.itemCount / energy_readings.count',
    verificationStatus: 'Blockchain verified',
    lastVerified: '2024-07-16',
    auditTrail: 'Hedera Transaction IDs',
  },
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth()
    if (!auth.authorized) return auth.response
    const { user } = auth

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    // If a specific project was requested, verify the user can actually access it
    // (org match + project_manager isolation) instead of trusting the query param.
    if (projectId) {
      const access = await requireProjectAccess(projectId, 'reading:read')
      if (!access.authorized) return access.response
    }

    // Security: scope to the user's organization (previously unscoped — leaked every
    // organization's projects and readings), plus project_manager isolation, and now
    // further scoped to a single project when projectId is provided.
    const allProjects = await db.project.findMany({
      where: {
        organizationId: user.organizationId!,
        ...projectScopeFilter(user),
        ...(projectId ? { id: projectId } : {}),
      },
      select: {
        id: true, name: true, nameAr: true, code: true, projectType: true,
        capacityKwp: true, currency: true, tariffRetail: true, country: true,
        treeSpecies: true, treeCount: true, plantedAreaM2: true, survivalRateTarget: true, plantingDate: true,
      },
    })

    const allReadings = await db.energyReading.findMany({
      where: {
        qualityStatus: { in: ['validated', 'approved', 'corrected'] },
        projectId: { in: allProjects.map((p) => p.id) },
      },
      select: { value: true, measuredAt: true, projectId: true, qualityStatus: true },
    })

    const totalEnergy = allReadings.reduce((s, r) => s + r.value, 0)

    // === Emission factor per project, based on each project's own country AND the date
    // each reading was measured ===
    // gridEmissionFactor is versioned by date (validFrom/validTo). A calculation run looks
    // up the factor valid on the reading's own period, not "today" — so looking up "as of
    // today" here (as an earlier fix did) can still disagree with a run's result whenever
    // the reference table has more than one version for a country. Bucket by (country,
    // month-of-reading) so historical readings use the factor version valid when they were
    // measured, same as running a real calculation would, while keeping DB lookups bounded.
    const emissionFactorCache = new Map<string, Awaited<ReturnType<typeof getEmissionFactor>>>()
    const getCachedEmissionFactor = async (countryCode: string, date: Date) => {
      const bucketKey = `${countryCode}:${date.getUTCFullYear()}-${date.getUTCMonth()}`
      if (!emissionFactorCache.has(bucketKey)) {
        emissionFactorCache.set(bucketKey, await getEmissionFactor(countryCode, date))
      }
      return emissionFactorCache.get(bucketKey)!
    }

    let totalCo2Avoided = 0
    for (const p of allProjects) {
      const countryCode = (p.country || 'SA').substring(0, 2).toUpperCase()
      const projectReadings = allReadings.filter((r) => r.projectId === p.id)
      for (const r of projectReadings) {
        const ef = await getCachedEmissionFactor(countryCode, r.measuredAt)
        totalCo2Avoided += r.value * ef.factor
      }
    }

    // Verified data % — real figure derived from attestation batches for the scoped
    // project set, instead of a hardcoded constant that never changed per project.
    const scopedProjectIds = allProjects.map((p) => p.id)
    const totalReadingsDb = await db.energyReading.count({ where: { projectId: { in: scopedProjectIds } } })
    const attestedItems = await db.attestationBatch.aggregate({
      where: { status: 'confirmed', projectId: { in: scopedProjectIds } },
      _sum: { itemCount: true },
    })
    const verifiedDataPercent = totalReadingsDb > 0
      ? Math.min(100, ((attestedItems._sum.itemCount || 0) / totalReadingsDb) * 100)
      : 0

    // Cost savings grouped by each project's own currency (Project.currency).
    // Previously this summed tariffs across all projects into one number regardless
    // of currency, then labeled it "SAR" unconditionally — mixing e.g. SAR and AED
    // amounts together and mislabeling the result.
    const costSavingsByCurrency: Record<string, number> = {}
    for (const p of allProjects) {
      const projectEnergy = allReadings.filter((r) => r.projectId === p.id).reduce((sum, r) => sum + r.value, 0)
      const currency = p.currency || 'SAR'
      costSavingsByCurrency[currency] = (costSavingsByCurrency[currency] || 0) + projectEnergy * (p.tariffRetail || 0.18)
    }
    const costSavingsCurrencies = Object.keys(costSavingsByCurrency)
    const costSavingsSingleCurrency = costSavingsCurrencies.length <= 1 ? (costSavingsCurrencies[0] || 'SAR') : null

    // Build traceable KPIs with full metadata + classification
    const traceableKPIs = [
      {
        key: 'energyGenerated',
        category: 'energy',
        labelAr: 'الطاقة المُولّدة',
        labelEn: 'Energy Generated',
        value: totalEnergy,
        unit: 'kWh',
        classification: 'موثق', // موثق = attested on Hedera
        ...KPI_TRACEABILITY.energyGenerated,
        frameworks: ESG_FRAMEWORKS
          .filter((f) => f.mapping.some((m) => m.kpi === 'energyGenerated'))
          .map((f) => ({ code: f.code, name: f.name, ref: f.mapping.find((m) => m.kpi === 'energyGenerated')?.frameworkRef })),
      },
      {
        key: 'co2Avoided',
        category: 'carbon',
        labelAr: 'CO₂e متجنب',
        labelEn: 'CO₂e Avoided',
        value: totalCo2Avoided,
        unit: 'kgCO₂e',
        classification: 'محسوب', // محسوب = calculated from formula
        emissionFactorsUsed: Array.from(
          new Map(
            Array.from(emissionFactorCache.entries()).map(([bucketKey, ef]) => {
              const countryCode = bucketKey.split(':')[0]
              return [`${countryCode}|${ef.version}|${ef.factor}`, { countryCode, factor: ef.factor, source: ef.source, version: ef.version, fromDb: ef.fromDb }]
            }),
          ).values(),
        ),
        ...KPI_TRACEABILITY.co2Avoided,
        frameworks: ESG_FRAMEWORKS
          .filter((f) => f.mapping.some((m) => m.kpi === 'co2Avoided'))
          .map((f) => ({ code: f.code, name: f.name, ref: f.mapping.find((m) => m.kpi === 'co2Avoided')?.frameworkRef })),
      },
      {
        key: 'co2Sequestered',
        category: 'carbon',
        labelAr: 'CO₂e ممتص (تخزين)',
        labelEn: 'CO₂e Sequestered',
        value: allProjects.filter((p) => p.projectType === 'afforestation').reduce((s, p) => {
          const treeFactor = p.treeSpecies === 'السدر (Ziziphus spina-christi)' ? 22 : 21
          const alive = Math.round((p.treeCount || 0) * (p.survivalRateTarget || 0.85))
          const years = p.plantingDate ? (Date.now() - p.plantingDate.getTime()) / (1000 * 60 * 60 * 24 * 365) : 0
          return s + alive * treeFactor * Math.max(years, 0)
        }, 0),
        unit: 'kgCO₂e',
        classification: 'تقديري', // تقديري = estimated, requires field verification
        ...KPI_TRACEABILITY.co2Sequestered,
        frameworks: ESG_FRAMEWORKS
          .filter((f) => f.mapping.some((m) => m.kpi === 'co2Sequestered'))
          .map((f) => ({ code: f.code, name: f.name, ref: f.mapping.find((m) => m.kpi === 'co2Sequestered')?.frameworkRef })),
      },
      {
        key: 'carbonIntensity',
        category: 'carbon',
        labelAr: 'كثافة الكربون',
        labelEn: 'Carbon Intensity',
        value: totalEnergy > 0 ? totalCo2Avoided / totalEnergy : 0,
        unit: 'kgCO₂e/kWh',
        classification: 'محسوب',
        ...KPI_TRACEABILITY.carbonIntensity,
        frameworks: ESG_FRAMEWORKS
          .filter((f) => f.mapping.some((m) => m.kpi === 'carbonIntensity'))
          .map((f) => ({ code: f.code, name: f.name, ref: f.mapping.find((m) => m.kpi === 'carbonIntensity')?.frameworkRef })),
      },
      {
        key: 'treesPlanted',
        category: 'afforestation',
        labelAr: 'أشجار مزروعة',
        labelEn: 'Trees Planted',
        value: allProjects.filter((p) => p.projectType === 'afforestation').reduce((s, p) => s + (p.treeCount || 0), 0),
        unit: 'شجرة',
        classification: 'معتمد', // معتمد = approved at project registration
        ...KPI_TRACEABILITY.treesPlanted,
        frameworks: ESG_FRAMEWORKS
          .filter((f) => f.mapping.some((m) => m.kpi === 'treesPlanted'))
          .map((f) => ({ code: f.code, name: f.name, ref: f.mapping.find((m) => m.kpi === 'treesPlanted')?.frameworkRef })),
      },
      {
        key: 'costSavings',
        category: 'economy',
        labelAr: 'وفر تكاليف',
        labelEn: 'Cost Savings',
        // Only a single rounded number when all projects share one currency; otherwise
        // null with byCurrency populated so the UI doesn't render a mixed-currency total.
        value: costSavingsSingleCurrency ? costSavingsByCurrency[costSavingsSingleCurrency] : null,
        unit: costSavingsSingleCurrency || 'مختلط (انظر byCurrency)',
        byCurrency: costSavingsByCurrency,
        classification: 'محسوب',
        ...KPI_TRACEABILITY.costSavings,
        frameworks: ESG_FRAMEWORKS
          .filter((f) => f.mapping.some((m) => m.kpi === 'costSavings'))
          .map((f) => ({ code: f.code, name: f.name, ref: f.mapping.find((m) => m.kpi === 'costSavings')?.frameworkRef })),
      },
      {
        key: 'waterSaved',
        category: 'water',
        labelAr: 'مياه موفّرة',
        labelEn: 'Water Saved',
        value: totalEnergy * 1.5,
        unit: 'لتر',
        classification: 'تقديري',
        ...KPI_TRACEABILITY.waterSaved,
        frameworks: ESG_FRAMEWORKS
          .filter((f) => f.mapping.some((m) => m.kpi === 'waterSaved'))
          .map((f) => ({ code: f.code, name: f.name, ref: f.mapping.find((m) => m.kpi === 'waterSaved')?.frameworkRef })),
      },
      {
        key: 'verifiedDataPercent',
        category: 'attestation',
        labelAr: 'بيانات موثقة',
        labelEn: 'Verified Data %',
        value: verifiedDataPercent,
        unit: '%',
        classification: 'موثق',
        ...KPI_TRACEABILITY.verifiedDataPercent,
        frameworks: ESG_FRAMEWORKS
          .filter((f) => f.mapping.some((m) => m.kpi === 'verifiedDataPercent'))
          .map((f) => ({ code: f.code, name: f.name, ref: f.mapping.find((m) => m.kpi === 'verifiedDataPercent')?.frameworkRef })),
      },
    ]

    // Framework compliance summary
    const complianceSummary = ESG_FRAMEWORKS.map((f) => ({
      code: f.code,
      name: f.name,
      nameAr: f.nameAr,
      description: f.description,
      scope: f.scope,
      version: f.version,
      website: f.website,
      applicableTo: f.applicableTo,
      mappedKPIs: f.mapping.length,
      mapping: f.mapping,
    }))

    return NextResponse.json({
      frameworks: ESG_FRAMEWORKS,
      traceableKPIs,
      complianceSummary,
      totalFrameworks: ESG_FRAMEWORKS.length,
      note: 'لا يوجد معيار ESG واحد يحدد لوحة تحكم موحدة. المنصة توائم البيانات مع أطر متعددة.',
    })
  } catch (error) {
    console.error('ESG frameworks API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

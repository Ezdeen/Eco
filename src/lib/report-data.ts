/**
 * Report data generation — single shared source
 * ================================================
 * Previously this logic (fetch report + readings + calc runs + attestations,
 * compute totals) was duplicated almost verbatim in both
 * app/api/reports/[id]/download/route.ts and app/api/reports/[id]/pdf/route.ts.
 * That meant any fix here (e.g. the emission-factor bug, the date-calendar bug)
 * had to be applied twice and was easy to miss in one of the two files.
 *
 * This module is now the only place that builds report data. Both routes call
 * generateReportData() and render it (CSV / HTML+print-to-PDF) from the same object.
 */
import { db } from '@/lib/db'
import { calculateFunderAttribution } from '@/lib/attribution'
import { getEmissionFactor, getConversionFactor } from '@/lib/reference-data'
import { getHederaNetwork, getHashscanUrl } from '@/lib/hedera'
import { calculateWaterSavings, estimateBaselineWaterUseM3 } from '@/lib/irrigation'
import QRCode from 'qrcode'

// === Date formatting — always Gregorian ===
// 'ar-SA' (and most 'ar-*' locales) default to the Islamic Umm al-Qura calendar in
// JS's Intl implementation, which silently rendered every report date in the Hijri
// calendar. '-u-ca-gregory' pins the calendar explicitly; 'en-GB' base gives
// Western digits in DD/MM/YYYY order, matching how dates are read elsewhere in
// the platform.
const REPORT_DATE_LOCALE = 'en-GB-u-ca-gregory'

export function fmtReportDate(d: Date | string): string {
  return new Date(d).toLocaleDateString(REPORT_DATE_LOCALE, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export function fmtReportDateTime(d: Date | string): string {
  return new Date(d).toLocaleString(REPORT_DATE_LOCALE, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export async function generateReportData(reportId: string) {
  const report = await db.report.findUnique({
    where: { id: reportId },
    include: {
      project: {
        select: {
          id: true, name: true, nameAr: true, code: true,
          country: true, city: true, capacityKwp: true, currency: true,
          tariffRetail: true, tariffFeedIn: true, sponsorName: true, sponsorPhone: true,
          inverterSerial: true, inverterType: true, commissionedAt: true,
          methodology: true, status: true, latitude: true, longitude: true,
          waterMeterSerial: true, waterMeterType: true, irrigationMethod: true,
          soilType: true, waterSourceType: true,
          iotSensorType: true, iotSensorModel: true, iotSensorSerial: true,
          iotGatewayId: true, iotProtocol: true, iotDataFrequency: true,
          hederaTopicId: true,
          projectType: true, treeSpecies: true, treeCount: true,
          plantedAreaM2: true, survivalRateTarget: true, plantingDate: true,
          cropType: true, irrigatedAreaM2: true, dailyWaterBudgetM3: true,
          baselineWaterUseLM2Day: true, waterTariffPerM3: true, pumpEnergyKwhPerM3: true,
          organization: {
            select: { id: true, name: true, nameAr: true, code: true, country: true },
          },
          devices: {
            select: {
              id: true, name: true, manufacturer: true, model: true,
              serialNumber: true, protocol: true, status: true,
              firmwareVersion: true, lastSeenAt: true,
            },
          },
          baselines: {
            where: { status: 'confirmed' },
            orderBy: { createdAt: 'desc' },
            take: 2, // كلا الفئتين المحتملتين (طاقة/مياه) إن وُجدتا معًا
            select: {
              id: true, category: true, baselinePeriodMonths: true,
              totalEnergyKwh: true, totalWaterLiters: true,
              baselineCo2eTons: true, pumpingCo2eTons: true, waterIntensityPerSqm: true,
              emissionFactorValue: true, emissionFactorSource: true, emissionFactorVersion: true,
              methodologyVersion: true, standardsApplied: true, dmrvLinkageNotes: true,
              esgAlignment: true, createdAt: true,
            },
          },
          funders: {
            where: { isActive: true },
            select: {
              id: true, funderName: true, funderNameAr: true,
              fundingAmount: true, projectTotalValue: true,
              attributionShare: true, attributionMethod: true, currency: true, isActive: true,
            },
          },
        },
      },
    },
  })

  if (!report) return null

  const allReadings = await db.energyReading.findMany({
    where: {
      projectId: report.projectId,
      measuredAt: { gte: report.periodStart, lte: report.periodEnd },
    },
    select: {
      measuredAt: true,
      value: true,
      unit: true,
      metricType: true,
      qualityStatus: true,
      validationStatus: true,
      cumulativeValue: true,
      suspectReason: true,
      deviceId: true,
      canonicalPayloadHash: true,
      n8nProvidedHash: true,
      hashMatchStatus: true,
      hederaTransactionId: true,
      hederaConsensusAt: true,
    },
    orderBy: { measuredAt: 'asc' },
  })

  // Only verified/approved readings feed the actual calculations below (validated,
  // approved, corrected). Suspect and rejected readings are counted separately
  // (summary.suspectReadings / rejectedReadings) so the report can show how much
  // data was excluded, without that data ever entering a sum.
  const verifiedStatuses = ['validated', 'approved', 'corrected']
  // نُقيّد قراءات "الطاقة" بـ metricType = energy_export_kwh صراحة حتى لا تختلط
  // قراءات مستشعرات أخرى (رطوبة تربة/مياه لمشاريع التشجير والري الذكي) بحساب الطاقة.
  const readings = allReadings.filter((r) => verifiedStatuses.includes(r.qualityStatus) && r.metricType === 'energy_export_kwh')

  const calcRuns = await db.calculationRun.findMany({
    where: {
      projectId: report.projectId,
      periodStart: { gte: report.periodStart },
      periodEnd: { lte: report.periodEnd },
    },
    orderBy: { createdAt: 'desc' },
  })

  const attestationBatches = await db.attestationBatch.findMany({
    where: {
      projectId: report.projectId,
      createdAt: { gte: report.periodStart, lte: report.periodEnd },
    },
    orderBy: { createdAt: 'desc' },
  })

  // === Energy totals ===
  const totalEnergy = readings.reduce((s, r) => s + r.value, 0)
  const validReadings = allReadings.filter((r) => verifiedStatuses.includes(r.qualityStatus))
  const suspectReadings = allReadings.filter((r) => r.qualityStatus === 'suspect')
  const rejectedReadings = allReadings.filter((r) => r.qualityStatus === 'rejected')

  // === Carbon — same per-country, per-reading-date emission factor lookup used by
  // the Calculations (KPI Catalog) section, instead of a hardcoded 0.432 constant
  // that silently ignored the project's actual country and the factor's validity
  // period. This is what makes the report's CO2 figure consistent with the
  // Calculations section's figure for the same project/period. ===
  const countryCode = (report.project.country || 'SA').substring(0, 2).toUpperCase()
  const emissionFactorCache = new Map<string, Awaited<ReturnType<typeof getEmissionFactor>>>()
  const getCachedEmissionFactor = async (date: Date) => {
    const bucketKey = `${date.getUTCFullYear()}-${date.getUTCMonth()}`
    if (!emissionFactorCache.has(bucketKey)) {
      emissionFactorCache.set(bucketKey, await getEmissionFactor(countryCode, date))
    }
    return emissionFactorCache.get(bucketKey)!
  }

  let totalCo2Avoided = 0
  for (const r of readings) {
    const ef = await getCachedEmissionFactor(r.measuredAt)
    totalCo2Avoided += r.value * ef.factor
  }
  const blendedEmissionFactor = totalEnergy > 0 ? totalCo2Avoided / totalEnergy : 0
  const emissionFactorsUsed = Array.from(
    new Map(
      Array.from(emissionFactorCache.values()).map((ef) => [
        `${ef.version}|${ef.factor}`,
        { factor: ef.factor, source: ef.source, version: ef.version, fromDb: ef.fromDb },
      ]),
    ).values(),
  )

  const selfConsumed = totalEnergy * 0.7
  const exported = totalEnergy * 0.3
  const totalSavings = selfConsumed * (report.project.tariffRetail || 0.18) + exported * (report.project.tariffFeedIn || 0.10)
  const specificYield = report.project.capacityKwp ? totalEnergy / report.project.capacityKwp : 0
  const days = (report.periodEnd.getTime() - report.periodStart.getTime()) / (1000 * 60 * 60 * 24)
  const referenceYield = days * 5.5
  const performanceRatio = referenceYield > 0 && report.project.capacityKwp ? (totalEnergy / report.project.capacityKwp) / referenceYield : 0

  const treeFactorData = await getConversionFactor('tree_co2', report.periodEnd)
  const carFactorData = await getConversionFactor('car_co2_per_km', report.periodEnd)
  const treeEquivalent = totalCo2Avoided / treeFactorData.value
  const carKmAvoided = totalCo2Avoided / carFactorData.value

  // === Water (estimated for solar vs. thermal generation) ===
  const waterSaved = totalEnergy * 1.5
  const waterConsumed = totalEnergy * 0.02

  // === Afforestation / biodiversity (only non-zero for afforestation-type projects) ===
  const isAfforestation = report.project.projectType === 'afforestation'
  const treeFactor = report.project.treeSpecies === 'السدر (Ziziphus spina-christi)' ? 22 : 21
  const aliveTrees = isAfforestation ? Math.round((report.project.treeCount || 0) * (report.project.survivalRateTarget || 0.85)) : 0
  const treeYears = isAfforestation && report.project.plantingDate
    ? Math.max((Date.now() - report.project.plantingDate.getTime()) / (1000 * 60 * 60 * 24 * 365), 0)
    : 0
  const co2Sequestered = isAfforestation ? aliveTrees * treeFactor * treeYears : 0
  const biomass = isAfforestation ? aliveTrees * 50 * treeYears : 0
  const carbonSequestration = isAfforestation ? aliveTrees * treeFactor : 0
  const restoredAreaHa = isAfforestation ? (report.project.plantedAreaM2 || 0) / 10000 : 0
  const habitatIndex = restoredAreaHa > 0 ? Math.min(100, restoredAreaHa * 10) : 0

  // === Smart irrigation (only non-zero for smart_irrigation-type projects) ===
  // مبنية على قراءات فعلية من عداد المياه الذكي، وليست تقديرًا ثابتًا كما في حالة "الماء" أعلاه.
  const isSmartIrrigation = report.project.projectType === 'smart_irrigation'
  let irrigationWaterUsedM3 = 0
  let irrigationWaterSavedM3 = 0
  let irrigationWaterSavedPct = 0
  let irrigationAvgSoilMoisturePct = 0
  if (isSmartIrrigation) {
    const waterReadings = allReadings.filter(
      (r) => verifiedStatuses.includes(r.qualityStatus) && (r.metricType === 'water_meter_m3' || r.metricType === 'water_flow_m3h'),
    )
    const soilReadings = allReadings.filter((r) => r.metricType === 'soil_moisture_pct')
    irrigationWaterUsedM3 = waterReadings.reduce((s, r) => s + r.value, 0)
    const baselineM3 = estimateBaselineWaterUseM3({
      irrigatedAreaM2: report.project.irrigatedAreaM2 || 0,
      days: Math.max(1, days),
      dailyWaterBudgetM3: report.project.dailyWaterBudgetM3,
      baselineWaterUseLM2Day: report.project.baselineWaterUseLM2Day,
    })
    const savings = calculateWaterSavings({ actualM3: irrigationWaterUsedM3, baselineM3 })
    irrigationWaterSavedM3 = savings.savedM3
    irrigationWaterSavedPct = savings.savedPct
    irrigationAvgSoilMoisturePct = soilReadings.length > 0
      ? soilReadings.reduce((s, r) => s + r.value, 0) / soilReadings.length
      : 0
  }

  // === Economy ===
  const currency = report.project.currency || 'SAR'
  const greenInvestment = (report.project.capacityKwp || 0) * 3000
  const costPerTCo2e = totalCo2Avoided > 0 ? greenInvestment / (totalCo2Avoided / 1000) : null
  const costPerKwh = totalEnergy > 0 ? greenInvestment / totalEnergy : null

  // === Data quality ===
  const dataQualityRate = allReadings.length > 0 ? (validReadings.length / allReadings.length) * 100 : 0

  // === Attestation / verification (Hedera) ===
  // These batches were already fetched above for the report's period — verifiedDataPercent
  // mirrors the Calculations section's definition (share of this project's readings whose
  // attested batches are confirmed on-chain), scoped to just this report's own period.
  const confirmedBatches = attestationBatches.filter((a) => a.status === 'confirmed')
  const attestedItemCount = confirmedBatches.reduce((s, a) => s + a.itemCount, 0)
  const verifiedDataPercent = allReadings.length > 0 ? Math.min(100, (attestedItemCount / allReadings.length) * 100) : 0

  const hederaNetwork = await getHederaNetwork()
  const attestations = await Promise.all(
    attestationBatches.map(async (a) => {
      const explorerUrl = getHashscanUrl(hederaNetwork, a.hederaTransactionId)
      let qrCodeDataUrl: string | null = null
      if (explorerUrl) {
        try {
          qrCodeDataUrl = await QRCode.toDataURL(explorerUrl, { width: 160, margin: 1 })
        } catch {
          qrCodeDataUrl = null // QR generation is best-effort; the report still works without it
        }
      }
      return {
        id: a.id,
        status: a.status,
        itemCount: a.itemCount,
        hederaTransactionId: a.hederaTransactionId,
        consensusTimestamp: a.consensusTimestamp,
        batchHash: a.batchHash,
        merkleRoot: a.merkleRoot,
        periodStart: a.periodStart,
        periodEnd: a.periodEnd,
        kgCO2eClaimed: a.kgCO2eClaimed,
        eligibilityStatus: a.eligibilityStatus,
        eligibilityNormalPct: a.eligibilityNormalPct,
        confirmedAt: a.confirmedAt,
        createdAt: a.createdAt,
        explorerUrl,
        qrCodeDataUrl,
      }
    }),
  )

  // Daily aggregation for the trend chart
  const dailyData: { date: string; energy: number; co2: number; savings: number }[] = []
  const dailyEnergyMap = new Map<string, number>()
  for (const r of readings) {
    const date = new Date(r.measuredAt).toISOString().slice(0, 10)
    dailyEnergyMap.set(date, (dailyEnergyMap.get(date) || 0) + r.value)
  }
  for (const [date, energy] of dailyEnergyMap) {
    const dayReadings = readings.filter((r) => new Date(r.measuredAt).toISOString().slice(0, 10) === date)
    const dayCo2 = dayReadings.reduce((s, r) => {
      const ef = emissionFactorCache.get(`${r.measuredAt.getUTCFullYear()}-${r.measuredAt.getUTCMonth()}`)
      return s + r.value * (ef?.factor ?? blendedEmissionFactor)
    }, 0)
    dailyData.push({
      date,
      energy: Math.round(energy * 100) / 100,
      co2: Math.round(dayCo2 * 100) / 100,
      savings: Math.round(energy * (report.project.tariffRetail || 0.18) * 100) / 100,
    })
  }

  const fundingAttribution = calculateFunderAttribution(totalCo2Avoided, report.project.funders, totalEnergy)

  // === Before-vs-After baseline comparison ===
  // يعتمد على آخر ProjectBaseline بحالة confirmed لكل فئة (طاقة/مياه)، ويُسقِط (pro-rate)
  // القيمة السنوية/الدورية لخط الأساس على طول فترة التقرير الفعلية (report.periodStart→
  // periodEnd) حتى تكون المقارنة بين "قبل" و"بعد" على نفس عدد الأيام تمامًا. الرقم الخام
  // (غير المُسقَط) يبقى محفوظًا في baselineRaw للتدقيق.
  const reportPeriodDays = Math.max(1, days)
  const baselineComparisons = (report.project.baselines || []).map((b) => {
    const baselinePeriodDays = Math.max(1, (b.baselinePeriodMonths || 12) * 30)
    const scaleFactor = reportPeriodDays / baselinePeriodDays
    const isEnergyCategory = b.category === 'RENEWABLE_ENERGY'
    const baselineCo2eTonsProRated = (b.baselineCo2eTons || 0) * scaleFactor
    const afterCo2eTons = isEnergyCategory
      ? totalCo2Avoided / 1000
      : (waterConsumed > 0 ? (waterConsumed * blendedEmissionFactor) / 1000 : 0) // مقارب فقط لفئة المياه إن لم يوجد قسم ري ذكي فعلي
    const reductionTons = baselineCo2eTonsProRated - afterCo2eTons
    const reductionPct = baselineCo2eTonsProRated > 0 ? (reductionTons / baselineCo2eTonsProRated) * 100 : null
    let standardsApplied: string[] = []
    let esgAlignment: { griStandards: string[]; sdgGoals: string[] } | null = null
    try { standardsApplied = b.standardsApplied ? JSON.parse(b.standardsApplied) : [] } catch { standardsApplied = [] }
    try { esgAlignment = b.esgAlignment ? JSON.parse(b.esgAlignment) : null } catch { esgAlignment = null }
    return {
      category: b.category,
      categoryLabelAr: isEnergyCategory ? 'الطاقة المتجددة / كفاءة الطاقة' : 'استدامة المياه والري',
      baselinePeriodMonths: b.baselinePeriodMonths,
      baselineCo2eTonsRaw: b.baselineCo2eTons,
      baselineCo2eTonsProRated: Math.round(baselineCo2eTonsProRated * 1000) / 1000,
      afterCo2eTons: Math.round(afterCo2eTons * 1000) / 1000,
      reductionTons: Math.round(reductionTons * 1000) / 1000,
      reductionPct: reductionPct !== null ? Math.round(reductionPct * 10) / 10 : null,
      totalEnergyKwh: b.totalEnergyKwh,
      totalWaterLiters: b.totalWaterLiters,
      waterIntensityPerSqm: b.waterIntensityPerSqm,
      emissionFactorValue: b.emissionFactorValue,
      emissionFactorSource: b.emissionFactorSource,
      emissionFactorVersion: b.emissionFactorVersion,
      methodologyVersion: b.methodologyVersion,
      standardsApplied,
      esgAlignment,
      dmrvLinkageNotes: b.dmrvLinkageNotes,
      createdAt: b.createdAt,
    }
  })

  // === Governance / ESG & green-lending standards matrix ===
  // مصفوفة ثابتة تربط كل قسم من التقرير بالإطار/المعيار الذي يستند إليه، لتسهيل استخدام
  // التقرير كأساس لتقرير ESG منفصل أو كمستند داعم لطلب قرض أخضر لدى بنك/جهة تمويل.
  const standardsMatrix = [
    { section: 'الطاقة والانبعاثات (Scope 2)', frameworks: ['GHG Protocol – Scope 2 (location-based)', 'ISO 14064-1', 'GRI 302: Energy', 'GRI 305: Emissions'] },
    { section: 'نصيب الجهات الممولة من الأثر', frameworks: ['PCAF Global GHG Accounting & Reporting Standard, Part A (Project Finance)'] },
    { section: 'المياه والري الذكي', frameworks: ['ISO 14046 Water Footprint', 'FAO CROPWAT Guidelines', 'GRI 303: Water and Effluents'] },
    { section: 'التشجير والتنوع الحيوي', frameworks: ['GHG Protocol – Land Use, Land-Use Change (LULUCF, indicative)', 'GRI 304: Biodiversity'] },
    { section: 'خط الأساس (Before-State)', frameworks: ['GHG Protocol – Baseline & Additionality Guidance', 'ISO 14046 (فئة المياه)'] },
    { section: 'التحقق والتوثيق', frameworks: ['Hedera Hashgraph DLT (سجل غير قابل للتعديل)', 'Assurance principles أقرب لـ ISAE 3410 (Greenhouse Gas Assertions)'] },
    { section: 'الحوكمة والإفصاح العام', frameworks: ['TCFD Recommendations (المقاييس والأهداف)', 'SDG 7 / SDG 6 / SDG 13'] },
  ]

  // === Data provenance / traceability chain ===
  const attestedTxCount = allReadings.filter((r) => !!r.hederaTransactionId).length
  const hashMatchedCount = allReadings.filter((r) => r.hashMatchStatus === 'match').length
  const hashMismatchCount = allReadings.filter((r) => r.hashMatchStatus === 'mismatch').length
  const dataProvenance = {
    devices: (report.project as any).devices || [],
    primaryMeter: report.project.projectType === 'smart_irrigation'
      ? { label: 'عداد المياه الذكي', serial: report.project.waterMeterSerial, type: report.project.waterMeterType }
      : report.project.projectType === 'afforestation'
        ? { label: 'مستشعر IoT', serial: report.project.iotSensorSerial, type: report.project.iotSensorModel, protocol: report.project.iotProtocol, frequency: report.project.iotDataFrequency }
        : { label: 'الإنفرتر الرئيسي', serial: report.project.inverterSerial, type: report.project.inverterType },
    ingestionPath: 'جهاز قياس ميداني → n8n (حساب Hash_08) → واجهة الإدخال /api/integrations → إعادة حساب canonicalPayloadHash داخل المنصة ومطابقته → تصنيف الجودة (qualityStatus) → تجميع في AttestationBatch → تثبيت على شبكة Hedera',
    totalReadings: allReadings.length,
    readingsWithHederaTx: attestedTxCount,
    readingsHashMatched: hashMatchedCount,
    readingsHashMismatched: hashMismatchCount,
    hederaTopicId: report.project.hederaTopicId,
  }

  // === Detailed readings log (appendix) — capped to keep the PDF a manageable size;
  // the CSV/JSON export carries the full, uncapped set (readingsFull) for external audit use. ===
  const READINGS_LOG_CAP = 60
  const mapReadingForLog = (r: (typeof allReadings)[number]) => ({
    measuredAt: r.measuredAt,
    value: Math.round(r.value * 1000) / 1000,
    unit: r.unit,
    metricType: r.metricType,
    qualityStatus: r.qualityStatus,
    validationStatus: r.validationStatus,
    hashMatchStatus: r.hashMatchStatus,
    hederaTransactionId: r.hederaTransactionId,
  })
  const readingsLog = allReadings.slice(0, READINGS_LOG_CAP).map(mapReadingForLog)
  const readingsLogTruncated = allReadings.length > READINGS_LOG_CAP
  const readingsFull = allReadings.map(mapReadingForLog)

  return {
    report,
    project: report.project,
    organization: (report.project as any).organization || null,
    fundingAttribution,
    baselineComparisons,
    standardsMatrix,
    dataProvenance,
    readingsLog,
    readingsLogTruncated,
    readingsFull,
    hederaNetwork,
    summary: {
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      totalReadings: allReadings.length,
      validReadings: validReadings.length,
      suspectReadings: suspectReadings.length,
      rejectedReadings: rejectedReadings.length,
      includedInCalculations: readings.length,
      dataQualityRate,
      totalEnergy: Math.round(totalEnergy * 100) / 100,
      totalCo2Avoided: Math.round(totalCo2Avoided * 100) / 100,
      totalCo2AvoidedTons: Math.round((totalCo2Avoided / 1000) * 100) / 100,
      totalSavings: Math.round(totalSavings * 100) / 100,
      selfConsumed: Math.round(selfConsumed * 100) / 100,
      exported: Math.round(exported * 100) / 100,
      specificYield: Math.round(specificYield * 100) / 100,
      performanceRatio: Math.round(performanceRatio * 1000) / 10,
      treeEquivalent: Math.round(treeEquivalent),
      carKmAvoided: Math.round(carKmAvoided),
      emissionFactor: Math.round(blendedEmissionFactor * 10000) / 10000,
      emissionFactorsUsed,
      capacityKwp: report.project.capacityKwp,
    },
    // Full 9-category KPI catalog — same categories/keys as the Calculations section,
    // scoped to this report's project + period, so a report's environmental figures
    // are never a narrower subset of what Calculations already shows for the same data.
    kpiCatalog: {
      energy: {
        energyGenerated: totalEnergy,
        energyExported: exported,
        energyImported: 0,
        selfConsumption: selfConsumed,
        renewableFraction: totalEnergy > 0 ? 100 : 0,
      },
      carbon: {
        co2Avoided: totalCo2Avoided,
        co2Stored: 0,
        co2Sequestered,
        carbonIntensity: totalEnergy > 0 ? totalCo2Avoided / totalEnergy : 0,
        blendedEmissionFactor,
        emissionFactorsUsed,
        fundingAttribution,
      },
      water: {
        waterSaved,
        waterConsumed,
      },
      waste: {
        wasteDiverted: 0,
        wasteRecycled: 0,
      },
      afforestation: {
        treesPlanted: isAfforestation ? (report.project.treeCount || 0) : 0,
        survivalRate: isAfforestation ? (report.project.survivalRateTarget || 0.85) : 0,
        biomass,
        carbonStock: co2Sequestered,
        carbonSequestration,
      },
      irrigation: {
        waterUsedM3: Math.round(irrigationWaterUsedM3 * 100) / 100,
        waterSavedM3: irrigationWaterSavedM3,
        waterSavedPct: irrigationWaterSavedPct,
        avgSoilMoisturePct: Math.round(irrigationAvgSoilMoisturePct * 100) / 100,
      },
      biodiversity: {
        restoredArea: restoredAreaHa,
        protectedArea: 0,
        habitatIndex,
        speciesCount: isAfforestation && report.project.treeSpecies ? 1 : 0,
      },
      economy: {
        costSavings: totalSavings,
        greenInvestment,
        costPerTCo2e,
        costPerKwh,
        currency,
      },
      dataQuality: {
        completeness: dataQualityRate,
        accuracy: 95.5,
        timeliness: 92.0,
        validationRate: dataQualityRate,
      },
      attestation: {
        verifiedDataPercent,
        traceabilityPercent: verifiedDataPercent,
        auditCoveragePercent: 87.5,
        attestationCount: confirmedBatches.length,
      },
    },
    dailyData,
    calculations: calcRuns.map((c) => ({
      id: c.id,
      type: c.runType,
      status: c.status,
      periodStart: c.periodStart,
      periodEnd: c.periodEnd,
      totalEnergyKwh: c.totalEnergyKwh,
      totalCo2AvoidedKg: c.totalCo2AvoidedKg,
      totalSavings: c.totalSavings,
      performanceRatio: c.performanceRatio,
      methodologyVersion: c.methodologyVersion,
    })),
    attestations,
    suspectReasons: suspectReadings.slice(0, 10).map((r) => ({
      measuredAt: r.measuredAt,
      value: r.value,
      reason: r.suspectReason,
    })),
  }
}

export type ReportData = NonNullable<Awaited<ReturnType<typeof generateReportData>>>

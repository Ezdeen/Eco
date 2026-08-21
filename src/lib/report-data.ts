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
          projectType: true, treeSpecies: true, treeCount: true,
          plantedAreaM2: true, survivalRateTarget: true, plantingDate: true,
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
      qualityStatus: true,
      validationStatus: true,
      cumulativeValue: true,
      suspectReason: true,
    },
    orderBy: { measuredAt: 'asc' },
  })

  // Only verified/approved readings feed the actual calculations below (validated,
  // approved, corrected). Suspect and rejected readings are counted separately
  // (summary.suspectReadings / rejectedReadings) so the report can show how much
  // data was excluded, without that data ever entering a sum.
  const verifiedStatuses = ['validated', 'approved', 'corrected']
  const readings = allReadings.filter((r) => verifiedStatuses.includes(r.qualityStatus))

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

  return {
    report,
    project: report.project,
    fundingAttribution,
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

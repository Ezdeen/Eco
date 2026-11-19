// اختبارات وحدة بلا إطار خارجي:  npx tsx scripts/test-methodologies.mts
import assert from 'node:assert/strict'
import { computeCombinedMargin, defaultLambda, combinedMarginWeights } from '../src/lib/methodologies/tool07.ts'
import { computeAmsId } from '../src/lib/methodologies/ams-id.ts'
import { computeArAcm0003, computeIndicativeTreeRemovals, CO2_PER_C } from '../src/lib/methodologies/ar-acm0003.ts'
import { canonicalJson, computeMethodologyContentHash } from '../src/lib/methodologies/registry.ts'

const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !≈ ${b}`)

// Tool 07 — أوزان Guardian
assert.deepEqual(combinedMarginWeights('wind_solar', true), { wOM: 0.75, wBM: 0.25 })
assert.deepEqual(combinedMarginWeights('wind_solar', false), { wOM: 0.75, wBM: 0.25 })
assert.deepEqual(combinedMarginWeights('other', true), { wOM: 0.5, wBM: 0.5 })
assert.deepEqual(combinedMarginWeights('other', false), { wOM: 0.25, wBM: 0.75 })
close(computeCombinedMargin({ omFactor: 0.6, bmFactor: 0.4, plantClass: 'wind_solar' }).efCm, 0.75 * 0.6 + 0.25 * 0.4)

// lambda
assert.equal(defaultLambda(10), 0)
assert.equal(defaultLambda(50), 0.05)
assert.equal(defaultLambda(99.9), 1)
assert.equal(defaultLambda(120), 1)

// AMS-I.D: BE = EG × EF ; ER = BE − PE − LE
const a = computeAmsId({ scenario: 'greenfield', netElectricityMwh: 1000, efGridTco2PerMwh: 0.5, efIsCombinedMargin: true, additionalityDemonstrated: true, leakage: 10 })
close(a.details.baselineEmissions, 500)
close(a.details.emissionReductions, 490)
assert.equal(a.claimGrade, 'methodology_compliant')
assert.equal(computeAmsId({ scenario: 'greenfield', netElectricityMwh: 1000, efGridTco2PerMwh: 0.5, efIsCombinedMargin: true }).claimGrade, 'indicative')
const b = computeAmsId({ scenario: 'greenfield', netElectricityMwh: 1000, efGridTco2PerMwh: 0.432, efIsCombinedMargin: false })
assert.equal(b.claimGrade, 'indicative')
assert.equal(b.warnings.length, 2)
assert.throws(() => computeAmsId({ scenario: 'greenfield', netElectricityMwh: -1, efGridTco2PerMwh: 0.4, efIsCombinedMargin: true }))

// AR-ACM0003: (44/12)·CF·ΔB / T
const r = computeArAcm0003({ carbonFraction: 0.47, treeBiomassT1: 0, treeBiomassT2: 100, yearsBetween: 5 })
close(r.details.treeStockT2, CO2_PER_C * 0.47 * 100)
close(r.details.netGhgRemovalsPerYear, (CO2_PER_C * 0.47 * 100) / 5)
assert.equal(r.claimGrade, 'indicative')
const r2 = computeArAcm0003({ carbonFraction: 0.47, treeBiomassT1: 0, treeBiomassT2: 100, yearsBetween: 5, deadWoodFraction: 0.1, projectEmissions: 3 })
close(r2.details.netGhgRemovalsPerYear, (CO2_PER_C * 0.47 * 100 * 1.1) / 5 - 3)
assert.throws(() => computeArAcm0003({ carbonFraction: 0.47, treeBiomassT1: 0, treeBiomassT2: 1, yearsBetween: 0 }))

// المسار التقديري موسوم صراحةً
const ind = computeIndicativeTreeRemovals({ aliveTrees: 100, years: 2, kgCo2PerTreePerYear: 21, survivalIsMeasured: false })
assert.equal(ind.claimGrade, 'indicative')
close(ind.details.removalsKgCo2e, 4200)
assert.equal(ind.warnings.length, 2)

// الهاش ثابت مهما كان ترتيب المفاتيح ويتغير بتغيّر أي معامل
const h1 = computeMethodologyContentHash({ formulaId: 'x', formulaRevision: 1, parameters: { a: 1, b: 2 }, guardianSourceHash: 'g' })
const h2 = computeMethodologyContentHash({ formulaId: 'x', formulaRevision: 1, parameters: { b: 2, a: 1 }, guardianSourceHash: 'g' })
const h3 = computeMethodologyContentHash({ formulaId: 'x', formulaRevision: 1, parameters: { a: 1, b: 3 }, guardianSourceHash: 'g' })
assert.equal(h1, h2)
assert.notEqual(h1, h3)
assert.equal(canonicalJson({ b: [1, { d: 1, c: 2 }], a: null }), '{"a":null,"b":[1,{"c":2,"d":1}]}')

console.log('✓ methodology engine tests passed')

// الإنتاج الكلي (مُصدَّر + مستهلك ذاتيًا) يخضع للصيغة نفسها: لا تفريق بين التدفقين في BE
const total = computeAmsId({ scenario: 'greenfield', netElectricityMwh: 10, efGridTco2PerMwh: 0.4, efIsCombinedMargin: true, additionalityDemonstrated: true })
const exportedPart = computeAmsId({ scenario: 'greenfield', netElectricityMwh: 3, efGridTco2PerMwh: 0.4, efIsCombinedMargin: true, additionalityDemonstrated: true })
const selfPart = computeAmsId({ scenario: 'greenfield', netElectricityMwh: 7, efGridTco2PerMwh: 0.4, efIsCombinedMargin: true, additionalityDemonstrated: true })
close(total.details.emissionReductions, exportedPart.details.emissionReductions + selfPart.details.emissionReductions)
assert.ok(total.assumptions.some((a) => a.includes('AMS-I.F')))
console.log('✓ generation split invariance test passed')

// عدّاد عند العاكس: التوثيق يعكس المعامل المطبّق
const gross = computeAmsId({ scenario: 'greenfield', netElectricityMwh: 10 * 0.97, meterToNetFactor: 0.97, efGridTco2PerMwh: 0.4, efIsCombinedMargin: true, additionalityDemonstrated: true })
close(gross.details.meterToNetFactor, 0.97)
close(gross.details.emissionReductions, 10 * 0.97 * 0.4)
assert.ok(gross.assumptions.some((a) => a.includes('0.97')))
assert.ok(total.assumptions.some((a) => a.includes('meterToNetFactor = 1')))
console.log('✓ meter-to-net factor test passed')

// ====== ملخص ضابط التمويل الأخضر ======
import { buildBankSummary, renderBankSummaryHtml, ASSUMED_SELF_CONSUMPTION_SHARE } from '../src/lib/report-bank-summary.ts'

const baseInput = {
  kind: 'energy' as const,
  project: { name: 'مشروع <س>', code: 'P1', city: 'الرياض', country: 'SA', capacityKwp: 100, commissionedAt: '2025-01-01', sponsorName: null, currency: 'SAR', hasOwnTariffs: false, tariffRetail: 0.18, tariffFeedIn: 0.1, devicesCount: 2 },
  period: { start: new Date('2026-10-01T00:00:00Z'), end: new Date('2026-10-31T00:00:00Z') },
  energy: { totalEnergyKwh: 13500, specificYield: 135, avoidedCo2Tons: 5.8, savings: 2000, meterToNetFactor: 1, gridFactorIsCombinedMargin: false },
  impact: { equivalents: { trees: 10, carKm: 100 }, howCalculated: 'x', gridFactor: null, reference: null, purposeNote: 'n' },
  quality: { totalReadings: 100, validReadings: 97, suspect: 2, rejected: 1, daysWithData: 29, hashMismatches: 0, onChainVerifiedPct: 100, confirmedBatches: 3 },
  funders: [] as never[],
}
const bs = buildBankSummary(baseInput)
// عامل السعة = الطاقة ÷ (القدرة × ساعات الفترة) — بلا إنتاج مرجعي مفترض
close(bs.headline.find((h) => h.key === 'capacityFactor')!.value, (13500 / (100 * 30 * 24)) * 100, 0.01)
assert.equal(bs.headline.find((h) => h.key === 'savings')!.basis, 'estimate')
assert.equal(bs.headline.find((h) => h.key === 'energy')!.basis, 'measured')
assert.equal(bs.confidence.level, 'high') // 97% صالحة، 29/30 يومًا، بلا عدم تطابق
assert.equal(bs.financing, null) // لا ممولين ⇒ لا أرقام تمويل مُخترَعة
assert.ok(bs.assumptions.some((a) => a.includes(`${Math.round(ASSUMED_SELF_CONSUMPTION_SHARE * 100)}%`)))
assert.ok(bs.assumptions.some((a) => a.includes('Combined Margin')))
assert.ok(bs.assumptions.some((a) => a.includes('تعرفتان افتراضيتان')))
assert.ok(bs.assumptions.some((a) => a.includes('3 قراءة')))

// مستويات الثقة
assert.equal(buildBankSummary({ ...baseInput, quality: { ...baseInput.quality, validReadings: 90, daysWithData: 24 } }).confidence.level, 'medium')
assert.equal(buildBankSummary({ ...baseInput, quality: { ...baseInput.quality, validReadings: 60 } }).confidence.level, 'low')
assert.equal(buildBankSummary({ ...baseInput, quality: { ...baseInput.quality, hashMismatches: 1 } }).confidence.level, 'medium')
assert.equal(buildBankSummary({ ...baseInput, quality: { ...baseInput.quality, totalReadings: 0, validReadings: 0, daysWithData: 0 } }).confidence.level, 'low')

// التمويل: يُحسب فقط مما سُجِّل (قيمة المشروع/المبلغ/النصيب)
const fin = buildBankSummary({ ...baseInput, funders: [{ funderName: 'Bank', fundingAmount: 300000, projectTotalValue: 400000, attributionSharePct: 75, attributableCo2AvoidedTons: 4.35 }] }).financing!
assert.equal(fin.projectValue, 400000)
assert.equal(fin.fundedPct, 75)
close(fin.annualisedSavings!, (2000 * 365) / 30, 0.01)
close(fin.simplePaybackYears!, 400000 / ((2000 * 365) / 30), 0.01)

// العرض: يهرب HTML ولا يعرض أرقام التمويل عند غيابها
const html = renderBankSummaryHtml(bs, (d) => String(d).slice(0, 10))
assert.ok(!html.includes('<س>'))
assert.ok(html.includes('&lt;س&gt;'))
assert.ok(html.includes('لم تُسجَّل بيانات ممولين'))
assert.ok(html.includes('ثقة عالية بالبيانات'))

// التشجير/الري لا يحملان مؤشرات طاقة
const aff = buildBankSummary({ ...baseInput, kind: 'afforestation', project: { ...baseInput.project, treeCount: 500, plantedAreaM2: 20000 }, afforestation: { estimatedSequestrationTons: 3 } })
assert.ok(!aff.headline.some((h) => h.key === 'energy'))
assert.equal(aff.headline.find((h) => h.key === 'seq')!.basis, 'estimate')
console.log('✓ bank summary tests passed')

// ====== كتالوج المؤشرات الديناميكي ======
import { buildKpiCatalog, estimateAfforestation, renderKpiCatalogHtml, kpiGroupsToCsvRows } from '../src/lib/report-kpi-catalog.ts'

const q = { validPct: 97, coveragePct: 96.7, suspect: 2, rejected: 1, hashMismatches: 0 }
const at = { onChainVerifiedPct: 100, confirmedBatches: 3 }
const ps = new Date('2026-10-01T00:00:00Z'), pe = new Date('2026-10-31T00:00:00Z')

const solar = buildKpiCatalog({
  kind: 'energy', currency: 'SAR', periodDays: 30, quality: q, attestation: at,
  energy: { totalEnergyKwh: 13500, capacityKwp: 100, avoidedCo2Tons: 5.8, methodLabel: 'CDM AMS-I.D', gridFactor: { kgCo2PerKwh: 0.432, basis: 'متوسط', source: 'MEWA', version: '2024' }, treeEquivalent: 100, carKm: 1000, savings: 2000, selfConsumptionSharePct: 70, projectValue: null },
})
const keys = (g: typeof solar) => g.map((x) => x.key)
assert.deepEqual(keys(solar), ['energy', 'carbon', 'economy', 'quality', 'attestation'])
// لا نفايات/تنوع حيوي/تشجير/ري لمشروع شمسي، ولا "قيمة المشروع" إن لم تُسجَّل
assert.ok(!solar.flatMap((g) => g.items).some((it) => it.key === 'value'))
close(solar[0].items.find((i) => i.key === 'cf')!.value, (13500 / (100 * 30 * 24)) * 100, 0.01)
// كل مؤشر له أساس معلن، ولا قيم غير منتهية
for (const it of solar.flatMap((g) => g.items)) assert.ok(['measured', 'calculated', 'recorded', 'estimate'].includes(it.basis) && Number.isFinite(it.value))
// بلا قدرة مسجّلة: لا عائد نوعي ولا عامل سعة
const noCap = buildKpiCatalog({ kind: 'energy', currency: 'SAR', periodDays: 30, quality: q, attestation: at, energy: { totalEnergyKwh: 100, capacityKwp: null, avoidedCo2Tons: 0.04, methodLabel: 'x', gridFactor: null, treeEquivalent: 1, carKm: 10, savings: 10, selfConsumptionSharePct: 70, projectValue: null } })
assert.ok(!noCap[0].items.some((i) => i.key === 'yield' || i.key === 'cf' || i.key === 'capacity'))

// التشجير: إعادة التوليد لاحقًا لا تغيّر رقم فترة منتهية (لا تاريخ اليوم)
const est = (now: string) => estimateAfforestation({ treeCount: 1000, survivalTarget: 0.9, plantingDate: '2025-10-31T00:00:00Z', periodStart: ps, periodEnd: pe, kgCo2PerTreePerYear: 21, now: new Date(now) })
assert.equal(est('2026-11-16T00:00:00Z').cumulativeKg, est('2030-01-01T00:00:00Z').cumulativeKg)
close(est('2030-01-01T00:00:00Z').cumulativeKg, 900 * 21 * (365 / 365), 0.5) // سنة واحدة تقريبًا
assert.equal(est('2030-01-01T00:00:00Z').alive, 900)
// فترة لم تنتهِ بعد: تُقصّ عند "اليوم"
assert.ok(est('2026-10-15T00:00:00Z').cumulativeKg < est('2030-01-01T00:00:00Z').cumulativeKg)
// نسبة بقاء غير مسجّلة ⇒ افتراضية موسومة تقديرية
const dflt = estimateAfforestation({ treeCount: 100, plantingDate: '2025-01-01', periodStart: ps, periodEnd: pe, kgCo2PerTreePerYear: 21 })
assert.equal(dflt.survivalIsDefault, true)
const affCat = buildKpiCatalog({ kind: 'afforestation', currency: 'SAR', periodDays: 30, quality: q, attestation: at, afforestation: { treesPlanted: 100, plantedAreaM2: 10000, treeSpecies: null, plantingDate: '2025-01-01', kgCo2PerTreePerYear: 21, estimate: dflt } })
assert.ok(!affCat.some((g) => g.key === 'energy' || g.key === 'carbon'))
assert.equal(affCat.find((g) => g.key === 'vegetation')!.items.find((i) => i.key === 'survival')!.basis, 'estimate')
assert.ok(affCat.find((g) => g.key === 'sequestration')!.items.every((i) => i.basis === 'estimate'))
// بلا تاريخ زراعة: لا أرقام إزالة، ورسالة تفسّر السبب
const noDate = buildKpiCatalog({ kind: 'afforestation', currency: 'SAR', periodDays: 30, quality: q, attestation: at, afforestation: { treesPlanted: 100, plantedAreaM2: null, treeSpecies: null, plantingDate: null, kgCo2PerTreePerYear: 21, estimate: estimateAfforestation({ treeCount: 100, periodStart: ps, periodEnd: pe, kgCo2PerTreePerYear: 21 }) } })
assert.ok(!noDate.some((g) => g.key === 'sequestration')) // لا عناصر ⇒ لا مجموعة

// الري: رطوبة التربة بلا قراءات معتمدة ⇒ لا مجموعة؛ والقيمة المالية فقط عند وجود تعرفة
const irr = buildKpiCatalog({ kind: 'irrigation', currency: 'SAR', periodDays: 30, quality: q, attestation: at, irrigation: { waterUsedM3: 70, waterSavedM3: 30, waterSavedPct: 30, baselineM3: 100, avgSoilMoisturePct: null, irrigatedAreaM2: 10000, waterTariffPerM3: null, pumpEnergyKwhPerM3: 0.5 } })
assert.ok(!irr.some((g) => g.key === 'soil'))
const irrEco = irr.find((g) => g.key === 'irrigationEconomy')!
assert.deepEqual(irrEco.items.map((i) => i.key), ['pump'])
close(irrEco.items[0].value, 15)
close(irr[0].items.find((i) => i.key === 'intensity')!.value, (70 * 1000) / (10000 * 30), 1e-9)

// العرض: HTML يهرب المحتوى، وCSV يهرب الفواصل
const kpiHtml = renderKpiCatalogHtml(buildKpiCatalog({ kind: 'afforestation', currency: 'SAR', periodDays: 30, quality: q, attestation: at, afforestation: { treesPlanted: 5, plantedAreaM2: null, treeSpecies: '<b>x</b>, y', plantingDate: null, kgCo2PerTreePerYear: 21, estimate: estimateAfforestation({ treeCount: 5, periodStart: ps, periodEnd: pe, kgCo2PerTreePerYear: 21 }) } }))
assert.ok(!kpiHtml.includes('<b>x</b>') && kpiHtml.includes('&lt;b&gt;x&lt;/b&gt;'))
const csv = kpiGroupsToCsvRows(solar)
assert.equal(csv[0], 'الفئة,المؤشر,القيمة,الوحدة,الأساس')
assert.ok(csv.length > 10 && csv.every((r) => r.split(',').length >= 5))
console.log('✓ dynamic KPI catalog tests passed')

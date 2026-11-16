// CDM AR-ACM0003 — Afforestation and reforestation of lands except wetlands.
// مصدر الصيغ: Guardian → Methodology Library/Clean Development Mechanism (CDM)/CDM AR-ACM0003/
// CDM AR-ACM0003.policy (customLogicBlock: calculate_project_fields). الصيغة المنقولة:
//
//   مخزون الكربون (t CO2e) = (44/12) × CF × B           (E55/E54 = (44/12) × E33 × biomass)
//   صافي الإزالة السنوية   = (مخزون t2 − مخزون t1) / T   (E53 = ((E55 − E54) / E67))
//   الخشب الميت/الفضلات    = مخزون الأشجار × DF          (E83 = E55 × E39 ، E89 = E55 × E40)
//   ER = الإزالات(مشروع) − الإزالات(خط أساس) − انبعاثات المشروع − التسرب
//
// ما لم يُنقل: مخزون الشجيرات (shrubs) وانبعاثات الحرائق/تجهيز الموقع — تُمرَّر كقيم جاهزة.

import type { ClaimGrade, GuardianRef, MethodologyResult } from './types'

export const AR_ACM0003_FORMULA_ID = 'cdm_ar_acm0003'
export const AR_ACM0003_REVISION = 1

export const AR_ACM0003_GUARDIAN_REF: GuardianRef = {
  policy: 'CDM AR-ACM0003',
  sourcePath: 'Methodology Library/Clean Development Mechanism (CDM)/CDM AR-ACM0003/CDM AR-ACM0003.policy',
  tools: ['AR Tool 03', 'AR Tool 04'],
}

export const CO2_PER_C = 44 / 12

export interface ArAcm0003Input {
  /** CF — الكسر الكربوني (t C / t مادة جافة). Guardian يتركه مُدخَلًا (E33)؛ القيمة الافتراضية IPCC = 0.47 */
  carbonFraction: number
  /** كتلة الأشجار الحيوية الجافة (t d.m.) عند t1 و t2 — من قياسات حقلية/معادلات allometric */
  treeBiomassT1: number
  treeBiomassT2: number
  /** T — السنوات بين t1 و t2 */
  yearsBetween: number
  /** DF للخشب الميت والفضلات كنسبة من مخزون الأشجار (E39 / E40) */
  deadWoodFraction?: number
  litterFraction?: number
  /** إزالات خط الأساس (t CO2e/yr) */
  baselineNetRemovals?: number
  /** انبعاثات المشروع (حرائق، تجهيز موقع، حرق كتلة) و التسرب (t CO2e/yr) */
  projectEmissions?: number
  leakage?: number
}

export interface ArAcm0003Details {
  treeStockT1: number
  treeStockT2: number
  treeNetRemovalsPerYear: number
  deadWoodNetRemovalsPerYear: number
  litterNetRemovalsPerYear: number
  projectNetRemovalsPerYear: number
  baselineNetRemovals: number
  projectEmissions: number
  leakage: number
  netGhgRemovalsPerYear: number
}

export function computeArAcm0003(input: ArAcm0003Input): MethodologyResult<ArAcm0003Details> {
  if (!(input.yearsBetween > 0)) throw new Error('yearsBetween must be > 0')
  if (!(input.carbonFraction > 0 && input.carbonFraction < 1)) throw new Error('carbonFraction must be within (0,1)')

  const warnings = [
    'الحساب جزئي: مخزون الشجيرات وبعض انبعاثات المشروع غير ممثلة؛ لا يُستخدم كادعاء مطابق لـ AR-ACM0003.',
  ]
  if (input.deadWoodFraction === undefined || input.litterFraction === undefined) {
    warnings.push('لم تُقدَّم قياسات الخشب الميت والفضلات.')
  }
  if (input.baselineNetRemovals === undefined || input.projectEmissions === undefined || input.leakage === undefined) {
    warnings.push('لم تُقدَّم كل قياسات خط الأساس وانبعاثات المشروع والتسرب.')
  }

  const stock = (b: number) => CO2_PER_C * input.carbonFraction * b
  const treeStockT1 = stock(input.treeBiomassT1)
  const treeStockT2 = stock(input.treeBiomassT2)
  const T = input.yearsBetween

  const treeNet = (treeStockT2 - treeStockT1) / T
  const dwNet = ((treeStockT2 - treeStockT1) * (input.deadWoodFraction ?? 0)) / T
  const litNet = ((treeStockT2 - treeStockT1) * (input.litterFraction ?? 0)) / T
  const projectNet = treeNet + dwNet + litNet

  const baseline = input.baselineNetRemovals ?? 0
  const pe = input.projectEmissions ?? 0
  const le = input.leakage ?? 0

  return {
    formulaId: AR_ACM0003_FORMULA_ID,
    formulaRevision: AR_ACM0003_REVISION,
    claimGrade: 'indicative',
    warnings,
    assumptions: [
      'مخزون الشجيرات غير مُدرَج (مشاريع التشجير هنا أشجار فقط).',
      'الخشب الميت والفضلات = 0 ما لم تُمرَّر DF صراحةً.',
    ],
    details: {
      treeStockT1,
      treeStockT2,
      treeNetRemovalsPerYear: treeNet,
      deadWoodNetRemovalsPerYear: dwNet,
      litterNetRemovalsPerYear: litNet,
      projectNetRemovalsPerYear: projectNet,
      baselineNetRemovals: baseline,
      projectEmissions: pe,
      leakage: le,
      netGhgRemovalsPerYear: projectNet - baseline - pe - le,
    },
  }
}

// ---------- المسار التقديري (Indicative) — يحفظ سلوك المنصة الحالي لكن موسومًا صراحةً ----------
//
// كان الحساب السابق: أشجار حيّة (= treeCount × survivalRateTarget) × 21 kgCO2/شجرة/سنة × سنوات.
// هذا معامل عام (EPA) لا يعتمد على نوع الشجرة ولا القياس الحقلي، ويعتمد على *نسبة بقاء مستهدفة*
// وليست مقيسة، فلا يطابق AR-ACM0003. نُبقيه للمؤشرات التقديرية فقط ونصنّفه indicative.
export function computeIndicativeTreeRemovals(input: {
  aliveTrees: number
  years: number
  kgCo2PerTreePerYear: number
  survivalIsMeasured: boolean
}): MethodologyResult<{ removalsKgCo2e: number; aliveTrees: number; years: number; kgCo2PerTreePerYear: number }> {
  const grade: ClaimGrade = 'indicative'
  const warnings = [
    'تقدير مبني على معامل ثابت لكل شجرة وليس على كتلة حيوية مقيسة؛ غير مطابق لـ AR-ACM0003.',
  ]
  if (!input.survivalIsMeasured) {
    warnings.push('نسبة البقاء مستهدفة (survivalRateTarget) وليست مقيسة حقليًا.')
  }
  const years = Math.max(input.years, 0)
  return {
    formulaId: 'indicative_tree_factor',
    formulaRevision: 1,
    claimGrade: grade,
    warnings,
    assumptions: [],
    details: {
      removalsKgCo2e: input.aliveTrees * input.kgCo2PerTreePerYear * years,
      aliveTrees: input.aliveTrees,
      years,
      kgCo2PerTreePerYear: input.kgCo2PerTreePerYear,
    },
  }
}

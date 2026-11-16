// CDM Tool 07 — Tool to calculate the emission factor for an electricity system.
// مصدر الصيغ: Guardian → Methodology Library/Clean Development Mechanism (CDM)/Tools/Tool 07
//             (customLogicBlock: calc_tool_07). الأوزان وجدول lambda منقولان حرفيًا.
//
// ملاحظة نطاق: حساب EF_OM وEF_BM من بيانات كل محطة في الشبكة (الخطوات 1-4 في الأداة) يتم عادةً
// مرة واحدة من جهة وطنية (DNA) أو مرجع منشور، لذلك تستقبل هذه الدالة EF_OM وEF_BM كمدخلات
// مرجعية موثّقة المصدر، وتتولى الخطوة الأخيرة: الجمع المرجَّح Combined Margin.

export type CmPlantClass = 'wind_solar' | 'other'

export interface CmWeights {
  wOM: number
  wBM: number
}

// Guardian calc_weighted_average_cm:
//   Wind & Solar  → wOM 0.75 / wBM 0.25 (كل فترات الاعتماد)
//   All Other     → الفترة الأولى 0.5/0.5 ، الفترات اللاحقة OM 0.25 / BM 0.75
export function combinedMarginWeights(plantClass: CmPlantClass, firstCreditingPeriod = true): CmWeights {
  if (plantClass === 'wind_solar') return { wOM: 0.75, wBM: 0.25 }
  return firstCreditingPeriod ? { wOM: 0.5, wBM: 0.5 } : { wOM: 0.25, wBM: 0.75 }
}

export interface CombinedMarginInput {
  /** EF_OM,y — Operating Margin (tCO2/MWh ≡ kgCO2/kWh) */
  omFactor: number
  /** EF_BM,y — Build Margin (tCO2/MWh ≡ kgCO2/kWh) */
  bmFactor: number
  plantClass: CmPlantClass
  firstCreditingPeriod?: boolean
}

export function computeCombinedMargin(input: CombinedMarginInput): CmWeights & { efCm: number } {
  const w = combinedMarginWeights(input.plantClass, input.firstCreditingPeriod ?? true)
  return { ...w, efCm: w.wOM * input.omFactor + w.wBM * input.bmFactor }
}

// Guardian default_lambda(value): value = (متوسط توليد low-cost/must-run ÷ متوسط التوليد الكلي) × 100
const LAMBDA_TABLE: ReadonlyArray<readonly [number, number]> = [
  [50, 0], [54.54, 0.05], [59.2, 0.1], [63.6, 0.15], [67.76, 0.2], [71.66, 0.25],
  [75.32, 0.3], [78.72, 0.35], [81.86, 0.4], [84.76, 0.45], [87.41, 0.5], [89.8, 0.55],
  [91.94, 0.6], [93.83, 0.65], [95.47, 0.7], [96.85, 0.75], [97.98, 0.8], [98.87, 0.85],
  [99.5, 0.9], [99.87, 0.95], [100, 1],
]

export function defaultLambda(lowCostMustRunSharePct: number): number {
  for (const [upperExclusive, lambda] of LAMBDA_TABLE) {
    if (lowCostMustRunSharePct < upperExclusive) return lambda
  }
  return 1
}

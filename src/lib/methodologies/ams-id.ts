// CDM AMS-I.D — Grid connected renewable electricity generation.
// مصدر الصيغ: Guardian → Methodology Library/Clean Development Mechanism (CDM)/CDM AMS-I.D/AMS-I.D.policy
// (customLogicBlock: calculate_project_fields / calculate_report_fields):
//
//   BE_y  = EG_PJ,y × EF_grid,CM,y            (H34 = H36 × H37)   [t CO2]
//   PE_y  = 0  لمشاريع الطاقة المتجددة (PV/رياح)   (H85 = H87 = 0)
//   ER_y  = BE_y − PE_y − LE_y                 (H114 = H115 − H116 − H117)
//
// الوحدات: EG بالـ MWh و EF بـ tCO2/MWh. (kWh × kgCO2/kWh = kgCO2 ، المقياس نفسه — يمكن
// تمرير كميات kWh وعوامل kg/kWh ويكون الناتج بالـ kg، أو MWh و t/MWh ليكون الناتج بالطن.)

import type { ClaimGrade, GuardianRef, MethodologyResult } from './types'

export const AMS_ID_FORMULA_ID = 'cdm_ams_id'
export const AMS_ID_REVISION = 1

export const AMS_ID_GUARDIAN_REF: GuardianRef = {
  policy: 'CDM AMS-I.D',
  sourcePath: 'Methodology Library/Clean Development Mechanism (CDM)/CDM AMS-I.D/AMS-I.D.policy',
  tools: ['Tool 03', 'Tool 07', 'Tool 10'],
}

export type AmsIdScenario = 'greenfield' | 'capacity_addition_solar_wind'

export interface AmsIdInput {
  scenario: AmsIdScenario
  /** صافي الكهرباء المسلَّمة للشبكة/المُزاحة (H40 للـ greenfield، H43 لإضافة السعة) */
  netElectricityMwh: number
  /** معامل الشبكة Combined Margin (H37) أو بديله — انظر efIsCombinedMargin */
  efGridTco2PerMwh: number
  /** هل المعامل أعلاه ناتج فعلاً عن Tool 07 (CM)؟ إن لم يكن، تُخفَّض درجة الادعاء. */
  efIsCombinedMargin: boolean
  /** لا يُرفع الادعاء إلى مطابق قبل وجود تقييم إضافية موثق للمشروع. */
  additionalityDemonstrated?: boolean
  /** المعامل الذي طُبِّق لتحويل قراءة العدّاد (عند العاكس) إلى صافٍ؛ للتوثيق فقط (netElectricityMwh صافٍ مسبقًا) */
  meterToNetFactor?: number
  /** PE_y — صفر لـ PV (Guardian: H87 = 0) */
  projectEmissions?: number
  /** LE_y (H117/H112) */
  leakage?: number
}

export interface AmsIdDetails {
  scenario: AmsIdScenario
  netElectricityMwh: number
  efGridTco2PerMwh: number
  baselineEmissions: number
  projectEmissions: number
  leakage: number
  meterToNetFactor: number
  emissionReductions: number
}

export function computeAmsId(input: AmsIdInput): MethodologyResult<AmsIdDetails> {
  const warnings: string[] = []
  const assumptions: string[] = [
    'PE_y = 0 لمشاريع PV (Guardian AMS-I.D: H87 = 0)',
    'كامل الإنتاج يُعامَل كمُزيح لكهرباء الشبكة: الجزء المُصدَّر تحت AMS-I.D والمستهلك ذاتيًا تحت AMS-I.F (خيار Electric Grid)؛ ' +
      'الصيغة واحدة في الحالتين: BE = الكهرباء الصافية × EF الشبكة.',
    (input.meterToNetFactor ?? 1) === 1
      ? 'العدّاد عند العاكس (AC إجمالي) ولم يُخصم فقد الكابلات/المحوّل/استهلاك المحطة (meterToNetFactor = 1)؛ AMS-I.D يتطلب الصافي، فقد يكون الأثر مبالغًا فيه قليلًا.'
      : `صافي الكهرباء = قراءة العدّاد عند العاكس × ${input.meterToNetFactor} (خصم الفقد والاستهلاك الذاتي للمحطة).`,
  ]

  if (!(input.netElectricityMwh >= 0)) throw new Error('netElectricityMwh must be ≥ 0')
  if (!(input.efGridTco2PerMwh >= 0)) throw new Error('efGridTco2PerMwh must be ≥ 0')

  let grade: ClaimGrade = 'methodology_compliant'
  if (!input.efIsCombinedMargin) {
    grade = 'indicative'
    warnings.push(
      'معامل الشبكة المستخدم متوسط (location-based) وليس Combined Margin من Tool 07؛ ' +
        'الرقم صالح للتقرير المؤسسي (Scope 2) كمؤشر، ولا يصلح كادعاء تخفيض مطابق لـ AMS-I.D.',
    )
  }
  if (!input.additionalityDemonstrated) {
    grade = 'indicative'
    warnings.push('لم يُسجَّل تقييم موثق للإضافية؛ لا يُعرض الناتج كادعاء تخفيض مطابق للمنهجية.')
  }

  const projectEmissions = input.projectEmissions ?? 0
  const leakage = input.leakage ?? 0
  const baselineEmissions = input.netElectricityMwh * input.efGridTco2PerMwh
  const emissionReductions = baselineEmissions - projectEmissions - leakage

  return {
    formulaId: AMS_ID_FORMULA_ID,
    formulaRevision: AMS_ID_REVISION,
    claimGrade: grade,
    warnings,
    assumptions,
    details: {
      scenario: input.scenario,
      netElectricityMwh: input.netElectricityMwh,
      efGridTco2PerMwh: input.efGridTco2PerMwh,
      baselineEmissions,
      projectEmissions,
      leakage,
      meterToNetFactor: input.meterToNetFactor ?? 1,
      emissionReductions,
    },
  }
}

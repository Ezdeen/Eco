// سجل الصيغ: يربط formulaId (المخزَّن في MethodologyVersion) بالدالة الحسابية ومرجعها في Guardian.
// أي تغيير في المنهجية يمرّ بأحد مسارين، وكلاهما يغيّر contentHash فيُنتج نسخة جديدة:
//   (1) تغيير معاملات/افتراضات → صف MethodologyVersion جديد (parameters مختلفة).
//   (2) تغيير الصيغة نفسها    → رفع REVISION في ملف الصيغة + إعادة مزامنة guardian-provenance.json.

import { createHash } from 'crypto'
import { AMS_ID_FORMULA_ID, AMS_ID_REVISION, AMS_ID_GUARDIAN_REF } from './ams-id'
import { AR_ACM0003_FORMULA_ID, AR_ACM0003_REVISION, AR_ACM0003_GUARDIAN_REF } from './ar-acm0003'
import type { GuardianRef } from './types'

export interface FormulaMeta {
  id: string
  revision: number
  title: string
  titleAr: string
  appliesTo: Array<'solar' | 'afforestation' | 'smart_irrigation'>
  guardian: GuardianRef
  /** مفاتيح العناصر في guardian-provenance.json التي تعتمد عليها الصيغة (سياسة + أدواتها) */
  provenanceKeys: string[]
  /** معاملات افتراضية قابلة للتجاوز في MethodologyVersion.parameters */
  defaultParameters: Record<string, number | string | boolean>
}

export const FORMULAS: Record<string, FormulaMeta> = {
  [AMS_ID_FORMULA_ID]: {
    id: AMS_ID_FORMULA_ID,
    revision: AMS_ID_REVISION,
    title: 'CDM AMS-I.D — Grid connected renewable electricity generation',
    titleAr: 'AMS-I.D — توليد كهرباء متجددة متصل بالشبكة',
    appliesTo: ['solar'],
    guardian: AMS_ID_GUARDIAN_REF,
    provenanceKeys: ['cdm_ams_id', 'cdm_tool_07'],
    defaultParameters: {
      plantClass: 'wind_solar', // Tool 07: أوزان OM/BM
      firstCreditingPeriod: true,
      projectEmissions: 0, // PE_y لمشاريع PV
      leakage: 0,
      // عدّاد الإنتاج عند العاكس (AC إجمالي). AMS-I.D يتطلب الصافي: صافي = قراءة العدّاد × هذا المعامل.
      // 1 = لا خصم (افتراض مُعلَن). اضبطه (≤ 1) عند معرفة فقد الكابلات/المحوّل/استهلاك المحطة الذاتي.
      meterToNetFactor: 1,
    },
  },
  [AR_ACM0003_FORMULA_ID]: {
    id: AR_ACM0003_FORMULA_ID,
    revision: AR_ACM0003_REVISION,
    title: 'CDM AR-ACM0003 — Afforestation and reforestation of lands except wetlands',
    titleAr: 'AR-ACM0003 — التشجير وإعادة التشجير (عدا الأراضي الرطبة)',
    appliesTo: ['afforestation'],
    guardian: AR_ACM0003_GUARDIAN_REF,
    provenanceKeys: ['cdm_ar_acm0003'],
    defaultParameters: {
      carbonFraction: 0.47, // افتراضي IPCC — Guardian يتركه مُدخَلًا في المشروع (E33)
      deadWoodFraction: 0,
      litterFraction: 0,
    },
  },
}

// JSON قياسي (مفاتيح مرتبة) حتى يكون الهاش ثابتًا مهما كان ترتيب الحقول.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const obj = value as Record<string, unknown>
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(',')}}`
}

export function computeMethodologyContentHash(args: {
  formulaId: string
  formulaRevision: number
  parameters: Record<string, unknown>
  /** SHA-256 لمصدر Guardian المقابل كما سُجّل في guardian-provenance.json (قد يكون null) */
  guardianSourceHash: string | null
}): string {
  return createHash('sha256').update(canonicalJson(args)).digest('hex')
}

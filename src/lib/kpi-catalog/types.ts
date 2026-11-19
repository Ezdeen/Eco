// ============== كتالوج المؤشرات المعتمد على Guardian — الأنواع ==============
//
// الفكرة: تعريفات المؤشرات (الاسم، الوصف، الوحدة) تأتي من سياسات Guardian عبر
// `scripts/guardian-kpis.mjs` → guardian-kpis.json، وقيمها تأتي من حسابات المنصة (/api/calculations).
// `buildGuardianKpiCatalog` يدمجهما حسب نوع المشروع، فتتغير المؤشرات المعروضة تلقائيًا مع النوع.

export type KpiBasis = 'measured' | 'calculated' | 'recorded' | 'estimate'

/** guardian: مخرج معرَّف في سياسة Guardian · platform: قياس/تسجيل داخل المنصة لا يقابله مخرج في Guardian */
export type KpiSource = 'guardian' | 'platform'

/** available: له قيمة · no_data: لا بيانات كافية بعد · not_implemented: معرَّف في Guardian لكن غير مطبّق في حسابات المنصة */
export type KpiStatus = 'available' | 'no_data' | 'not_implemented'

export type ClaimGrade = 'methodology_compliant' | 'indicative'

export type KpiIcon = 'zap' | 'leaf' | 'trees' | 'droplet' | 'sprout'
export type KpiColor = 'amber' | 'emerald' | 'green' | 'sky' | 'blue'

// ---- شكل ملف guardian-kpis.json ----
export interface GuardianKpiOutput {
  schema: string
  field: string
  description: string
  label: string
  unit: string | null
}
export interface GuardianKpiPolicy {
  formulaId: string
  policyName: string | null
  policyUuid: string | null
  sourcePath: string
  outputs: GuardianKpiOutput[]
  definitionsSha256: string
}
export interface GuardianKpiFile {
  guardianRepo: string
  guardianCommit: string | null
  syncedAt: string
  sourceUrlBase: string | null
  policies: Record<string, GuardianKpiPolicy>
}

// ---- ما يخرج إلى الواجهة ----
export interface GuardianKpiRef {
  formulaId: string
  policy: string
  schema: string
  field: string
  label: string
  unit: string | null
  description: string
  sourceUrl: string | null
}

export interface CatalogItem {
  key: string
  labelAr: string
  label: string
  unit: string
  value: number | null
  decimals: number
  status: KpiStatus
  basis: KpiBasis
  source: KpiSource
  claimGrade?: ClaimGrade
  note?: string
  guardian?: GuardianKpiRef
}

export interface CatalogGroup {
  key: string
  title: string
  titleEn: string
  icon: KpiIcon
  color: KpiColor
  source: KpiSource
  note?: string
  items: CatalogItem[]
}

export interface GuardianKpiCatalog {
  projectType: string
  /** أي حالة لا يوجد لها ملف مؤشرات (نوع غير معروف) تعيد groups فارغة مع summary يشرح السبب */
  summary: string
  methodology: {
    formulaId: string | null
    titleAr: string
    /** هل صيغة المنهجية مطبّقة في حسابات المنصة؟ */
    implemented: boolean
    sources: Array<{ label: string; url: string }>
    unmatchedReason?: string
  }
  headline: CatalogItem[]
  groups: CatalogGroup[]
  coverage: {
    guardianTotal: number
    /** عدد مخرجات Guardian المربوطة بقيمة محسوبة */
    guardianBound: number
    unbound: GuardianKpiRef[]
  }
  provenance: { repo: string; commit: string | null; syncedAt: string }
}

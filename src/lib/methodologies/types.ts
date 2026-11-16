// ============== طبقة المنهجيات — الأنواع المشتركة ==============
//
// كل دالة حسابية في هذا المجلد "نقية" (لا قاعدة بيانات ولا I/O) وتُنقَل صيغتها حرفيًا
// من سياسات Guardian (hashgraph/guardian → Methodology Library). مصدر كل صيغة وبصمتها
// موثّقان في guardian-provenance.json ويُفحص انحرافهما عن Guardian عبر
// `node scripts/guardian-sync.mjs check`.

/**
 * درجة الادعاء (Claim Grade) — تُرفق بكل نتيجة حتى لا يُعرَض رقم "تقديري" كأنه رقم
 * مطابق للمنهجية:
 *  - methodology_compliant : كل مدخلات المنهجية متوفرة ومن مصادر معتمدة.
 *  - indicative            : الصيغة صحيحة لكن مُدخلًا واحدًا أو أكثر بديل/افتراضي
 *                            (مثلاً معامل شبكة متوسط بدل Combined Margin). لا يصلح كادعاء ائتماني.
 */
export type ClaimGrade = 'methodology_compliant' | 'indicative'

export interface GuardianRef {
  /** اسم السياسة/الأداة كما في Guardian */
  policy: string
  /** المسار داخل مستودع hashgraph/guardian */
  sourcePath: string
  /** الأدوات المرجعية (CDM Tools) التي تعتمد عليها الصيغة */
  tools: string[]
}

export interface MethodologyResult<TDetails = Record<string, unknown>> {
  formulaId: string
  formulaRevision: number
  claimGrade: ClaimGrade
  /** سبب أي تخفيض في درجة الادعاء، وأي افتراض صريح */
  warnings: string[]
  assumptions: string[]
  details: TDetails
}

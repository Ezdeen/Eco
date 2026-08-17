/**
 * Financed / Avoided-Emissions Attribution (Banking Attribution)
 * ================================================================
 *
 * يوفر هذا الملف طبقة حساب واحدة مشتركة تُستخدم من قسم "الحسابات"، قسم
 * "وحدات الأثر"، وقسم "التقارير" لعرض نصيب كل ممول (بنك/جهة إقراض) من الأثر
 * البيئي الكلي لمشروع، إلى جانب رقم المشروع الكامل — وليس بدلاً منه.
 *
 * التوافق المنهجي:
 * -----------------
 * PCAF (Partnership for Carbon Accounting Financials) — Project Finance asset class:
 *   Attribution Factor = Outstanding Amount / (Total Equity + Debt)
 *   Attributed Emissions (or Avoided Emissions) = Attribution Factor × Project Emissions
 *   المصدر: PCAF Global GHG Accounting and Reporting Standard, Part A.
 *
 * GHG Protocol — Scope 3, Category 15 (Investments):
 *   يوصي باستخدام نفس مبدأ نسبة رأس المال (equity/debt share) لتوزيع انبعاثات
 *   (أو تجنّب انبعاثات) الكيانات المُستثمَر فيها على المستثمرين/الممولين، مع
 *   الإفصاح دائمًا عن الرقم الكلي للمشروع بجانب النصيب المُسنَد.
 *
 * القاعدة الذهبية المطبَّقة هنا: لا تُعدَّل قيمة المشروع الكلية (Project Total)
 * أبدًا. فقط تُشتق منها قيمة "attributable" وقت العرض. الأرقام الموثّقة على
 * Hedera (ImpactUnit / AttestationBatch) تبقى دائمًا تمثّل 100% من أثر المشروع.
 */

export type AttributionMethod = 'capital_share' | 'manual'

export interface FunderAttributionInput {
  id: string
  funderName: string
  funderNameAr?: string | null
  fundingAmount?: number | null
  projectTotalValue?: number | null
  attributionShare: number
  attributionMethod: AttributionMethod | string
  attributionNote?: string | null
  currency?: string | null
  isActive: boolean
}

export interface FunderAttributionResult {
  funderId: string
  funderName: string
  funderNameAr?: string | null
  attributionShare: number // 0-1
  attributionSharePct: number // 0-100, rounded to 2dp for display
  attributionMethod: string
  fundingAmount?: number | null
  projectTotalValue?: number | null
  currency?: string | null
  // Attributable share of the project's total avoided-emissions figure.
  attributableCo2AvoidedKg: number
  attributableCo2AvoidedTons: number
  // Same treatment applied to energy, for consistency across the KPI set.
  attributableEnergyKwh?: number
}

/**
 * Clamp and validate a raw attribution share so a bad input (e.g. a funder
 * mistakenly configured at 130%) never silently inflates a bank's reported
 * impact above the project's own total. Values outside [0, 1] are clamped and
 * flagged via the returned `wasClamped` so callers can surface a warning.
 */
export function normalizeAttributionShare(rawShare: number): {
  share: number
  wasClamped: boolean
} {
  if (!Number.isFinite(rawShare)) return { share: 0, wasClamped: true }
  if (rawShare < 0) return { share: 0, wasClamped: true }
  if (rawShare > 1) return { share: 1, wasClamped: true }
  return { share: rawShare, wasClamped: false }
}

/**
 * PCAF capital-share attribution factor: outstanding funding amount over the
 * total project value (equity + debt). Returns null when there isn't enough
 * data to compute it (caller should fall back to a manually-entered share).
 */
export function computeCapitalShareAttribution(
  fundingAmount: number | null | undefined,
  projectTotalValue: number | null | undefined,
): number | null {
  if (
    fundingAmount == null ||
    projectTotalValue == null ||
    !Number.isFinite(fundingAmount) ||
    !Number.isFinite(projectTotalValue) ||
    projectTotalValue <= 0
  ) {
    return null
  }
  const { share } = normalizeAttributionShare(fundingAmount / projectTotalValue)
  return share
}

/**
 * Given the project's total (100%) avoided-emissions figure and a list of
 * funders, returns each funder's attributable share. The project total
 * itself is never mutated — only echoed back for display alongside each
 * funder's derived number, per PCAF/GHG Protocol disclosure practice.
 */
export function calculateFunderAttribution(
  projectTotalCo2AvoidedKg: number,
  funders: FunderAttributionInput[],
  projectTotalEnergyKwh?: number,
): FunderAttributionResult[] {
  return funders
    .filter((f) => f.isActive)
    .map((f) => {
      const { share } = normalizeAttributionShare(f.attributionShare)
      const attributableCo2AvoidedKg = projectTotalCo2AvoidedKg * share
      return {
        funderId: f.id,
        funderName: f.funderName,
        funderNameAr: f.funderNameAr ?? null,
        attributionShare: share,
        attributionSharePct: Math.round(share * 10000) / 100,
        attributionMethod: f.attributionMethod,
        fundingAmount: f.fundingAmount ?? null,
        projectTotalValue: f.projectTotalValue ?? null,
        currency: f.currency ?? null,
        attributableCo2AvoidedKg: Math.round(attributableCo2AvoidedKg * 100) / 100,
        attributableCo2AvoidedTons: Math.round((attributableCo2AvoidedKg / 1000) * 100) / 100,
        ...(projectTotalEnergyKwh != null
          ? { attributableEnergyKwh: Math.round(projectTotalEnergyKwh * share * 100) / 100 }
          : {}),
      }
    })
}

/**
 * Convenience: sum of all active funders' attribution shares for a project.
 * A sum > 1 (i.e. > 100%) indicates a data-entry problem (over-attribution
 * across funders) and should be surfaced as a warning in the UI/report, not
 * silently allowed — otherwise the same tCO2e could be double-counted by two
 * different banks' ESG disclosures.
 */
export function totalAttributionShare(funders: FunderAttributionInput[]): {
  total: number
  totalPct: number
  isOverAttributed: boolean
} {
  const total = funders
    .filter((f) => f.isActive)
    .reduce((sum, f) => sum + normalizeAttributionShare(f.attributionShare).share, 0)
  return {
    total,
    totalPct: Math.round(total * 10000) / 100,
    isOverAttributed: total > 1.0001, // small epsilon for float rounding
  }
}

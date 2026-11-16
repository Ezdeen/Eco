// ============== ملخص ضابط التمويل الأخضر (الصفحة الأولى من التقرير) ==============
//
// وحدة نقية (بلا قاعدة بيانات) تُستخدم من generateReportData ثم تُعرض في PDF والتنزيل والواجهة،
// فتبقى الأرقام والصياغة واحدة في كل مكان.
//
// مبدأ الصدق: كل رقم يحمل "أساسه": مقيس / محسوب بمنهجية / مُسجَّل / تقديري. وأي افتراض مؤثر
// يُذكر صراحةً في قسم الافتراضات بدل إخفائه أو عرضه كأنه قياس.

export type Basis = 'measured' | 'calculated' | 'recorded' | 'estimate'

export const BASIS_LABEL_AR: Record<Basis, string> = {
  measured: 'مقيس',
  calculated: 'محسوب بمنهجية',
  recorded: 'مُسجَّل',
  estimate: 'تقديري',
}

// افتراضات الوفر المالي — مصدر واحد للحساب والإفصاح عنه (لا يوجد قياس فعلي لتقسيم الاستهلاك/التصدير)
export const ASSUMED_SELF_CONSUMPTION_SHARE = 0.7
export const DEFAULT_TARIFF_RETAIL = 0.18
export const DEFAULT_TARIFF_FEED_IN = 0.1

export type ProjectKind = 'energy' | 'afforestation' | 'irrigation'
export type ConfidenceLevel = 'high' | 'medium' | 'low'

export interface HeadlineItem {
  key: string
  label: string
  value: number
  unit: string
  basis: Basis
}

export interface ImpactBlock {
  equivalents: { trees: number; carKm: number } | null
  howCalculated: string
  gridFactor: { kgCo2PerKwh: number; basis: string; source: string; version: string } | null
  reference: { name: string; guardianPolicy: string; url: string } | null
  purposeNote: string
}

export interface BankSummary {
  kind: ProjectKind
  asset: {
    name: string
    code: string
    location: string
    typeLabel: string
    capacityKwp: number | null
    commissionedAt: string | null
    sponsor: string | null
    devicesCount: number
    periodStart: string
    periodEnd: string
    periodDays: number
  }
  headline: HeadlineItem[]
  impact: ImpactBlock
  confidence: {
    level: ConfidenceLevel
    validPct: number
    daysWithData: number
    periodDays: number
    coveragePct: number
    suspect: number
    rejected: number
    hashMismatches: number
    onChainVerifiedPct: number
    confirmedBatches: number
    oneLine: string
    rule: string
  }
  financing: {
    currency: string
    projectValue: number | null
    fundedAmount: number | null
    fundedPct: number | null
    funders: Array<{ name: string; amount: number | null; sharePct: number; attributedTons: number }>
    annualisedSavings: number | null
    simplePaybackYears: number | null
  } | null
  sdgs: string[]
  assumptions: string[]
}

export interface BankSummaryInput {
  kind: ProjectKind
  project: {
    name: string
    code: string
    city?: string | null
    country?: string | null
    capacityKwp?: number | null
    commissionedAt?: Date | string | null
    sponsorName?: string | null
    currency: string
    hasOwnTariffs: boolean
    tariffRetail: number
    tariffFeedIn: number
    devicesCount: number
    treeCount?: number | null
    plantedAreaM2?: number | null
  }
  period: { start: Date; end: Date }
  energy: {
    totalEnergyKwh: number
    specificYield: number
    avoidedCo2Tons: number
    savings: number
    meterToNetFactor: number
    gridFactorIsCombinedMargin: boolean
  }
  afforestation?: { estimatedSequestrationTons: number; survivalIsDefault?: boolean } | null
  irrigation?: { waterUsedM3: number; waterSavedM3: number; waterSavedPct: number } | null
  impact: ImpactBlock
  quality: {
    totalReadings: number
    validReadings: number
    suspect: number
    rejected: number
    daysWithData: number
    hashMismatches: number
    onChainVerifiedPct: number
    confirmedBatches: number
  }
  funders: Array<{
    funderName: string
    funderNameAr?: string | null
    fundingAmount?: number | null
    projectTotalValue?: number | null
    attributionSharePct: number
    attributableCo2AvoidedTons: number
  }>
}

const r2 = (n: number) => Math.round(n * 100) / 100

const TYPE_LABEL: Record<ProjectKind, string> = {
  energy: 'طاقة شمسية',
  afforestation: 'تشجير واستعادة بيئية',
  irrigation: 'ري ذكي',
}

const SDGS: Record<ProjectKind, string[]> = {
  energy: ['SDG 7 — طاقة نظيفة وبأسعار معقولة', 'SDG 13 — العمل المناخي'],
  irrigation: ['SDG 6 — المياه النظيفة', 'SDG 13 — العمل المناخي'],
  afforestation: ['SDG 13 — العمل المناخي', 'SDG 15 — الحياة في البر'],
}

export const CONFIDENCE_RULE_AR =
  'عالية: ≥95% قراءات صالحة و≥90% تغطية أيام وبلا عدم تطابق بصمات • متوسطة: ≥85% و≥75% • دون ذلك: منخفضة.'

export function buildBankSummary(i: BankSummaryInput): BankSummary {
  const periodMs = i.period.end.getTime() - i.period.start.getTime()
  const periodDays = Math.max(1, Math.round(periodMs / 86_400_000))
  const capacity = i.project.capacityKwp && i.project.capacityKwp > 0 ? i.project.capacityKwp : null
  const q = i.quality

  // ---- المؤشرات الرئيسية ----
  const headline: HeadlineItem[] = []
  if (i.kind === 'energy') {
    headline.push({ key: 'energy', label: 'الطاقة المُنتَجة', value: r2(i.energy.totalEnergyKwh), unit: 'kWh', basis: 'measured' })
    if (capacity) {
      headline.push({ key: 'yield', label: 'العائد النوعي', value: r2(i.energy.specificYield), unit: 'kWh/kWp', basis: 'measured' })
      const cf = (i.energy.totalEnergyKwh / (capacity * periodDays * 24)) * 100
      headline.push({ key: 'capacityFactor', label: 'عامل السعة', value: r2(cf), unit: '%', basis: 'measured' })
    }
    headline.push({ key: 'co2', label: 'الانبعاثات المتجنَّبة', value: r2(i.energy.avoidedCo2Tons), unit: 'طن CO₂e', basis: 'calculated' })
    headline.push({ key: 'savings', label: 'الوفر المالي', value: r2(i.energy.savings), unit: i.project.currency, basis: 'estimate' })
  } else if (i.kind === 'afforestation') {
    headline.push({ key: 'trees', label: 'أشجار مزروعة', value: i.project.treeCount || 0, unit: 'شجرة', basis: 'recorded' })
    const ha = (i.project.plantedAreaM2 || 0) / 10_000
    if (ha > 0) headline.push({ key: 'area', label: 'مساحة مُستعادة', value: r2(ha), unit: 'هكتار', basis: 'recorded' })
    headline.push({ key: 'seq', label: 'إزالة الكربون المقدّرة', value: r2(i.afforestation?.estimatedSequestrationTons ?? 0), unit: 'طن CO₂e', basis: 'estimate' })
  } else {
    headline.push({ key: 'waterUsed', label: 'مياه الري المستخدمة', value: r2(i.irrigation?.waterUsedM3 ?? 0), unit: 'م³', basis: 'measured' })
    headline.push({ key: 'waterSaved', label: 'مياه موفَّرة', value: r2(i.irrigation?.waterSavedM3 ?? 0), unit: 'م³', basis: 'calculated' })
    headline.push({ key: 'waterPct', label: 'نسبة التوفير', value: r2(i.irrigation?.waterSavedPct ?? 0), unit: '%', basis: 'calculated' })
  }

  // ---- مستوى الثقة بالبيانات (سطر واحد) ----
  const validPct = q.totalReadings > 0 ? (q.validReadings / q.totalReadings) * 100 : 0
  const coveragePct = Math.min(100, (q.daysWithData / periodDays) * 100)
  let level: ConfidenceLevel = 'low'
  if (q.totalReadings > 0) {
    if (validPct >= 95 && coveragePct >= 90 && q.hashMismatches === 0) level = 'high'
    else if (validPct >= 85 && coveragePct >= 75) level = 'medium'
  }
  const oneLine =
    q.totalReadings === 0
      ? 'لا توجد قراءات في هذه الفترة.'
      : [
          `${validPct.toFixed(1)}% من القراءات صالحة`,
          `بيانات في ${q.daysWithData} من ${periodDays} يومًا`,
          `${q.onChainVerifiedPct.toFixed(0)}% موثّقة على Hedera`,
          q.hashMismatches === 0 ? 'لا عدم تطابق في البصمات' : `${q.hashMismatches} عدم تطابق في البصمات`,
        ].join(' • ')

  // ---- التمويل (من بيانات الممولين المسجّلة فقط) ----
  let financing: BankSummary['financing'] = null
  if (i.funders.length > 0) {
    const projectValue = i.funders.reduce((m, f) => Math.max(m, f.projectTotalValue || 0), 0) || null
    const fundedAmount = i.funders.reduce((s, f) => s + (f.fundingAmount || 0), 0) || null
    const annualisedSavings = i.kind === 'energy' && i.energy.savings > 0 ? (i.energy.savings * 365) / periodDays : null
    financing = {
      currency: i.project.currency,
      projectValue,
      fundedAmount,
      fundedPct: projectValue && fundedAmount ? r2((fundedAmount / projectValue) * 100) : null,
      funders: i.funders.map((f) => ({
        name: f.funderNameAr || f.funderName,
        amount: f.fundingAmount ?? null,
        sharePct: f.attributionSharePct,
        attributedTons: f.attributableCo2AvoidedTons,
      })),
      annualisedSavings: annualisedSavings ? r2(annualisedSavings) : null,
      simplePaybackYears: projectValue && annualisedSavings ? r2(projectValue / annualisedSavings) : null,
    }
  }

  // ---- الافتراضات المُعلَنة ----
  const assumptions: string[] = []
  if (i.kind === 'energy') {
    assumptions.push(
      `الوفر المالي تقدير: يفترض ${Math.round(ASSUMED_SELF_CONSUMPTION_SHARE * 100)}% استهلاكًا ذاتيًا بتعرفة ${i.project.tariffRetail} و${Math.round((1 - ASSUMED_SELF_CONSUMPTION_SHARE) * 100)}% تصديرًا بتعرفة ${i.project.tariffFeedIn} (${i.project.currency}/kWh)` +
        (i.project.hasOwnTariffs ? '.' : ' — تعرفتان افتراضيتان للمنصة لعدم تسجيل تعرفة للمشروع.'),
    )
    if (!i.energy.gridFactorIsCombinedMargin) {
      assumptions.push('معامل الشبكة متوسط (وليس Combined Margin)؛ الأثر الكربوني مؤشر للإفصاح وليس ادعاء ائتمانيًا.')
    }
    assumptions.push(
      i.energy.meterToNetFactor === 1
        ? 'العدّاد عند العاكس (إنتاج إجمالي)؛ لم يُخصم فقد الكابلات والمحوّل، فقد يكون الأثر مبالغًا فيه قليلًا.'
        : `صافي الكهرباء = قراءة العدّاد × ${i.energy.meterToNetFactor} (خصم الفقد).`,
    )
  }
  if (i.kind === 'afforestation') {
    assumptions.push('إزالة الكربون تقدير بمعدل امتصاص سنوي لكل شجرة ونسبة بقاء مستهدفة، وليست مقيسة حقليًا.')
    if (i.afforestation?.survivalIsDefault) assumptions.push('نسبة البقاء افتراضية (85%) لعدم تسجيل نسبة للمشروع.')
  }
  const missingDays = periodDays - q.daysWithData
  if (q.totalReadings > 0 && missingDays > 0) {
    assumptions.push(`${missingDays} يومًا بلا قراءات صالحة؛ الأرقام المعروضة لا تشملها.`)
  }
  if (q.suspect + q.rejected > 0) {
    assumptions.push(`استُبعدت ${q.suspect + q.rejected} قراءة (مشبوهة/مرفوضة) من كل الحسابات.`)
  }

  const location = [i.project.city, i.project.country].filter(Boolean).join('، ')
  const commissioned = i.project.commissionedAt ? new Date(i.project.commissionedAt).toISOString() : null

  return {
    kind: i.kind,
    asset: {
      name: i.project.name,
      code: i.project.code,
      location,
      typeLabel: TYPE_LABEL[i.kind],
      capacityKwp: capacity,
      commissionedAt: commissioned,
      sponsor: i.project.sponsorName || null,
      devicesCount: i.project.devicesCount,
      periodStart: i.period.start.toISOString(),
      periodEnd: i.period.end.toISOString(),
      periodDays,
    },
    headline,
    impact: i.impact,
    confidence: {
      level,
      validPct: r2(validPct),
      daysWithData: q.daysWithData,
      periodDays,
      coveragePct: r2(coveragePct),
      suspect: q.suspect,
      rejected: q.rejected,
      hashMismatches: q.hashMismatches,
      onChainVerifiedPct: r2(q.onChainVerifiedPct),
      confirmedBatches: q.confirmedBatches,
      oneLine,
      rule: CONFIDENCE_RULE_AR,
    },
    financing,
    sdgs: SDGS[i.kind],
    assumptions,
  }
}

// ---------------- العرض كـ HTML (PDF + تنزيل HTML) ----------------

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

const LEVEL_AR: Record<ConfidenceLevel, string> = { high: 'ثقة عالية بالبيانات', medium: 'ثقة متوسطة بالبيانات', low: 'ثقة منخفضة بالبيانات' }

export function renderBankSummaryHtml(b: BankSummary, fmtDate: (d: Date | string) => string): string {
  const num = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  const a = b.asset
  const fin = b.financing

  const assetRows = [
    ['المشروع', `${esc(a.name)} (${esc(a.code)})`],
    ['النوع', esc(a.typeLabel)],
    ['الموقع', esc(a.location) || '—'],
    ...(a.capacityKwp ? [['القدرة المركّبة', `${num(a.capacityKwp)} kWp`]] : []),
    ['تاريخ التشغيل', a.commissionedAt ? esc(fmtDate(a.commissionedAt)) : '—'],
    ['الأجهزة المربوطة', String(a.devicesCount)],
    ['فترة التقرير', `${esc(fmtDate(a.periodStart))} — ${esc(fmtDate(a.periodEnd))} (${a.periodDays} يومًا)`],
  ]
    .map(([l, v]) => `<div class="bs-row"><span>${l}</span><b>${v}</b></div>`)
    .join('')

  const finRows = fin
    ? [
        ...(fin.projectValue ? [['قيمة المشروع', `${num(fin.projectValue)} ${esc(fin.currency)}`]] : []),
        ...(fin.fundedAmount ? [['مبلغ التمويل', `${num(fin.fundedAmount)} ${esc(fin.currency)}${fin.fundedPct ? ` (${fin.fundedPct}%)` : ''}`]] : []),
        ...fin.funders.map((f) => [esc(f.name), `نصيبه من الأثر ${f.sharePct}% ≈ ${num(f.attributedTons)} طن CO₂e`]),
        ...(fin.annualisedSavings ? [['الوفر السنوي المتوقع (تقديري)', `${num(fin.annualisedSavings)} ${esc(fin.currency)}`]] : []),
        ...(fin.simplePaybackYears ? [['فترة الاسترداد البسيطة (تقديرية)', `${fin.simplePaybackYears} سنة`]] : []),
      ]
        .map(([l, v]) => `<div class="bs-row"><span>${l}</span><b>${v}</b></div>`)
        .join('')
    : '<div class="bs-row"><span>التمويل</span><b>لم تُسجَّل بيانات ممولين لهذا المشروع</b></div>'

  const kpis = b.headline
    .map(
      (h) => `<div class="bs-kpi"><div class="bs-kl">${esc(h.label)}</div><div class="bs-kv">${num(h.value)}</div><div class="bs-ku">${esc(h.unit)}</div><div class="bs-chip bs-${h.basis}">${BASIS_LABEL_AR[h.basis]}</div></div>`,
    )
    .join('')

  const im = b.impact
  const impactHtml = `
    ${im.equivalents ? `<p>يعادل زراعة نحو <b>${num(im.equivalents.trees)}</b> شجرة، أو تجنّب نحو <b>${num(im.equivalents.carKm)}</b> كم قيادة بسيارة.</p>` : ''}
    <p class="bs-muted">${esc(im.howCalculated)}</p>
    ${im.gridFactor ? `<p class="bs-muted">معامل الشبكة: ${im.gridFactor.kgCo2PerKwh} كغ CO₂/kWh — ${esc(im.gridFactor.basis)} — المصدر: ${esc(im.gridFactor.source)} (${esc(im.gridFactor.version)})</p>` : ''}
    ${im.reference ? `<p class="bs-muted">المرجع: ${esc(im.reference.name)} — Guardian (${esc(im.reference.guardianPolicy)})</p>` : ''}`

  return `
<div class="bs">
<style>
  .bs { margin-bottom: 22px; }
  .bs h2 { color:#16a34a; border-bottom:2px solid #16a34a; padding-bottom:6px; font-size:17px; margin:0 0 12px 0; }
  .bs-two { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:12px; }
  .bs-box { border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; background:#fff; }
  .bs-box h3 { margin:0 0 6px; font-size:11px; color:#0891b2; }
  .bs-row { display:flex; justify-content:space-between; gap:8px; font-size:10.5px; padding:3px 0; border-bottom:1px dashed #e2e8f0; }
  .bs-row:last-child { border-bottom:0; } .bs-row span { color:#64748b; }
  .bs-kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); gap:8px; margin:10px 0; }
  .bs-kpi { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:9px 6px; text-align:center; }
  .bs-kl { font-size:10px; color:#64748b; } .bs-kv { font-size:19px; font-weight:700; color:#16a34a; } .bs-ku { font-size:9.5px; color:#64748b; }
  .bs-chip { display:inline-block; margin-top:4px; font-size:8.5px; padding:1px 7px; border-radius:10px; }
  .bs-measured { background:#dcfce7; color:#166534; } .bs-calculated { background:#cffafe; color:#155e75; }
  .bs-recorded { background:#e0e7ff; color:#3730a3; } .bs-estimate { background:#fef3c7; color:#92400e; }
  .bs-impact { border:1px solid #bbf7d0; background:#f0fdf4; border-radius:8px; padding:8px 12px; font-size:10.5px; line-height:1.7; margin-bottom:10px; }
  .bs-impact p { margin:3px 0; } .bs-muted { color:#475569; font-size:10px; }
  .bs-conf { border-radius:8px; padding:8px 12px; font-size:10.5px; margin-bottom:10px; border:1px solid; }
  .bs-conf b { font-size:11.5px; } .bs-conf small { display:block; color:#64748b; font-size:9px; margin-top:3px; }
  .bs-conf-high { background:#f0fdf4; border-color:#86efac; } .bs-conf-medium { background:#fffbeb; border-color:#fcd34d; } .bs-conf-low { background:#fef2f2; border-color:#fca5a5; }
  .bs-sdg span { display:inline-block; font-size:9.5px; background:#ecfeff; color:#155e75; border:1px solid #a5f3fc; border-radius:10px; padding:2px 9px; margin-left:5px; }
  .bs-assump { font-size:9.5px; color:#475569; margin:8px 0 0; padding-right:16px; } .bs-assump li { margin:2px 0; }
</style>
<h2>ملخص لضابط التمويل الأخضر</h2>
<div class="bs-two">
  <div class="bs-box"><h3>الأصل المموَّل</h3>${assetRows}</div>
  <div class="bs-box"><h3>التمويل</h3>${finRows}</div>
</div>
<div class="bs-kpis">${kpis}</div>
<div class="bs-impact"><b>الأثر البيئي</b>${impactHtml}</div>
<div class="bs-conf bs-conf-${b.confidence.level}"><b>${LEVEL_AR[b.confidence.level]}</b> — ${esc(b.confidence.oneLine)}<small>${esc(b.confidence.rule)}</small></div>
<div class="bs-sdg">${b.sdgs.map((s) => `<span>${esc(s)}</span>`).join('')}</div>
${b.assumptions.length > 0 ? `<ul class="bs-assump"><b>افتراضات وقيود:</b>${b.assumptions.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
<p class="bs-muted" style="margin:6px 0 0;">${esc(im.purposeNote)}</p>
</div>`
}

// ============== كتالوج المؤشرات البيئية الديناميكي (Environmental KPI Catalog) ==============
//
// وحدة نقية تبني مجموعات المؤشرات حسب نوع المشروع وما يتوفر من بيانات:
//  - لا فئات فارغة ولا أصفار "غير منطبقة" (لا نفايات/تنوع حيوي لمشروع شمسي، ولا طاقة لمشروع تشجير).
//  - لا مؤشرات مكررة بأسماء مختلفة (كان الاكتمال والتحقق والتتبع وتغطية التدقيق رقمًا واحدًا).
//  - كل مؤشر بأساسه: مقيس / محسوب بمنهجية / مُسجَّل / تقديري.
//  - وحدات موحّدة (الكربون بالطن) ونتائج قابلة لإعادة التوليد: لا يدخل تاريخ اليوم في حساب فترة منتهية.

import { BASIS_LABEL_AR, type Basis, type ProjectKind } from './report-bank-summary'

export interface KpiItem {
  key: string
  label: string
  value: number
  unit: string
  basis: Basis
  /** تفسير قصير يظهر تحت المؤشر (مصدر المعامل، الافتراض...) */
  note?: string
  decimals?: number
}

export interface KpiGroup {
  key: string
  title: string
  note?: string
  items: KpiItem[]
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000
export const DEFAULT_SURVIVAL_RATE = 0.85

// ---------------- التشجير: حساب واحد يُستخدم في كل التقرير ----------------
export interface AfforestationEstimate {
  alive: number
  survivalUsed: number
  survivalIsDefault: boolean
  yearsToEnd: number
  yearsInPeriod: number
  /** كغ CO₂e — تراكمي منذ الزراعة حتى نهاية الفترة (أو اليوم إن لم تنتهِ الفترة) */
  cumulativeKg: number
  /** كغ CO₂e — خلال الفترة فقط */
  periodKg: number
  /** كغ CO₂e/سنة بالمعدل الحالي */
  annualKg: number
}

export function estimateAfforestation(i: {
  treeCount: number
  survivalTarget?: number | null
  plantingDate?: Date | string | null
  periodStart: Date
  periodEnd: Date
  kgCo2PerTreePerYear: number
  now?: Date
}): AfforestationEstimate {
  const survivalIsDefault = !i.survivalTarget
  const survivalUsed = i.survivalTarget || DEFAULT_SURVIVAL_RATE
  const alive = Math.round((i.treeCount || 0) * survivalUsed)
  // نهاية الحساب = نهاية الفترة (وليس اليوم) حتى يعطي التقرير نفس الرقم كلما أُعيد توليده.
  const asOf = Math.min(i.periodEnd.getTime(), (i.now ?? new Date()).getTime())
  const planting = i.plantingDate ? new Date(i.plantingDate).getTime() : null
  const yearsToEnd = planting ? Math.max(0, (asOf - planting) / YEAR_MS) : 0
  const yearsInPeriod = planting ? Math.max(0, (asOf - Math.max(planting, i.periodStart.getTime())) / YEAR_MS) : 0
  return {
    alive,
    survivalUsed,
    survivalIsDefault,
    yearsToEnd,
    yearsInPeriod,
    cumulativeKg: alive * i.kgCo2PerTreePerYear * yearsToEnd,
    periodKg: alive * i.kgCo2PerTreePerYear * yearsInPeriod,
    annualKg: alive * i.kgCo2PerTreePerYear,
  }
}

// ---------------- بناء المجموعات ----------------
export interface KpiCatalogInput {
  kind: ProjectKind
  currency: string
  periodDays: number
  energy?: {
    totalEnergyKwh: number
    capacityKwp: number | null
    avoidedCo2Tons: number
    methodLabel: string
    gridFactor: { kgCo2PerKwh: number; basis: string; source: string; version: string } | null
    treeEquivalent: number
    carKm: number
    savings: number
    selfConsumptionSharePct: number
    projectValue: number | null
  }
  afforestation?: {
    treesPlanted: number
    plantedAreaM2: number | null
    treeSpecies: string | null
    plantingDate: Date | string | null
    kgCo2PerTreePerYear: number
    estimate: AfforestationEstimate
  }
  irrigation?: {
    waterUsedM3: number
    waterSavedM3: number
    waterSavedPct: number
    baselineM3: number | null
    avgSoilMoisturePct: number | null
    irrigatedAreaM2: number | null
    waterTariffPerM3: number | null
    pumpEnergyKwhPerM3: number | null
  }
  quality: { validPct: number; coveragePct: number; suspect: number; rejected: number; hashMismatches: number }
  attestation: { onChainVerifiedPct: number; confirmedBatches: number }
}

const ok = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n)

export function buildKpiCatalog(i: KpiCatalogInput): KpiGroup[] {
  const groups: KpiGroup[] = []
  const push = (g: KpiGroup) => {
    const items = g.items.filter((it) => ok(it.value))
    if (items.length > 0) groups.push({ ...g, items })
  }

  if (i.kind === 'energy' && i.energy) {
    const e = i.energy
    const cap = e.capacityKwp && e.capacityKwp > 0 ? e.capacityKwp : null
    push({
      key: 'energy',
      title: 'إنتاج الطاقة',
      items: [
        { key: 'capacity', label: 'القدرة المركّبة', value: cap as number, unit: 'kWp', basis: 'recorded' },
        { key: 'energy', label: 'الطاقة المُنتَجة', value: e.totalEnergyKwh, unit: 'kWh', basis: 'measured', note: 'مجموع قراءات العدّاد المعتمدة' },
        ...(cap
          ? [
              { key: 'yield', label: 'العائد النوعي', value: e.totalEnergyKwh / cap, unit: 'kWh/kWp', basis: 'measured' as Basis, note: 'الطاقة ÷ القدرة المركّبة' },
              {
                key: 'cf',
                label: 'عامل السعة',
                value: (e.totalEnergyKwh / (cap * i.periodDays * 24)) * 100,
                unit: '%',
                basis: 'measured' as Basis,
                note: 'الطاقة ÷ (القدرة × ساعات الفترة)',
              },
            ]
          : []),
      ],
    })
    push({
      key: 'carbon',
      title: 'الأثر الكربوني',
      items: [
        { key: 'avoided', label: 'الانبعاثات المتجنَّبة', value: e.avoidedCo2Tons, unit: 'طن CO₂e', basis: 'calculated', note: `الطاقة × معامل الشبكة — ${e.methodLabel} (Guardian)` },
        ...(e.gridFactor
          ? [{ key: 'ef', label: 'معامل الشبكة المستخدم', value: e.gridFactor.kgCo2PerKwh, unit: 'kgCO₂/kWh', basis: 'recorded' as Basis, decimals: 4, note: `${e.gridFactor.basis} — ${e.gridFactor.source} (${e.gridFactor.version})` }]
          : []),
        { key: 'trees', label: 'أشجار مكافئة', value: e.treeEquivalent, unit: 'شجرة/سنة', basis: 'calculated', decimals: 0, note: 'مكافئ توضيحي بعامل تحويل مرجعي' },
        { key: 'km', label: 'كم سيارة متجنَّب', value: e.carKm, unit: 'km', basis: 'calculated', decimals: 0, note: 'مكافئ توضيحي بعامل تحويل مرجعي' },
      ],
    })
    push({
      key: 'economy',
      title: 'الجدوى المالية',
      items: [
        {
          key: 'savings',
          label: 'الوفر المالي',
          value: e.savings,
          unit: i.currency,
          basis: 'estimate',
          note: `يفترض ${e.selfConsumptionSharePct}% استهلاكًا ذاتيًا والباقي تصديرًا`,
        },
        ...(e.projectValue ? [{ key: 'value', label: 'قيمة المشروع', value: e.projectValue, unit: i.currency, basis: 'recorded' as Basis, decimals: 0 }] : []),
      ],
    })
  }

  if (i.kind === 'afforestation' && i.afforestation) {
    const a = i.afforestation
    const ha = a.plantedAreaM2 && a.plantedAreaM2 > 0 ? a.plantedAreaM2 / 10_000 : null
    const est = a.estimate
    push({
      key: 'vegetation',
      title: 'الغطاء النباتي',
      items: [
        { key: 'trees', label: 'أشجار مزروعة', value: a.treesPlanted, unit: 'شجرة', basis: 'recorded', decimals: 0, note: a.treeSpecies ? `النوع: ${a.treeSpecies}` : undefined },
        { key: 'area', label: 'مساحة مزروعة', value: ha as number, unit: 'هكتار', basis: 'recorded' },
        ...(ha ? [{ key: 'density', label: 'كثافة الزراعة', value: a.treesPlanted / ha, unit: 'شجرة/هكتار', basis: 'calculated' as Basis, decimals: 0 }] : []),
        {
          key: 'survival',
          label: 'نسبة البقاء المعتمدة',
          value: est.survivalUsed * 100,
          unit: '%',
          basis: est.survivalIsDefault ? 'estimate' : 'recorded',
          decimals: 1,
          note: est.survivalIsDefault ? 'افتراضية (85%) لعدم تسجيل نسبة للمشروع' : 'مستهدفة ومُسجَّلة، وليست مقيسة حقليًا',
        },
        { key: 'alive', label: 'أشجار حيّة (تقديري)', value: est.alive, unit: 'شجرة', basis: 'estimate', decimals: 0 },
      ],
    })
    const hasPlanting = !!a.plantingDate
    push({
      key: 'sequestration',
      title: 'إزالة الكربون (تقديرية)',
      note: hasPlanting
        ? `تقدير بمعدل ${a.kgCo2PerTreePerYear} كغ CO₂/شجرة/سنة، وليس قياسًا للكتلة الحيوية؛ لا يطابق AR-ACM0003.`
        : 'تاريخ الزراعة غير مسجّل، فلا يمكن تقدير الإزالة.',
      items: hasPlanting
        ? [
            { key: 'cum', label: 'إجمالي حتى نهاية الفترة', value: est.cumulativeKg / 1000, unit: 'طن CO₂e', basis: 'estimate' },
            { key: 'period', label: 'خلال الفترة', value: est.periodKg / 1000, unit: 'طن CO₂e', basis: 'estimate' },
            { key: 'annual', label: 'المعدل السنوي', value: est.annualKg / 1000, unit: 'طن CO₂e/سنة', basis: 'estimate' },
          ]
        : [],
    })
  }

  if (i.kind === 'irrigation' && i.irrigation) {
    const w = i.irrigation
    const area = w.irrigatedAreaM2 && w.irrigatedAreaM2 > 0 ? w.irrigatedAreaM2 : null
    push({
      key: 'water',
      title: 'استهلاك المياه',
      items: [
        { key: 'used', label: 'مياه الري المستخدمة', value: w.waterUsedM3, unit: 'م³', basis: 'measured', note: 'من عدّاد المياه الذكي' },
        { key: 'baseline', label: 'استهلاك خط الأساس', value: w.baselineM3 as number, unit: 'م³', basis: 'estimate', note: 'من ميزانية الري/المعدل المسجّل للمشروع' },
        { key: 'saved', label: 'مياه موفَّرة', value: w.waterSavedM3, unit: 'م³', basis: 'calculated', note: 'خط الأساس − المقيس' },
        { key: 'pct', label: 'نسبة التوفير', value: w.waterSavedPct, unit: '%', basis: 'calculated', decimals: 1 },
        ...(area ? [{ key: 'intensity', label: 'كثافة الري', value: (w.waterUsedM3 * 1000) / (area * i.periodDays), unit: 'لتر/م²/يوم', basis: 'calculated' as Basis }] : []),
      ],
    })
    push({
      key: 'soil',
      title: 'رطوبة التربة',
      items: [{ key: 'moisture', label: 'متوسط رطوبة التربة', value: w.avgSoilMoisturePct as number, unit: '%', basis: 'measured', decimals: 1, note: 'قراءات معتمدة فقط' }],
    })
    push({
      key: 'irrigationEconomy',
      title: 'أثر التوفير',
      note: 'يُحسب فقط من معاملات مسجّلة للمشروع (تعرفة المياه، طاقة الضخ لكل م³).',
      items: [
        ...(w.waterTariffPerM3 ? [{ key: 'cost', label: 'قيمة المياه الموفَّرة', value: w.waterSavedM3 * w.waterTariffPerM3, unit: i.currency, basis: 'calculated' as Basis }] : []),
        ...(w.pumpEnergyKwhPerM3 ? [{ key: 'pump', label: 'طاقة ضخ موفَّرة', value: w.waterSavedM3 * w.pumpEnergyKwhPerM3, unit: 'kWh', basis: 'calculated' as Basis }] : []),
      ],
    })
  }

  push({
    key: 'quality',
    title: 'جودة البيانات',
    items: [
      { key: 'valid', label: 'قراءات صالحة', value: i.quality.validPct, unit: '%', basis: 'measured', decimals: 1 },
      { key: 'coverage', label: 'تغطية أيام الفترة', value: i.quality.coveragePct, unit: '%', basis: 'measured', decimals: 1 },
      { key: 'suspect', label: 'قراءات مشبوهة', value: i.quality.suspect, unit: 'قراءة', basis: 'measured', decimals: 0, note: 'مستبعدة من الحسابات' },
      { key: 'rejected', label: 'قراءات مرفوضة', value: i.quality.rejected, unit: 'قراءة', basis: 'measured', decimals: 0, note: 'مستبعدة من الحسابات' },
      { key: 'hash', label: 'عدم تطابق البصمات', value: i.quality.hashMismatches, unit: 'قراءة', basis: 'measured', decimals: 0 },
    ],
  })
  push({
    key: 'attestation',
    title: 'التوثيق والتتبع',
    items: [
      { key: 'onchain', label: 'موثّقة على Hedera', value: i.attestation.onChainVerifiedPct, unit: '%', basis: 'measured', decimals: 1 },
      { key: 'batches', label: 'دفعات توثيق مؤكدة', value: i.attestation.confirmedBatches, unit: 'دفعة', basis: 'measured', decimals: 0 },
    ],
  })
  return groups
}

// ---------------- العرض ----------------
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

export const fmtKpi = (it: KpiItem) =>
  it.value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: it.decimals ?? 2 })

export function renderKpiCatalogHtml(groups: KpiGroup[]): string {
  const body = groups
    .map(
      (g) => `
  <div class="kc-group">
    <h3>${esc(g.title)}</h3>
    ${g.note ? `<p class="kc-gnote">${esc(g.note)}</p>` : ''}
    <div class="kc-grid">
      ${g.items
        .map(
          (it) => `<div class="kc-card"><div class="kc-l">${esc(it.label)}</div><div class="kc-v">${fmtKpi(it)}</div><div class="kc-u">${esc(it.unit)}</div><span class="kc-chip kc-${it.basis}">${BASIS_LABEL_AR[it.basis]}</span>${it.note ? `<div class="kc-n">${esc(it.note)}</div>` : ''}</div>`,
        )
        .join('')}
    </div>
  </div>`,
    )
    .join('')
  return `
<div class="kc">
<style>
  .kc h3 { margin:12px 0 6px; font-size:12px; color:#0891b2; }
  .kc-gnote { margin:0 0 6px; font-size:9.5px; color:#92400e; }
  .kc-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(125px,1fr)); gap:8px; }
  .kc-card { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:8px 6px; text-align:center; }
  .kc-l { font-size:9.5px; color:#64748b; } .kc-v { font-size:16px; font-weight:700; color:#16a34a; } .kc-u { font-size:9px; color:#64748b; }
  .kc-n { font-size:8px; color:#94a3b8; margin-top:3px; line-height:1.4; }
  .kc-chip { display:inline-block; margin-top:3px; font-size:8px; padding:1px 6px; border-radius:10px; }
  .kc-measured { background:#dcfce7; color:#166534; } .kc-calculated { background:#cffafe; color:#155e75; }
  .kc-recorded { background:#e0e7ff; color:#3730a3; } .kc-estimate { background:#fef3c7; color:#92400e; }
</style>${body}
</div>`
}

const csvCell = (v: unknown) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function kpiGroupsToCsvRows(groups: KpiGroup[]): string[] {
  const rows = ['الفئة,المؤشر,القيمة,الوحدة,الأساس']
  for (const g of groups) {
    for (const it of g.items) {
      rows.push([g.title, it.label, it.value.toFixed(it.decimals ?? 2), it.unit, BASIS_LABEL_AR[it.basis]].map(csvCell).join(','))
    }
  }
  return rows
}

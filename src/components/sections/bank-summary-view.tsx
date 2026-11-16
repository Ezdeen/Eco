'use client'

// عرض "ملخص ضابط التمويل الأخضر" في معاينة التقرير. البيانات من buildBankSummary (src/lib/report-bank-summary.ts)
// وهي نفسها التي تُعرض في PDF والتنزيل، فلا تختلف الأرقام بين الشاشة والملف.

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BASIS_LABEL_AR, type BankSummary, type Basis, type ConfidenceLevel } from '@/lib/report-bank-summary'

const num = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })

const BASIS_STYLE: Record<Basis, string> = {
  measured: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  calculated: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
  recorded: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
  estimate: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
}

const LEVEL: Record<ConfidenceLevel, { label: string; box: string }> = {
  high: { label: 'ثقة عالية بالبيانات', box: 'border-green-300 bg-green-50 dark:bg-green-950/30 dark:border-green-800' },
  medium: { label: 'ثقة متوسطة بالبيانات', box: 'border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800' },
  low: { label: 'ثقة منخفضة بالبيانات', box: 'border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800' },
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 py-1 text-xs border-b border-dashed last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <b className="text-end">{value}</b>
    </div>
  )
}

export function BankSummaryView({ summary: b, fmtDate }: { summary: BankSummary; fmtDate: (d: Date | string) => string }) {
  const a = b.asset
  const fin = b.financing
  const im = b.impact
  const lv = LEVEL[b.confidence.level]

  return (
    <Card className="p-4 border-emerald-300 dark:border-emerald-800 space-y-4">
      <p className="text-base font-bold">ملخص لضابط التمويل الأخضر</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-lg border p-3">
          <p className="text-[11px] font-semibold text-cyan-700 dark:text-cyan-400 mb-1">الأصل المموَّل</p>
          <Row label="المشروع" value={`${a.name} (${a.code})`} />
          <Row label="النوع" value={a.typeLabel} />
          <Row label="الموقع" value={a.location || '—'} />
          {a.capacityKwp && <Row label="القدرة المركّبة" value={`${num(a.capacityKwp)} kWp`} />}
          <Row label="تاريخ التشغيل" value={a.commissionedAt ? fmtDate(a.commissionedAt) : '—'} />
          <Row label="الأجهزة المربوطة" value={String(a.devicesCount)} />
          <Row label="فترة التقرير" value={`${fmtDate(a.periodStart)} — ${fmtDate(a.periodEnd)} (${a.periodDays} يومًا)`} />
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-[11px] font-semibold text-cyan-700 dark:text-cyan-400 mb-1">التمويل</p>
          {fin ? (
            <>
              {fin.projectValue && <Row label="قيمة المشروع" value={`${num(fin.projectValue)} ${fin.currency}`} />}
              {fin.fundedAmount && <Row label="مبلغ التمويل" value={`${num(fin.fundedAmount)} ${fin.currency}${fin.fundedPct ? ` (${fin.fundedPct}%)` : ''}`} />}
              {fin.funders.map((f) => (
                <Row key={f.name} label={f.name} value={`نصيبه من الأثر ${f.sharePct}% ≈ ${num(f.attributedTons)} طن CO₂e`} />
              ))}
              {fin.annualisedSavings && <Row label="الوفر السنوي المتوقع (تقديري)" value={`${num(fin.annualisedSavings)} ${fin.currency}`} />}
              {fin.simplePaybackYears && <Row label="فترة الاسترداد البسيطة (تقديرية)" value={`${fin.simplePaybackYears} سنة`} />}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">لم تُسجَّل بيانات ممولين لهذا المشروع.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {b.headline.map((h) => (
          <div key={h.key} className="rounded-lg bg-muted/40 p-3 text-center">
            <p className="text-[11px] text-muted-foreground">{h.label}</p>
            <p className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{num(h.value)}</p>
            <p className="text-[10px] text-muted-foreground">{h.unit}</p>
            <span className={`inline-block mt-1 text-[9px] px-2 py-0.5 rounded-full ${BASIS_STYLE[h.basis]}`}>{BASIS_LABEL_AR[h.basis]}</span>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 dark:border-emerald-900 p-3 text-xs space-y-1">
        <p className="font-semibold">الأثر البيئي</p>
        {im.equivalents && (
          <p>
            يعادل زراعة نحو <b>{num(im.equivalents.trees)}</b> شجرة، أو تجنّب نحو <b>{num(im.equivalents.carKm)}</b> كم قيادة بسيارة.
          </p>
        )}
        <p className="text-muted-foreground">{im.howCalculated}</p>
        {im.gridFactor && (
          <p className="text-muted-foreground">
            معامل الشبكة: {im.gridFactor.kgCo2PerKwh} كغ CO₂/kWh — {im.gridFactor.basis} — المصدر: {im.gridFactor.source} ({im.gridFactor.version})
          </p>
        )}
        {im.reference && (
          <p>
            المرجع:{' '}
            <a href={im.reference.url} target="_blank" rel="noreferrer" className="underline text-emerald-700 dark:text-emerald-400">
              {im.reference.name} (Guardian)
            </a>
          </p>
        )}
      </div>

      <div className={`rounded-lg border p-3 text-xs ${lv.box}`}>
        <p>
          <b>{lv.label}</b> — {b.confidence.oneLine}
        </p>
        <p className="text-[10px] text-muted-foreground mt-1">{b.confidence.rule}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {b.sdgs.map((s) => (
          <Badge key={s} variant="outline" className="text-[10px]">
            {s}
          </Badge>
        ))}
      </div>

      {b.assumptions.length > 0 && (
        <div className="text-[11px] text-muted-foreground">
          <p className="font-semibold">افتراضات وقيود:</p>
          <ul className="list-disc pr-5 space-y-0.5">
            {b.assumptions.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">{im.purposeNote}</p>
    </Card>
  )
}

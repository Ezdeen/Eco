'use client'

// عرض كتالوج المؤشرات البيئية الديناميكي (من buildKpiCatalog). البيانات نفسها في PDF والتنزيل.

import { Card } from '@/components/ui/card'
import { BASIS_LABEL_AR, type Basis } from '@/lib/report-bank-summary'
import { fmtKpi, type KpiGroup } from '@/lib/report-kpi-catalog'

const BASIS_STYLE: Record<Basis, string> = {
  measured: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  calculated: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
  recorded: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
  estimate: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
}

export function KpiCatalogView({ groups }: { groups: KpiGroup[] }) {
  if (!groups || groups.length === 0) return null
  return (
    <Card className="p-4">
      <p className="text-sm font-semibold mb-1">الحسابات البيئية الشاملة</p>
      <p className="text-[10px] text-muted-foreground mb-3">
        مؤشرات هذا المشروع وهذه الفترة فقط، حسب نوع المشروع والبيانات المتوفرة. لكل مؤشر أساسه: مقيس، أو محسوب بمنهجية، أو مُسجَّل، أو تقديري.
      </p>
      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.key}>
            <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-400 mb-1">{g.title}</p>
            {g.note && <p className="text-[10px] text-amber-700 dark:text-amber-400 mb-2">{g.note}</p>}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {g.items.map((it) => (
                <div key={it.key} className="rounded-lg bg-muted/50 p-2 text-center">
                  <p className="text-[11px] text-muted-foreground">{it.label}</p>
                  <p className="font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{fmtKpi(it)}</p>
                  <p className="text-[10px] text-muted-foreground">{it.unit}</p>
                  <span className={`inline-block mt-1 text-[9px] px-2 py-0.5 rounded-full ${BASIS_STYLE[it.basis]}`}>{BASIS_LABEL_AR[it.basis]}</span>
                  {it.note && <p className="text-[9px] text-muted-foreground/80 mt-1 leading-snug">{it.note}</p>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

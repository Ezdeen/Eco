'use client'

// كتالوج المؤشرات البيئية: يُبنى ديناميكيًا من نوع المشروع وتعريفات Guardian (src/lib/kpi-catalog).
// لا مؤشرات مكتوبة هنا؛ كل ما يُعرض يأتي من الـ API.

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BookOpen, Droplet, ExternalLink, Info, Leaf, Sprout, TreePine, Zap, type LucideIcon } from 'lucide-react'
import type { CatalogGroup, CatalogItem, GuardianKpiCatalog, KpiBasis, KpiColor, KpiIcon } from '@/lib/kpi-catalog/types'

const ICONS: Record<KpiIcon, LucideIcon> = { zap: Zap, leaf: Leaf, trees: TreePine, droplet: Droplet, sprout: Sprout }

const COLORS: Record<KpiColor, { text: string; border: string; head: string }> = {
  amber: { text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200', head: 'from-amber-500 to-orange-600' },
  emerald: { text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200', head: 'from-emerald-500 to-teal-600' },
  green: { text: 'text-green-700 dark:text-green-400', border: 'border-green-200', head: 'from-green-500 to-emerald-600' },
  sky: { text: 'text-sky-700 dark:text-sky-400', border: 'border-sky-200', head: 'from-sky-500 to-blue-600' },
  blue: { text: 'text-blue-700 dark:text-blue-400', border: 'border-blue-200', head: 'from-blue-500 to-cyan-600' },
}

const BASIS_LABEL: Record<KpiBasis, string> = { measured: 'مقيس', calculated: 'محسوب', recorded: 'مُسجَّل', estimate: 'تقديري' }
const BASIS_STYLE: Record<KpiBasis, string> = {
  measured: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  calculated: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
  recorded: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
  estimate: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
}

const fmt = (it: CatalogItem) =>
  it.value === null ? '—' : it.value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: it.decimals })

function Chips({ it }: { it: CatalogItem }) {
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {it.status === 'available' && <span className={`text-[9px] px-2 py-0.5 rounded-full ${BASIS_STYLE[it.basis]}`}>{BASIS_LABEL[it.basis]}</span>}
      {it.claimGrade === 'indicative' && <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">تقديري، لا يصلح كادعاء معتمد</span>}
      {it.claimGrade === 'methodology_compliant' && <span className="text-[9px] px-2 py-0.5 rounded-full bg-green-100 text-green-800">مطابق للمنهجية</span>}
      {it.status === 'no_data' && <span className="text-[9px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">لا بيانات بعد</span>}
      {it.status === 'not_implemented' && <span className="text-[9px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">غير مفعّل</span>}
    </div>
  )
}

function GuardianInfo({ it }: { it: CatalogItem }) {
  if (!it.guardian && !it.note) return null
  return (
    <details className="mt-1 group">
      <summary className="cursor-pointer text-[10px] text-primary inline-flex items-center gap-1 select-none">
        <Info className="h-3 w-3" /> {it.guardian ? 'تعريف Guardian' : 'تفاصيل'}
      </summary>
      <div className="mt-1 space-y-1 text-[10px] text-muted-foreground leading-relaxed">
        {it.note && <p>{it.note}</p>}
        {it.guardian && (
          <>
            <p dir="ltr" className="text-left">{it.guardian.description}</p>
            <p className="font-mono" dir="ltr">
              {it.guardian.policy} › {it.guardian.schema}.{it.guardian.field}
              {it.guardian.unit ? ` [${it.guardian.unit}]` : ''}
            </p>
            {it.guardian.sourceUrl && (
              <a href={it.guardian.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline text-blue-700 dark:text-blue-300">
                المصدر في Guardian <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </>
        )}
      </div>
    </details>
  )
}

function Row({ it, color }: { it: CatalogItem; color: KpiColor }) {
  return (
    <div className="p-2 rounded-lg bg-muted/30">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium">{it.labelAr}</p>
          <p className="text-[10px] text-muted-foreground truncate">{it.label}</p>
        </div>
        <div className="text-left shrink-0">
          <p className={`text-sm font-bold tabular-nums ${it.value === null ? 'text-muted-foreground' : COLORS[color].text}`}>{fmt(it)}</p>
          {it.unit && <p className="text-[10px] text-muted-foreground">{it.unit}</p>}
        </div>
      </div>
      <Chips it={it} />
      <GuardianInfo it={it} />
    </div>
  )
}

function GroupCard({ g }: { g: CatalogGroup }) {
  const Icon = ICONS[g.icon]
  const c = COLORS[g.color]
  return (
    <Card className={`overflow-hidden ${c.border}`}>
      <div className={`px-3 py-2 bg-gradient-to-br ${c.head} text-white`}>
        <div className="text-sm font-semibold flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {g.title}
          <span className="text-xs opacity-80 mr-auto">{g.titleEn}</span>
        </div>
        <p className="text-[10px] opacity-90 mt-0.5">{g.source === 'guardian' ? 'مؤشرات معرَّفة في Guardian' : 'قياسات المنصة (لا يقابلها مخرج في Guardian)'}</p>
      </div>
      <CardContent className="p-3 space-y-2">
        {g.note && <p className="text-[10px] text-amber-700 dark:text-amber-400">{g.note}</p>}
        {g.items.map((it) => <Row key={it.key} it={it} color={g.color} />)}
      </CardContent>
    </Card>
  )
}

type Filter = 'all' | 'guardian' | 'platform'

export function GuardianKpiCatalogView({ catalog }: { catalog: GuardianKpiCatalog }) {
  const [filter, setFilter] = useState<Filter>('all')
  const groups = catalog.groups.filter((g) => filter === 'all' || g.source === filter)
  const m = catalog.methodology
  const cov = catalog.coverage

  return (
    <div className="space-y-4">
      <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
        <CardContent className="p-4 flex items-start gap-3">
          <BookOpen className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">{m.titleAr}</p>
              {m.formulaId && <Badge variant={m.implemented ? 'default' : 'secondary'} className="text-[10px]">{m.implemented ? 'مطبّقة' : 'غير مطبّقة بالكامل'}</Badge>}
            </div>
            <p className="text-sm text-blue-900 dark:text-blue-200">{catalog.summary}</p>
            {m.unmatchedReason && <p className="text-xs text-amber-700 dark:text-amber-400">{m.unmatchedReason}</p>}
            {m.sources.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {m.sources.map((s) => (
                  <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-700 underline dark:text-blue-300">
                    {s.label} <ExternalLink className="h-3 w-3" />
                  </a>
                ))}
              </div>
            )}
            <p className="text-[10px] text-blue-700/80 dark:text-blue-300/80">
              مصدر Guardian المثبّت: commit {catalog.provenance.commit?.slice(0, 7) ?? '—'}
              {cov.guardianTotal > 0 && ` · ${cov.guardianBound} من ${cov.guardianTotal} مخرجات Guardian مربوطة بقيم محسوبة`}
            </p>
          </div>
        </CardContent>
      </Card>

      {catalog.headline.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {catalog.headline.map((it) => (
            <Card key={it.key}>
              <CardContent className="p-3 text-center">
                <p className="text-[11px] text-muted-foreground">{it.labelAr}</p>
                <p className="text-2xl font-bold tabular-nums text-primary">{fmt(it)}</p>
                <p className="text-[10px] text-muted-foreground">{it.unit}</p>
                <div className="flex justify-center"><Chips it={it} /></div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {catalog.groups.length > 0 ? (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            {([['all', 'الكل'], ['guardian', 'من Guardian'], ['platform', 'قياسات المنصة']] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={`text-xs px-3 py-1 rounded-full border ${filter === k ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups.map((g) => <GroupCard key={g.key} g={g} />)}
          </div>
        </>
      ) : (
        <Card><CardContent className="p-5 text-sm text-muted-foreground">{catalog.summary}</CardContent></Card>
      )}

      {cov.unbound.length > 0 && (
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-xs font-semibold">مخرجات Guardian غير المربوطة بعد ({cov.unbound.length})</summary>
          <p className="text-[10px] text-muted-foreground mt-2 mb-2">معرَّفة في سياسة Guardian لكن المنصة لا تحسبها حاليًا (تُفترض صفرًا أو غير متوفرة).</p>
          <ul className="space-y-1">
            {cov.unbound.map((u) => (
              <li key={`${u.schema}.${u.field}`} className="text-[11px] flex flex-wrap gap-x-2" dir="ltr">
                <span className="font-mono text-muted-foreground">{u.schema}.{u.field}</span>
                <span>{u.label}{u.unit ? ` [${u.unit}]` : ''}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

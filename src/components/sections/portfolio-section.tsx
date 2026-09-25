'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Landmark, Sun, Zap, Leaf, TreePine, ShieldCheck, Satellite, Gauge,
  Loader2, Save, Info, AlertTriangle, Download, FileClock, Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

interface PortfolioMetrics {
  greenProjectsFinanced: number
  solarCapacityFinancedMw: number
  renewableElectricityGeneratedGwh: number
  financedAvoidedEmissionsTco2e: number
  totalAvoidedEmissionsTco2e: number
  carbonRemovalsTco2e: number
  projectsIndependentlyVerifiedPct: number
  satelliteVerifiedProjectsPct: number
  environmentalDataConfidencePct: number
  confidenceBreakdown: {
    formula: string
    weights: { dataQuality: number; satelliteVerification: number; ledgerAttestation: number }
    components: { dataQualityPct: number; satelliteVerificationPct: number; ledgerAttestationPct: number }
  }
  definitions: Record<string, string>
  limitations: string[]
}

interface PortfolioProject {
  projectId: string
  projectName: string
  projectCode: string
  verificationStatus: 'fully_verified' | 'satellite_only' | 'ledger_only' | 'unverified'
}

interface PortfolioResult {
  organizationId: string
  periodStart: string
  periodEnd: string
  generatedAt: string
  metrics: PortfolioMetrics
  projects: PortfolioProject[]
}

const VERIFICATION_LABELS: Record<string, { label: string; color: string }> = {
  fully_verified: { label: 'موثَّق بالكامل (فضاء + Hedera)', color: 'bg-emerald-100 text-emerald-700' },
  satellite_only: { label: 'مطابَق فضائيًا فقط', color: 'bg-blue-100 text-blue-700' },
  ledger_only: { label: 'موثَّق على Hedera فقط', color: 'bg-amber-100 text-amber-700' },
  unverified: { label: 'غير موثَّق بعد', color: 'bg-slate-100 text-slate-600' },
}

function fmt(n: number | null | undefined, opts?: Intl.NumberFormatOptions) {
  return (n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2, ...opts })
}

interface SavedReport {
  id: string
  title: string
  periodStart: string
  periodEnd: string
  status: 'draft' | 'published'
  createdAt: string
  projectCount: number
}

// قائمة اللقطات المحفوظة سابقًا — كل لقطة أرقامها مُجمَّدة وقت الإصدار (لا تتحدّث
// تلقائيًا)، بخلاف البطاقات الحية أعلاه. هذا هو المرفق الفعلي القابل للتحميل والإرسال
// لجهة خارجية (بنك/مدقق)، بنفس مبدأ AttestationBatch.
function SavedReportsList({ refreshKey }: { refreshKey: number }) {
  const [reports, setReports] = useState<SavedReport[]>([])
  const [loading, setLoading] = useState(true)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    fetch('/api/portfolio-reports')
      .then((r) => r.json())
      .then((d) => setReports(d.reports || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(load, [refreshKey])

  const handleDownload = async (id: string, title: string) => {
    setDownloadingId(id)
    try {
      const res = await fetch(`/api/portfolio-reports/${id}/pdf`)
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        // details يحتوي السبب التقني الفعلي (خطأ Playwright، حقل ناقص في اللقطة...)
        // بينما error رسالة عامة — نعرض الاثنين معًا كي لا يختفي التشخيص الحقيقي.
        const message = d?.details ? `${d?.error || 'فشل توليد الملف'}: ${d.details}` : (d?.error || 'فشل توليد الملف')
        throw new Error(message)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${title.replace(/\s+/g, '-')}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      toast.error(e.message || 'حدث خطأ أثناء تحميل الملف')
    } finally {
      setDownloadingId(null)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/portfolio-reports/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        throw new Error(d?.error || 'فشل الحذف')
      }
      setReports((prev) => prev.filter((r) => r.id !== id))
      toast.success('تم حذف اللقطة')
    } catch (e: any) {
      toast.error(e.message || 'حدث خطأ أثناء الحذف')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (reports.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        لا توجد لقطات محفوظة بعد — اضغط "حفظ لقطة تقرير دائمة" أعلاه لإصدار أول إفصاح.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {reports.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border">
          <div className="min-w-0 flex items-center gap-2.5">
            <FileClock className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{r.title}</p>
              <p className="text-xs text-muted-foreground">
                {r.projectCount} مشروعًا · {new Date(r.createdAt).toLocaleDateString('en-US')}
                {' · '}
                <Badge variant={r.status === 'published' ? 'default' : 'secondary'} className="text-[10px] py-0 px-1.5 align-middle">
                  {r.status === 'published' ? 'منشور' : 'مسودة'}
                </Badge>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleDownload(r.id, r.title)}
              disabled={downloadingId === r.id}
            >
              {downloadingId === r.id
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Download className="h-3.5 w-3.5" />}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleDelete(r.id)}
              disabled={deletingId === r.id}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              {deletingId === r.id
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Trash2 className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

// بطاقة مؤشر واحدة — بنفس شكل الـ KPI cards المستخدمة في dashboard-section، لكن مع
// دعم عرض ملاحظة توضيحية (tooltip) لأي مؤشر يحتاج تعريفًا صريحًا (كما طلب البنك).
function MetricCard({
  icon: Icon, label, value, unit, tooltip, accent = 'text-foreground',
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  unit?: string
  tooltip?: string
  accent?: string
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{label}</span>
              {tooltip && (
                <span title={tooltip}>
                  <Info className="h-3 w-3 shrink-0 opacity-60" />
                </span>
              )}
            </div>
            <p className={`text-2xl font-bold tabular-nums ${accent}`}>
              {value}
              {unit && <span className="text-sm font-normal text-muted-foreground ms-1">{unit}</span>}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function PortfolioSection() {
  const [data, setData] = useState<PortfolioResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [reportsRefreshKey, setReportsRefreshKey] = useState(0)

  const load = () => {
    setLoading(true)
    setError(null)
    fetch('/api/portfolio')
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d?.error || 'فشل تحميل مؤشرات المحفظة')
        return d
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleSaveSnapshot = async () => {
    if (!data) return
    setSaving(true)
    try {
      const title = `إفصاح محفظة التمويل الأخضر — ${new Date().toLocaleDateString('en-US')}`
      const res = await fetch('/api/portfolio-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.error || 'فشل حفظ اللقطة')
      toast.success('تم حفظ لقطة تقرير المحفظة بنجاح — الأرقام الآن مُجمَّدة ولن تتغيّر تلقائيًا')
      setReportsRefreshKey((k) => k + 1)
    } catch (e: any) {
      toast.error(e.message || 'حدث خطأ أثناء الحفظ')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-red-600 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> {error}
          </p>
        </CardContent>
      </Card>
    )
  }

  if (!data) return null
  const m = data.metrics

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Landmark className="h-4 w-4" />
          <span>
            {m.greenProjectsFinanced} مشروعًا · محدَّث {new Date(data.generatedAt).toLocaleString('en-US')}
          </span>
        </div>
        <Button size="sm" onClick={handleSaveSnapshot} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : <Save className="h-4 w-4 me-2" />}
          حفظ لقطة تقرير دائمة
        </Button>
      </div>

      {/* المؤشرات الثمانية */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard icon={Landmark} label="Green projects financed" value={fmt(m.greenProjectsFinanced, { maximumFractionDigits: 0 })} />
        <MetricCard icon={Sun} label="Solar capacity financed" value={fmt(m.solarCapacityFinancedMw)} unit="MW" />
        <MetricCard icon={Zap} label="Renewable electricity generated" value={fmt(m.renewableElectricityGeneratedGwh)} unit="GWh" />
        <MetricCard
          icon={Leaf}
          label="Financed avoided emissions"
          value={fmt(m.financedAvoidedEmissionsTco2e)}
          unit="tCO₂e"
          tooltip={m.definitions.financedAvoidedEmissions}
          accent="text-emerald-700"
        />
        <MetricCard
          icon={TreePine}
          label="Carbon removals"
          value={fmt(m.carbonRemovalsTco2e)}
          unit="tCO₂e"
          tooltip={m.definitions.carbonRemovals}
        />
        <MetricCard
          icon={ShieldCheck}
          label="Projects independently verified"
          value={fmt(m.projectsIndependentlyVerifiedPct)}
          unit="%"
          tooltip={m.definitions.projectsIndependentlyVerified}
        />
        <MetricCard
          icon={Satellite}
          label="Satellite-verified projects"
          value={fmt(m.satelliteVerifiedProjectsPct)}
          unit="%"
          tooltip={m.definitions.satelliteVerified}
        />
        <MetricCard
          icon={Gauge}
          label="Environmental data confidence"
          value={fmt(m.environmentalDataConfidencePct)}
          unit="%"
          tooltip={m.confidenceBreakdown.formula}
          accent="text-blue-700"
        />
      </div>

      {/* مرجع إضافي: الأثر الكلي (100%) للمقارنة مع نصيب الممول */}
      <Card className="bg-muted/30">
        <CardContent className="pt-4 pb-4 flex items-center justify-between flex-wrap gap-2 text-sm">
          <span className="text-muted-foreground">
            إجمالي الأثر الكامل لكل المشاريع (100%، للمقارنة مع نصيب الجهة الممولة أعلاه)
          </span>
          <span className="font-bold tabular-nums">{fmt(m.totalAvoidedEmissionsTco2e)} tCO₂e</span>
        </CardContent>
      </Card>

      {/* تفكيك معادلة ثقة البيانات — شفافية إلزامية، لا رقم "صندوق أسود" */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Gauge className="h-5 w-5 text-blue-600" />
            تفكيك مؤشر "ثقة البيانات البيئية"
          </CardTitle>
          <CardDescription className="text-xs font-mono" dir="ltr">
            {m.confidenceBreakdown.formula}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: 'جودة البيانات (قراءات مُدقَّقة)', value: m.confidenceBreakdown.components.dataQualityPct, weight: m.confidenceBreakdown.weights.dataQuality },
            { label: 'المطابقة الفضائية-الأرضية', value: m.confidenceBreakdown.components.satelliteVerificationPct, weight: m.confidenceBreakdown.weights.satelliteVerification },
            { label: 'التوثيق على Hedera', value: m.confidenceBreakdown.components.ledgerAttestationPct, weight: m.confidenceBreakdown.weights.ledgerAttestation },
          ].map((c) => (
            <div key={c.label}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span>{c.label} <span className="text-muted-foreground">(وزن {Math.round(c.weight * 100)}%)</span></span>
                <span className="font-medium tabular-nums">{fmt(c.value)}%</span>
              </div>
              <Progress value={c.value} className="h-1.5" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* حالة التحقق لكل مشروع */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">حالة التحقق لكل مشروع</CardTitle>
          <CardDescription className="text-xs">
            fully_verified يعني اجتياز بوابة المطابقة الفضائية-الأرضية معًا مع وجود ملف إثبات مؤكَّد على Hedera
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.projects.map((p) => (
              <div key={p.projectId} className="flex items-center justify-between gap-3 p-2.5 rounded-lg border">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.projectName}</p>
                  <p className="text-xs text-muted-foreground">{p.projectCode}</p>
                </div>
                <Badge className={`text-[10px] shrink-0 ${VERIFICATION_LABELS[p.verificationStatus]?.color}`}>
                  {VERIFICATION_LABELS[p.verificationStatus]?.label}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* التعريفات والقيود — إلزامية لأي إفصاح يُرسَل لجهة خارجية */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">التعريفات المنهجية والقيود المُفصَح عنها</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="definitions">
              <AccordionTrigger className="text-sm">تعريف كل مؤشر بدقة</AccordionTrigger>
              <AccordionContent className="space-y-3 text-xs text-muted-foreground leading-relaxed">
                {Object.entries(m.definitions).map(([key, text]) => (
                  <p key={key}>{text}</p>
                ))}
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="limitations">
              <AccordionTrigger className="text-sm">القيود الحالية (Limitations)</AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-2 text-xs text-muted-foreground list-disc pr-4">
                  {m.limitations.map((l, i) => <li key={i}>{l}</li>)}
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* اللقطات المحفوظة سابقًا — قابلة للتحميل كـ PDF لإرسالها للبنك/المدقق */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileClock className="h-5 w-5 text-muted-foreground" />
            اللقطات المحفوظة (Snapshots)
          </CardTitle>
          <CardDescription className="text-xs">
            كل لقطة أرقامها مُجمَّدة وقت الإصدار — هذا هو المرفق الفعلي القابل للإرسال لجهة خارجية
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SavedReportsList refreshKey={reportsRefreshKey} />
        </CardContent>
      </Card>
    </div>
  )
}

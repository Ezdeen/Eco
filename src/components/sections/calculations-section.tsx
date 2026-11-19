'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Calculator, Zap, Leaf, Droplet, Recycle, TreePine, Bird, DollarSign,
  ShieldCheck, Database, Activity, Gauge, TrendingUp, FlaskConical, Code2,
  FileCheck, ExternalLink, Eye, BookOpen, Network, AlertCircle, CheckCircle2, Sprout,
} from 'lucide-react'
import { toast } from 'sonner'
import { GuardianKpiCatalogView } from '@/components/sections/guardian-kpi-catalog'
import type { GuardianKpiCatalog } from '@/lib/kpi-catalog/types'

const fmt = (n: number) => (n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
// Exact formatter for KPI Catalog / Traceable KPIs: shows the real value as computed from
// the database, with thousands separators for readability but WITHOUT rounding or capping
// decimal places (unlike fmt, which rounds/caps to 2 decimals).
const fmtExact = (n: number) => {
  const value = n || 0
  const [intPart, decPart] = value.toString().split('.')
  const withSeparators = Number(intPart).toLocaleString('en-US')
  return decPart ? `${withSeparators}.${decPart}` : withSeparators
}

export function CalculationsSection() {
  const [projects, setProjects] = useState<any[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [recentRuns, setRecentRuns] = useState<any[]>([])
  const [guardianKpiCatalog, setGuardianKpiCatalog] = useState<GuardianKpiCatalog | null>(null)
  const [kpiCatalogProjectId, setKpiCatalogProjectId] = useState('')
  const [kpiCatalogLoading, setKpiCatalogLoading] = useState(false)
  const [kpiCatalogError, setKpiCatalogError] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<any>(null)
  // ESG frameworks
  const [esgData, setEsgData] = useState<any>(null)
  const [traceDialog, setTraceDialog] = useState<any>(null)
  const calculationsRequestId = useRef(0)
  const selectedProjectInfo = projects.find((project) => project.id === selectedProject)

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then((d) => { if (d && d.projects) setProjects(d.projects) })
      .catch(() => {})
  }, [])

  // Re-fetch KPI Catalog + Traceable KPIs whenever the selected project changes.
  useEffect(() => {
    fetchCalculations(selectedProject)
    fetchEsgFrameworks(selectedProject)
  }, [selectedProject])

  const fetchCalculations = async (projectId?: string) => {
    const requestId = ++calculationsRequestId.current
    setKpiCatalogLoading(Boolean(projectId))
    setKpiCatalogError(false)
    try {
      const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''
      const res = await fetch(`/api/calculations${qs}`)
      if (!res.ok) throw new Error('Failed to load calculation KPIs')
      const data = await res.json()
      if (requestId !== calculationsRequestId.current) return
      setRecentRuns(data.calculationRuns || [])
      setGuardianKpiCatalog(data.guardianKpiCatalog || null)
      setKpiCatalogProjectId(projectId || '')
    } catch {
      if (requestId !== calculationsRequestId.current) return
      setKpiCatalogError(true)
      toast.error('تعذر تحميل مؤشرات المشروع')
    } finally {
      if (requestId === calculationsRequestId.current) setKpiCatalogLoading(false)
    }
  }

  const fetchEsgFrameworks = async (projectId?: string) => {
    try {
      const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''
      const res = await fetch(`/api/esg-frameworks${qs}`)
      if (!res.ok) return
      const data = await res.json()
      if (data && data.frameworks) {
        setEsgData(data)
      }
    } catch {}
  }

  const runCalculation = async () => {
    if (!selectedProject) {
      toast.error('اختر مشروعًا أولاً')
      return
    }
    setRunning(true)
    setResult(null)
    try {
      const now = new Date()
      const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      const res = await fetch('/api/calculations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject,
          periodStart: periodStart.toISOString(),
          periodEnd: now.toISOString(),
          methodologyVersion: 'ghg_protocol_scope2_v1.2',
        }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (data && data.success) {
        setResult(data)
        toast.success('اكتمل الحساب بنجاح')
        fetchCalculations(selectedProject)
        fetchEsgFrameworks(selectedProject)
      } else {
        toast.error('فشل الحساب')
      }
    } catch {
      toast.error('خطأ في الاتصال')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <Card className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-0">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-cairo text-2xl font-bold mb-1">Environmental KPI Catalog</h2>
              <p className="text-sm opacity-90">
                مؤشرات مرتبطة بنوع المشروع المحدد، مع إظهار مرجع Guardian وحدود تطبيق المنهجية
              </p>
              <Badge variant="outline" className="mt-2 border-white/40 text-white bg-white/10">
                {selectedProjectInfo
                  ? `المشروع: ${selectedProjectInfo.nameAr || selectedProjectInfo.name}`
                  : 'اختر مشروعًا لعرض مؤشرات نوعه فقط'}
              </Badge>
            </div>
            <Database className="h-12 w-12 opacity-80" />
          </div>
        </CardContent>
      </Card>

      {/* Run calculation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            تشغيل حساب جديد
          </CardTitle>
          <CardDescription className="text-xs">
            يتم حفظ إصدار الصيغة والمعاملات والمدخلات لإعادة إنتاج كل نتيجة لاحقًا
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">المشروع</Label>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger><SelectValue placeholder="اختر مشروعًا" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nameAr || p.name} ({p.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">المنهجية</Label>
              <Select defaultValue="ghg_protocol_scope2_v1.2">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ghg_protocol_scope2_v1.2">GHG Protocol Scope 2 v1.2</SelectItem>
                  <SelectItem value="iso_14064_2_v1.0">ISO 14064-2 v1.0</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">الفترة</Label>
              <Select defaultValue="30d">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">آخر 7 أيام</SelectItem>
                  <SelectItem value="30d">آخر 30 يومًا</SelectItem>
                  <SelectItem value="90d">آخر 90 يومًا</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={runCalculation} disabled={running || !selectedProject}>
            <Calculator className="h-4 w-4 ml-1" />
            {running ? 'جاري الحساب...' : 'تشغيل الحساب'}
          </Button>

          {result && (
            <div className="mt-4 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
                <h4 className="font-semibold text-sm">نتائج الحساب</h4>
                <Badge variant="outline" className="text-xs ml-auto">Run ID: {result.run.id.slice(0, 8)}</Badge>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">إجمالي الطاقة</p>
                  <p className="font-bold tabular-nums">{fmt(result.details.totalEnergyKwh)} kWh</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">CO₂e متجنب (100% المشروع)</p>
                  <p className="font-bold tabular-nums">{fmt(result.details.totalCo2AvoidedKg)} kg</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">الوفر</p>
                  <p className="font-bold tabular-nums">
                    {fmt(result.details.totalSavings)} {result.details.savingsCurrency || 'SAR'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Performance Ratio</p>
                  <p className="font-bold tabular-nums">{(result.details.performanceRatio * 100).toFixed(1)}%</p>
                </div>
              </div>

              {result.details.fundingAttribution && result.details.fundingAttribution.length > 0 && (
                <div className="mt-3 pt-3 border-t border-emerald-200">
                  <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                    نصيب الجهات الممولة (PCAF Attribution)
                  </p>
                  <div className="space-y-1.5">
                    {result.details.fundingAttribution.map((f: any) => (
                      <div key={f.funderId} className="flex items-center justify-between text-xs bg-white/60 dark:bg-black/20 rounded-lg px-3 py-1.5">
                        <span>{f.funderNameAr || f.funderName} <span className="text-muted-foreground">({f.attributionSharePct}%)</span></span>
                        <span className="font-bold tabular-nums">{fmt(f.attributableCo2AvoidedKg)} kg CO₂e</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {result.details.currencyMismatchWarning && (
                <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
                  ⚠️ تعرفة الدولة المرجعية بعملة مختلفة عن عملة المشروع؛ تم استخدام تعرفة المشروع الاحتياطية بدلاً منها.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs: KPI Catalog | ESG Frameworks | Traceable KPIs | Recent Runs */}
      <Tabs defaultValue="kpi" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 max-w-2xl">
          <TabsTrigger value="kpi" className="gap-1 text-xs">
            <Database className="h-3.5 w-3.5" /> KPI Catalog
          </TabsTrigger>
          <TabsTrigger value="esg" className="gap-1 text-xs">
            <FileCheck className="h-3.5 w-3.5" /> أطر ESG
          </TabsTrigger>
          <TabsTrigger value="traceable" className="gap-1 text-xs">
            <Network className="h-3.5 w-3.5" /> Traceable KPIs
          </TabsTrigger>
          <TabsTrigger value="runs" className="gap-1 text-xs">
            <FlaskConical className="h-3.5 w-3.5" /> سجل الحسابات
          </TabsTrigger>
        </TabsList>

        {/* KPI Catalog Tab */}
        <TabsContent value="kpi" className="mt-4">
          <div>
            {!selectedProject && (
              <Card>
                <CardContent className="p-5 text-sm text-muted-foreground">
                  اختر مشروعًا من القائمة لعرض المؤشرات المرتبطة بنوعه دون خلط بيانات المشاريع المختلفة.
                </CardContent>
              </Card>
            )}
            {selectedProject && kpiCatalogProjectId !== selectedProject && (
              <Card>
                <CardContent className="p-5 text-sm text-muted-foreground">
                  {kpiCatalogLoading
                    ? 'جاري تحميل مؤشرات المشروع...'
                    : kpiCatalogError
                      ? 'تعذر تحميل المؤشرات. حاول تغيير المشروع أو تحديث الصفحة.'
                      : 'جاري تجهيز مؤشرات المشروع...'}
                </CardContent>
              </Card>
            )}
            {selectedProject && kpiCatalogProjectId === selectedProject && guardianKpiCatalog && (
              <GuardianKpiCatalogView catalog={guardianKpiCatalog} />
            )}
          </div>
        </TabsContent>

        {/* ESG Frameworks Tab */}
        <TabsContent value="esg" className="mt-4 space-y-4">
          {esgData ? (
            <>
              <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-1">ملاحظة مهمة حول أطر ESG</p>
                      <p className="text-xs text-blue-800 dark:text-blue-400 leading-relaxed">
                        {esgData.note} المنصة توائم البيانات مع {esgData.totalFrameworks} أطر دولية مختلفة. كل مؤشر قابل للتتبع (Traceable) يعرض مصدره وطريقة حسابه والإطار المرتبط به.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {esgData.frameworks.map((fw: any) => (
                  <Card key={fw.code} className="overflow-hidden">
                    <CardHeader className="pb-2 bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <FileCheck className="h-4 w-4" />
                        {fw.name}
                        <span className="text-[10px] opacity-80 mr-auto">{fw.code}</span>
                      </CardTitle>
                      <p className="text-xs opacity-90">{fw.nameAr}</p>
                    </CardHeader>
                    <CardContent className="p-3 space-y-2">
                      <p className="text-xs text-muted-foreground leading-relaxed">{fw.description}</p>
                      <div className="flex items-center gap-2 text-[10px]">
                        <Badge variant="outline" className="text-[10px]">{fw.scope}</Badge>
                        <Badge variant="outline" className="text-[10px]">{fw.version}</Badge>
                      </div>
                      <Separator />
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold text-muted-foreground">المؤشرات المرتبطة ({fw.mapping.length}):</p>
                        {fw.mapping.slice(0, 3).map((m: any, i: number) => (
                          <div key={i} className="flex items-center gap-1 text-[10px]">
                            <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600 shrink-0" />
                            <span className="font-mono">{m.kpi}</span>
                            <span className="text-muted-foreground truncate">→ {m.frameworkRef}</span>
                          </div>
                        ))}
                        {fw.mapping.length > 3 && (
                          <p className="text-[10px] text-muted-foreground">+ {fw.mapping.length - 3} المزيد</p>
                        )}
                      </div>
                      <a
                        href={fw.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                      >
                        <ExternalLink className="h-2.5 w-2.5" />
                        زيارة الموقع الرسمي
                      </a>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          ) : (
            <Card className="animate-pulse h-96 bg-muted/40" />
          )}
        </TabsContent>

        {/* Traceable KPIs Tab */}
        <TabsContent value="traceable" className="mt-4 space-y-4">
          {esgData?.traceableKPIs ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <Network className="h-5 w-5 text-primary" />
                <h3 className="font-cairo text-lg font-bold">Traceable KPIs - مؤشرات قابلة للتتبع</h3>
                <Badge variant="outline" className="text-xs bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700">
                  {esgData.traceableKPIs.length} مؤشر
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                كل مؤشر يعرض مصدره، طريقة حسابه، أصل البيانات، حالة التحقق، ومسار التدقيق - مما يضمن قابلية التتبع والشفافية الكاملة.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {esgData.traceableKPIs.map((kpi: any) => (
                  <Card key={kpi.key} className="overflow-hidden">
                    <CardHeader className="pb-2 bg-muted/30">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <CardTitle className="text-sm">{kpi.labelAr}</CardTitle>
                          <p className="text-[10px] text-muted-foreground">{kpi.labelEn}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {kpi.value !== null ? (
                            <p className="text-lg font-bold tabular-nums text-primary">{fmtExact(kpi.value)}</p>
                          ) : kpi.byCurrency ? (
                            <div className="text-left">
                              {Object.entries(kpi.byCurrency).map(([currency, amount]) => (
                                <p key={currency} className="text-sm font-bold tabular-nums text-primary">
                                  {fmtExact(amount as number)} {currency}
                                </p>
                              ))}
                            </div>
                          ) : (
                            <p className="text-lg font-bold tabular-nums text-primary">—</p>
                          )}
                          <p className="text-[10px] text-muted-foreground">{kpi.unit}</p>
                          {kpi.classification && (
                            <Badge variant="outline" className={`text-[9px] ${
                              kpi.classification === 'موثق' ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200' :
                              kpi.classification === 'محسوب' ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200' :
                              kpi.classification === 'تقديري' ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200' :
                              'bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 border-violet-200'
                            }`}>
                              {kpi.classification}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-3 space-y-2">
                      <div className="space-y-1.5 text-xs">
                        <div className="flex items-start gap-2">
                          <Database className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                          <div>
                            <p className="text-muted-foreground">المصدر:</p>
                            <p className="font-medium">{kpi.source}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <Calculator className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                          <div>
                            <p className="text-muted-foreground">طريقة الحساب:</p>
                            <p className="font-medium text-[11px]">{kpi.calculationMethod}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <BookOpen className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                          <div>
                            <p className="text-muted-foreground">أصل البيانات:</p>
                            <p className="font-medium text-[11px]">{kpi.dataOrigin}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <ShieldCheck className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                          <div>
                            <p className="text-muted-foreground">حالة التحقق:</p>
                            <Badge variant="outline" className="text-[10px] bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700">
                              {kpi.verificationStatus}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <FileCheck className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                          <div>
                            <p className="text-muted-foreground">مسار التدقيق:</p>
                            <p className="font-medium text-[11px]">{kpi.auditTrail}</p>
                          </div>
                        </div>
                      </div>
                      <Separator />
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground mb-1">الأطر المتوافقة ({kpi.frameworks.length}):</p>
                        <div className="flex flex-wrap gap-1">
                          {kpi.frameworks.map((fw: any, i: number) => (
                            <Badge key={i} variant="outline" className="text-[9px] bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300" title={fw.ref}>
                              {fw.code}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full h-7 text-xs"
                        onClick={() => setTraceDialog(kpi)}
                      >
                        <Eye className="h-3 w-3 ml-1" />
                        عرض تفاصيل التتبع
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          ) : (
            <Card className="animate-pulse h-96 bg-muted/40" />
          )}
        </TabsContent>

        {/* Recent Runs Tab */}
        <TabsContent value="runs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FlaskConical className="h-5 w-5" />
                آخر عمليات الحساب
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {recentRuns.slice(0, 10).map((r) => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 hover:bg-muted transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Code2 className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{r.project?.nameAr || r.project?.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.periodStart).toLocaleDateString('ar-SA')} → {new Date(r.periodEnd).toLocaleDateString('ar-SA')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <div className="text-left">
                      <p className="font-semibold tabular-nums">{r.totalEnergyKwh?.toLocaleString() || '—'} kWh</p>
                      <p className="text-muted-foreground">{r.totalCo2AvoidedKg?.toLocaleString() || '—'} kgCO₂e</p>
                    </div>
                    <Badge variant="outline" className="text-xs">{r.methodologyVersion}</Badge>
                    <Badge variant="default" className="text-xs bg-emerald-600">{r.status === 'completed' ? 'مكتمل' : r.status}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Trace Dialog */}
      <Dialog open={!!traceDialog} onOpenChange={(open) => !open && setTraceDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Network className="h-5 w-5 text-primary" />
              تفاصيل التتبع - {traceDialog?.labelAr}
            </DialogTitle>
            <DialogDescription>
              {traceDialog?.labelEn} - معلومات كاملة عن مصدر البيانات وقابلية التدقيق
            </DialogDescription>
          </DialogHeader>
          {traceDialog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-muted/30">
                  <p className="text-xs text-muted-foreground">القيمة الحالية</p>
                  <p className="text-xl font-bold tabular-nums text-primary">{fmtExact(traceDialog.value)} {traceDialog.unit}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30">
                  <p className="text-xs text-muted-foreground">آخر تحقق</p>
                  <p className="text-sm font-medium">{traceDialog.lastVerified}</p>
                </div>
              </div>
              <Separator />
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">المصدر</p>
                  <p className="text-sm">{traceDialog.source}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">طريقة الحساب</p>
                  <p className="text-sm font-mono bg-muted/30 p-2 rounded">{traceDialog.calculationMethod}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">أصل البيانات</p>
                  <p className="text-sm">{traceDialog.dataOrigin}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">حالة التحقق</p>
                  <Badge variant="outline" className="bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700">
                    {traceDialog.verificationStatus}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">مسار التدقيق</p>
                  <p className="text-sm">{traceDialog.auditTrail}</p>
                </div>
              </div>
              <Separator />
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">الأطر المتوافقة</p>
                <div className="space-y-2">
                  {traceDialog.frameworks.map((fw: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                      <FileCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium">{fw.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{fw.ref}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

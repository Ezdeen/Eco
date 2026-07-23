'use client'

import { useEffect, useState } from 'react'
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
  FileCheck, ExternalLink, Eye, BookOpen, Network, AlertCircle, CheckCircle2,
} from 'lucide-react'
import { toast } from 'sonner'

const KPI_CATEGORIES = [
  {
    key: 'energy',
    title: 'الطاقة',
    titleEn: 'Energy',
    icon: Zap,
    color: 'amber',
    kpis: [
      { key: 'energyGenerated', label: 'Energy Generated', labelAr: 'الطاقة المُولّدة', unit: 'kWh' },
      { key: 'energyExported', label: 'Energy Exported', labelAr: 'الطاقة المُصدَّرة', unit: 'kWh' },
      { key: 'energyImported', label: 'Energy Imported', labelAr: 'الطاقة المستوردة', unit: 'kWh' },
      { key: 'selfConsumption', label: 'Self Consumption', labelAr: 'الاستهلاك الذاتي', unit: 'kWh' },
      { key: 'renewableFraction', label: 'Renewable Fraction', labelAr: 'نسبة الطاقة المتجددة', unit: '%' },
    ],
  },
  {
    key: 'carbon',
    title: 'الكربون',
    titleEn: 'Carbon',
    icon: Leaf,
    color: 'emerald',
    kpis: [
      { key: 'co2Avoided', label: 'CO₂e Avoided', labelAr: 'CO₂e متجنب', unit: 'kg' },
      { key: 'co2Stored', label: 'CO₂e Stored', labelAr: 'CO₂e مخزّن', unit: 'kg' },
      { key: 'co2Sequestered', label: 'CO₂e Sequestered', labelAr: 'CO₂e ممتص', unit: 'kg' },
      { key: 'carbonIntensity', label: 'Carbon Intensity', labelAr: 'كثافة الكربون', unit: 'kgCO₂e/kWh' },
    ],
  },
  {
    key: 'water',
    title: 'المياه',
    titleEn: 'Water',
    icon: Droplet,
    color: 'blue',
    kpis: [
      { key: 'waterSaved', label: 'Water Saved', labelAr: 'مياه موفّرة', unit: 'لتر' },
      { key: 'waterConsumed', label: 'Water Consumed', labelAr: 'مياه مستهلكة', unit: 'لتر' },
    ],
  },
  {
    key: 'waste',
    title: 'النفايات',
    titleEn: 'Waste',
    icon: Recycle,
    color: 'violet',
    kpis: [
      { key: 'wasteDiverted', label: 'Waste Diverted', labelAr: 'نفايات مُحوّلة', unit: 'kg' },
      { key: 'wasteRecycled', label: 'Waste Recycled', labelAr: 'نفايات مُعاد تدويرها', unit: 'kg' },
    ],
  },
  {
    key: 'afforestation',
    title: 'التشجير',
    titleEn: 'Afforestation',
    icon: TreePine,
    color: 'green',
    kpis: [
      { key: 'treesPlanted', label: 'Trees Planted', labelAr: 'أشجار مزروعة', unit: 'شجرة' },
      { key: 'survivalRate', label: 'Survival Rate', labelAr: 'معدل البقاء', unit: '%' },
      { key: 'biomass', label: 'Biomass', labelAr: 'الكتلة الحيوية', unit: 'kg' },
      { key: 'carbonStock', label: 'Carbon Stock', labelAr: 'الكربون المخزن', unit: 'kgCO₂e' },
      { key: 'carbonSequestration', label: 'Carbon Sequestration', labelAr: 'امتصاص الكربون', unit: 'kgCO₂e/سنة' },
    ],
  },
  {
    key: 'biodiversity',
    title: 'التنوع الحيوي',
    titleEn: 'Biodiversity',
    icon: Bird,
    color: 'teal',
    kpis: [
      { key: 'restoredArea', label: 'Restored Area', labelAr: 'مساحة مُستعادة', unit: 'ha' },
      { key: 'protectedArea', label: 'Protected Area', labelAr: 'مساحة محمية', unit: 'ha' },
      { key: 'habitatIndex', label: 'Habitat Index', labelAr: 'مؤشر الموئل', unit: '/100' },
      { key: 'speciesCount', label: 'Species Count', labelAr: 'عدد الأنواع', unit: 'نوع' },
    ],
  },
  {
    key: 'economy',
    title: 'الاقتصاد',
    titleEn: 'Economy',
    icon: DollarSign,
    color: 'amber',
    kpis: [
      { key: 'costSavings', label: 'Cost Savings', labelAr: 'وفر تكاليف', unit: 'SAR' },
      { key: 'greenInvestment', label: 'Green Investment', labelAr: 'استثمار أخضر', unit: 'SAR' },
      { key: 'costPerTCo2e', label: 'Cost per tCO₂e', labelAr: 'تكلفة لكل طن CO₂e', unit: 'SAR/tCO₂e' },
      { key: 'costPerKwh', label: 'Cost per kWh', labelAr: 'تكلفة لكل kWh', unit: 'SAR/kWh' },
    ],
  },
  {
    key: 'dataQuality',
    title: 'جودة البيانات',
    titleEn: 'Data Quality',
    icon: ShieldCheck,
    color: 'blue',
    kpis: [
      { key: 'completeness', label: 'Completeness', labelAr: 'الاكتمال', unit: '%' },
      { key: 'accuracy', label: 'Accuracy', labelAr: 'الدقة', unit: '%' },
      { key: 'timeliness', label: 'Timeliness', labelAr: 'الحداثة', unit: '%' },
      { key: 'validationRate', label: 'Validation Rate', labelAr: 'نسبة التحقق', unit: '%' },
    ],
  },
  {
    key: 'attestation',
    title: 'التوثيق',
    titleEn: 'Attestation',
    icon: Database,
    color: 'violet',
    kpis: [
      { key: 'verifiedDataPercent', label: 'Verified Data %', labelAr: 'بيانات موثقة', unit: '%' },
      { key: 'traceabilityPercent', label: 'Traceability %', labelAr: 'قابلية التتبع', unit: '%' },
      { key: 'auditCoveragePercent', label: 'Audit Coverage %', labelAr: 'تغطية التدقيق', unit: '%' },
      { key: 'attestationCount', label: 'Attestation Count', labelAr: 'عدد التوثيقات', unit: 'دفعة' },
    ],
  },
]

const COLOR_MAP: Record<string, { bg: string; text: string; border: string; gradient: string }> = {
  amber: { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200', gradient: 'from-amber-500 to-orange-600' },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200', gradient: 'from-emerald-500 to-teal-600' },
  blue: { bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-400', border: 'border-blue-200', gradient: 'from-blue-500 to-cyan-600' },
  violet: { bg: 'bg-violet-50 dark:bg-violet-950/30', text: 'text-violet-700 dark:text-violet-400', border: 'border-violet-200', gradient: 'from-violet-500 to-purple-600' },
  green: { bg: 'bg-green-50 dark:bg-green-950/30', text: 'text-green-700 dark:text-green-400', border: 'border-green-200', gradient: 'from-green-500 to-emerald-600' },
  teal: { bg: 'bg-teal-50 dark:bg-teal-950/30', text: 'text-teal-700 dark:text-teal-400', border: 'border-teal-200', gradient: 'from-teal-500 to-cyan-600' },
}

const fmt = (n: number) => (n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
const fmtCompact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toString()

export function CalculationsSection() {
  const [projects, setProjects] = useState<any[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [recentRuns, setRecentRuns] = useState<any[]>([])
  const [kpiCatalog, setKpiCatalog] = useState<any>(null)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<any>(null)
  // ESG frameworks
  const [esgData, setEsgData] = useState<any>(null)
  const [traceDialog, setTraceDialog] = useState<any>(null)

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then((d) => { if (d && d.projects) setProjects(d.projects) })
      .catch(() => {})
    fetchCalculations()
    fetch('/api/esg-frameworks')
      .then((r) => {
        if (!r.ok) throw new Error('ESG frameworks API failed')
        return r.json()
      })
      .then((d) => {
        if (d && d.frameworks) {
          setEsgData(d)
        }
      })
      .catch(() => {})
  }, [])

  const fetchCalculations = async () => {
    try {
      const res = await fetch('/api/calculations')
      if (!res.ok) return
      const data = await res.json()
      setRecentRuns(data.calculationRuns || [])
      setKpiCatalog(data.kpiCatalog || null)
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
        fetchCalculations()
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
                جميع المؤشرات البيئية بشكل موحد - 9 فئات تشمل الطاقة والكربون والمياه والنفايات والتشجير والتنوع الحيوي والاقتصاد وجودة البيانات والتوثيق
              </p>
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
                  <p className="text-xs text-muted-foreground">CO₂e متجنب</p>
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
          {kpiCatalog && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Activity className="h-5 w-5 text-primary" />
                <h3 className="font-cairo text-lg font-bold">Environmental KPI Catalog</h3>
                <Badge variant="outline" className="text-xs">9 فئات</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {KPI_CATEGORIES.map((cat) => {
                  const Icon = cat.icon
                  const colors = COLOR_MAP[cat.color] || COLOR_MAP.blue
                  const categoryData = kpiCatalog[cat.key] || {}
                  return (
                    <Card key={cat.key} className={`overflow-hidden ${colors.border}`}>
                      <CardHeader className={`pb-2 bg-gradient-to-br ${colors.gradient} text-white`}>
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {cat.title}
                          <span className="text-xs opacity-80 mr-auto">{cat.titleEn}</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 space-y-2">
                        {cat.kpis.map((kpi) => {
                          const rawValue = categoryData[kpi.key]
                          // Economy KPIs can be null when projects use different currencies
                          // (see kpiCatalog.economy in the API) — show the per-currency
                          // breakdown instead of a misleading 0.
                          if (cat.key === 'economy' && rawValue === null && categoryData.costSavingsByCurrency) {
                            const byCurrencyMap = kpi.key === 'greenInvestment'
                              ? categoryData.greenInvestmentByCurrency
                              : categoryData.costSavingsByCurrency
                            const entries = Object.entries(byCurrencyMap || {})
                            return (
                              <div key={kpi.key} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                                <div className="min-w-0">
                                  <p className="text-xs font-medium truncate">{kpi.labelAr}</p>
                                  <p className="text-[10px] text-muted-foreground truncate">{kpi.label} (عملات متعددة)</p>
                                </div>
                                <div className="text-left shrink-0 space-y-0.5">
                                  {entries.length > 0 ? entries.map(([currency, amount]) => (
                                    <p key={currency} className={`text-xs font-bold tabular-nums ${colors.text}`}>
                                      {fmtCompact(amount as number)} {currency}
                                    </p>
                                  )) : (
                                    <p className="text-[10px] text-muted-foreground">—</p>
                                  )}
                                </div>
                              </div>
                            )
                          }
                          return (
                            <div key={kpi.key} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                              <div className="min-w-0">
                                <p className="text-xs font-medium truncate">{kpi.labelAr}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{kpi.label}</p>
                              </div>
                              <div className="text-left shrink-0">
                                <p className={`text-sm font-bold tabular-nums ${colors.text}`}>
                                  {fmtCompact(rawValue || 0)}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  {cat.key === 'economy' && categoryData.currency
                                    ? kpi.unit.replace('SAR', categoryData.currency)
                                    : kpi.unit}
                                </p>
                              </div>
                            </div>
                          )
                        })}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}
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
                            <p className="text-lg font-bold tabular-nums text-primary">{fmtCompact(kpi.value)}</p>
                          ) : kpi.byCurrency ? (
                            <div className="text-left">
                              {Object.entries(kpi.byCurrency).map(([currency, amount]) => (
                                <p key={currency} className="text-sm font-bold tabular-nums text-primary">
                                  {fmtCompact(amount as number)} {currency}
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
                  <p className="text-xl font-bold tabular-nums text-primary">{fmt(traceDialog.value)} {traceDialog.unit}</p>
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

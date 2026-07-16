'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/platform/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  Coins, Leaf, TrendingUp, TrendingDown, Ban, CheckCircle2, TreePine,
  Droplet, Fuel, Zap, Activity, Gauge, Calendar, MapPin, Database,
  Sprout, Heart, Ruler, Beaker, Clock, Users, AlertCircle,
} from 'lucide-react'

export function ImpactSection() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/impact')
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then((d) => {
        if (cancelled) return
        if (d && d.stats && d.projectCarbon) {
          setData(d)
        } else {
          setData(null)
        }
      })
      .catch(() => {
        if (cancelled) return
        setData(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <Card className="h-32 animate-pulse bg-muted/40" />
        <Card className="h-96 animate-pulse bg-muted/40" />
      </div>
    )
  }

  const fmt = (n: number) => (n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
  const fmtCompact = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toString()

  const { stats, projectCarbon, accounts, emissionFactors } = data

  // Separate solar vs afforestation projects
  const solarProjects = (projectCarbon || []).filter((p: any) => p.projectType !== 'afforestation')
  const afforestationProjects = (projectCarbon || []).filter((p: any) => p.projectType === 'afforestation')

  // Chart colors
  const CHART_COLORS = ['#16a34a', '#0891b2', '#ca8a04', '#2563eb', '#dc2626', '#7c3aed']

  // Prepare carbon trend data (aggregate by project)
  const carbonByProject = (projectCarbon || []).map((p: any, i: number) => ({
    name: p.projectCode,
    kgCO2e: p.carbonAvoided.lifetime.kgCO2e,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }))

  return (
    <div className="space-y-5">
      {/* Top banner */}
      <Card className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-0">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-cairo text-2xl font-bold mb-1">منصة قياس الأثر البيئي</h2>
              <p className="text-sm opacity-90">
                الكربون المتجنب من الطاقة المتجددة + الكربون الممتص من مشاريع التشجير
              </p>
            </div>
            <div className="text-left">
              <p className="text-xs opacity-80">إجمالي الكربون (kgCO₂e)</p>
              <p className="font-cairo text-3xl font-bold tabular-nums">
                {fmt(stats.totalCo2AvoidedKg + stats.afforestation.totalCarbonAbsorbed)}
              </p>
              <p className="text-xs opacity-80 mt-1">
                ≈ {fmt((stats.totalCo2AvoidedKg + stats.afforestation.totalCarbonAbsorbed) / 1000)} tCO₂e
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs: Solar vs Afforestation */}
      <Tabs defaultValue="solar" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="solar" className="gap-2">
            <Zap className="h-3.5 w-3.5" />
            الطاقة الشمسية ({solarProjects.length})
          </TabsTrigger>
          <TabsTrigger value="afforestation" className="gap-2">
            <TreePine className="h-3.5 w-3.5" />
            التشجير ({afforestationProjects.length})
          </TabsTrigger>
        </TabsList>

        {/* ===================== SOLAR TAB ===================== */}
        <TabsContent value="solar" className="space-y-4 mt-4">
          {/* Carbon Avoided - Main KPIs */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Leaf className="h-5 w-5 text-emerald-600" />
              <h3 className="font-cairo text-lg font-bold">الكربون المتجنب (CO₂e)</h3>
              <Badge variant="outline" className="text-xs">
                {stats.solarProjectsCount} مشاريع شمسية
              </Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200">
                <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 mb-1">
                  <Calendar className="h-3.5 w-3.5" /> اليوم
                </div>
                <p className="text-xl font-bold tabular-nums text-emerald-600">
                  {fmt(solarProjects.reduce((s: number, p: any) => s + p.carbonAvoided.daily.kgCO2e, 0))}
                </p>
                <p className="text-xs text-muted-foreground">kgCO₂e</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  ≈ {fmt(solarProjects.reduce((s: number, p: any) => s + p.carbonAvoided.daily.tCO2e, 0))} tCO₂e
                </p>
              </Card>
              <Card className="p-4 bg-teal-50 dark:bg-teal-950/30 border-teal-200">
                <div className="flex items-center gap-2 text-xs text-teal-700 dark:text-teal-400 mb-1">
                  <Calendar className="h-3.5 w-3.5" /> الشهر
                </div>
                <p className="text-xl font-bold tabular-nums text-teal-600">
                  {fmt(solarProjects.reduce((s: number, p: any) => s + p.carbonAvoided.monthly.kgCO2e, 0))}
                </p>
                <p className="text-xs text-muted-foreground">kgCO₂e</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  ≈ {fmt(solarProjects.reduce((s: number, p: any) => s + p.carbonAvoided.monthly.tCO2e, 0))} tCO₂e
                </p>
              </Card>
              <Card className="p-4 bg-blue-50 dark:bg-blue-950/30 border-blue-200">
                <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-400 mb-1">
                  <Calendar className="h-3.5 w-3.5" /> السنة
                </div>
                <p className="text-xl font-bold tabular-nums text-blue-600">
                  {fmt(solarProjects.reduce((s: number, p: any) => s + p.carbonAvoided.yearly.kgCO2e, 0))}
                </p>
                <p className="text-xs text-muted-foreground">kgCO₂e</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  ≈ {fmt(solarProjects.reduce((s: number, p: any) => s + p.carbonAvoided.yearly.tCO2e, 0))} tCO₂e
                </p>
              </Card>
              <Card className="p-4 bg-violet-50 dark:bg-violet-950/30 border-violet-200">
                <div className="flex items-center gap-2 text-xs text-violet-700 dark:text-violet-400 mb-1">
                  <Clock className="h-3.5 w-3.5" /> العمر التشغيلي
                </div>
                <p className="text-xl font-bold tabular-nums text-violet-600">
                  {fmt(stats.totalCo2AvoidedKg)}
                </p>
                <p className="text-xs text-muted-foreground">kgCO₂e</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  ≈ {fmt(stats.totalCo2AvoidedTons)} tCO₂e
                </p>
              </Card>
            </div>
          </div>

          {/* Emission Factor Details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                معامل الانبعاث المستخدم
              </CardTitle>
              <CardDescription className="text-xs">
                المعاملات الموثقة المستخدمة في حسابات الكربون المتجنب
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.entries(emissionFactors || {}).filter(([code]) => code !== 'default').slice(0, 9).map(([code, ef]: [string, any]) => (
                  <div key={code} className="p-3 rounded-lg border bg-muted/30">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline" className="text-xs font-mono">{code}</Badge>
                      <Badge variant="outline" className={`text-xs ${ef.type === 'location-based' ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700' : 'bg-amber-50 dark:bg-amber-950/30 text-amber-700'}`}>
                        {ef.type === 'location-based' ? 'Location-based' : 'Market-based'}
                      </Badge>
                    </div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">القيمة:</span>
                        <span className="font-bold tabular-nums">{ef.factor} kgCO₂e/kWh</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">المصدر:</span>
                        <span className="font-medium text-left">{ef.source}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">الإصدار:</span>
                        <span className="font-mono">{ef.version}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Additional Indicators */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Activity className="h-5 w-5 text-primary" />
              <h3 className="font-cairo text-lg font-bold">مؤشرات إضافية</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Fuel className="h-3.5 w-3.5" /> وقود ديزل مستبدل
                </div>
                <p className="text-xl font-bold tabular-nums text-amber-600">{fmt(stats.totalDieselReplaced)}</p>
                <p className="text-xs text-muted-foreground">لتر</p>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Fuel className="h-3.5 w-3.5" /> غاز طبيعي مستبدل
                </div>
                <p className="text-xl font-bold tabular-nums text-blue-600">{fmt(stats.totalGasReplaced)}</p>
                <p className="text-xs text-muted-foreground">م³</p>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Zap className="h-3.5 w-3.5" /> كهرباء تقليدية مستبدلة
                </div>
                <p className="text-xl font-bold tabular-nums text-emerald-600">{fmt(stats.totalEnergyLifetime)}</p>
                <p className="text-xs text-muted-foreground">kWh</p>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Gauge className="h-3.5 w-3.5" /> كثافة الكربون
                </div>
                <p className="text-xl font-bold tabular-nums text-violet-600">
                  {stats.totalEnergyLifetime > 0 ? (stats.totalCo2AvoidedKg / stats.totalEnergyLifetime).toFixed(3) : '0'}
                </p>
                <p className="text-xs text-muted-foreground">kgCO₂e/kWh</p>
              </Card>
            </div>
          </div>

          {/* Carbon by Project Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">الكربون المتجنب حسب المشروع</CardTitle>
              <CardDescription className="text-xs">إجمالي kgCO₂e لكل مشروع شمسي</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={carbonByProject.filter((p: any) => p.kgCO2e > 0)} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#6b7280' }} tickFormatter={(v) => fmtCompact(v)} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#374151' }} width={70} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    formatter={(v: number) => [`${fmt(v)} kgCO₂e`, 'الكربون المتجنب']}
                  />
                  <Bar dataKey="kgCO2e" radius={[0, 4, 4, 0]}>
                    {carbonByProject.map((p: any, i: number) => (
                      <Cell key={i} fill={p.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Per-project detailed table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">تفاصيل الكربون لكل مشروع</CardTitle>
              <CardDescription className="text-xs">
                تفصيل يومي/شهري/سنوي/عمر تشغيلي + معامل الانبعاث + المؤشرات الإضافية
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-2 text-right">المشروع</th>
                      <th className="p-2 text-center">يومي</th>
                      <th className="p-2 text-center">شهري</th>
                      <th className="p-2 text-center">سنوي</th>
                      <th className="p-2 text-center">عمر تشغيلي</th>
                      <th className="p-2 text-center">معامل الانبعاث</th>
                      <th className="p-2 text-center">نوعه</th>
                      <th className="p-2 text-center">ديزل مستبدل</th>
                      <th className="p-2 text-center">غاز مستبدل</th>
                      <th className="p-2 text-center">كثافة الكربون</th>
                    </tr>
                  </thead>
                  <tbody>
                    {solarProjects.map((p: any) => (
                      <tr key={p.projectId} className="border-b hover:bg-muted/30">
                        <td className="p-2">
                          <p className="font-medium">{p.projectName}</p>
                          <p className="text-[10px] text-muted-foreground">{p.projectCode} • {p.city}</p>
                        </td>
                        <td className="p-2 text-center tabular-nums">{fmt(p.carbonAvoided.daily.kgCO2e)}</td>
                        <td className="p-2 text-center tabular-nums">{fmt(p.carbonAvoided.monthly.kgCO2e)}</td>
                        <td className="p-2 text-center tabular-nums">{fmt(p.carbonAvoided.yearly.kgCO2e)}</td>
                        <td className="p-2 text-center tabular-nums font-semibold text-violet-600">{fmt(p.carbonAvoided.lifetime.kgCO2e)}</td>
                        <td className="p-2 text-center tabular-nums">{p.emissionFactor.value}</td>
                        <td className="p-2 text-center">
                          <Badge variant="outline" className={`text-[10px] ${p.emissionFactor.type === 'location-based' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                            {p.emissionFactor.type === 'location-based' ? 'Location' : 'Market'}
                          </Badge>
                        </td>
                        <td className="p-2 text-center tabular-nums text-amber-600">{fmt(p.fossilFuelReplaced.dieselLiters)} L</td>
                        <td className="p-2 text-center tabular-nums text-blue-600">{fmt(p.fossilFuelReplaced.naturalGasM3)} m³</td>
                        <td className="p-2 text-center tabular-nums text-violet-600">{p.carbonIntensity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== AFFORESTATION TAB ===================== */}
        <TabsContent value="afforestation" className="space-y-4 mt-4">
          {afforestationProjects.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <TreePine className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">لا توجد مشاريع تشجير بعد</p>
                <p className="text-xs text-muted-foreground mt-1">أنشئ مشروعًا من نوع "مشروع تشجير" لعرض المؤشرات هنا</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Afforestation Overview */}
              <Card className="bg-gradient-to-br from-emerald-500 to-green-600 text-white border-0">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <TreePine className="h-8 w-8" />
                    <div>
                      <h3 className="font-cairo text-xl font-bold">مؤشرات التشجير (Nature Based)</h3>
                      <p className="text-sm opacity-90">{stats.afforestation.totalProjects} مشاريع • {stats.afforestation.totalPlantedAreaHa} هكتار</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="p-3 rounded-lg bg-white/10">
                      <p className="text-xs opacity-80">إجمالي الأشجار المزروعة</p>
                      <p className="text-2xl font-bold tabular-nums">{fmt(stats.afforestation.totalPlantedTrees)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-white/10">
                      <p className="text-xs opacity-80">الأشجار الحية</p>
                      <p className="text-2xl font-bold tabular-nums text-emerald-200">{fmt(stats.afforestation.totalAliveTrees)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-white/10">
                      <p className="text-xs opacity-80">الأشجار المفقودة</p>
                      <p className="text-2xl font-bold tabular-nums text-red-200">{fmt(stats.afforestation.totalLostTrees)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-white/10">
                      <p className="text-xs opacity-80">معدل البقاء</p>
                      <p className="text-2xl font-bold tabular-nums">{stats.afforestation.averageSurvivalRate}%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Carbon Absorption KPIs */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Leaf className="h-5 w-5 text-emerald-600" />
                  <h3 className="font-cairo text-lg font-bold">الكربون الممتص من الأشجار</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200">
                    <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 mb-1">
                      <Sprout className="h-3.5 w-3.5" /> الكربون المخزن
                    </div>
                    <p className="text-xl font-bold tabular-nums text-emerald-600">{fmt(stats.afforestation.totalCarbonStored)}</p>
                    <p className="text-xs text-muted-foreground">kgCO₂e</p>
                  </Card>
                  <Card className="p-4 bg-teal-50 dark:bg-teal-950/30 border-teal-200">
                    <div className="flex items-center gap-2 text-xs text-teal-700 dark:text-teal-400 mb-1">
                      <Calendar className="h-3.5 w-3.5" /> ممتص سنويًا
                    </div>
                    <p className="text-xl font-bold tabular-nums text-teal-600">{fmt(stats.afforestation.annualCarbonAbsorbed)}</p>
                    <p className="text-xs text-muted-foreground">kgCO₂e/سنة</p>
                  </Card>
                  <Card className="p-4 bg-blue-50 dark:bg-blue-950/30 border-blue-200">
                    <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-400 mb-1">
                      <Activity className="h-3.5 w-3.5" /> إجمالي ممتص
                    </div>
                    <p className="text-xl font-bold tabular-nums text-blue-600">{fmt(stats.afforestation.totalCarbonAbsorbed)}</p>
                    <p className="text-xs text-muted-foreground">kgCO₂e</p>
                  </Card>
                  <Card className="p-4 bg-violet-50 dark:bg-violet-950/30 border-violet-200">
                    <div className="flex items-center gap-2 text-xs text-violet-700 dark:text-violet-400 mb-1">
                      <Gauge className="h-3.5 w-3.5" /> معدل الامتصاص/هكتار
                    </div>
                    <p className="text-xl font-bold tabular-nums text-violet-600">
                      {stats.afforestation.totalPlantedAreaHa > 0 ? fmt(Math.round(stats.afforestation.annualCarbonAbsorbed / stats.afforestation.totalPlantedAreaHa)) : '0'}
                    </p>
                    <p className="text-xs text-muted-foreground">kgCO₂e/ha/سنة</p>
                  </Card>
                </div>
              </div>

              {/* Per-project afforestation details */}
              {afforestationProjects.map((p: any) => (
                <Card key={p.projectId}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <TreePine className="h-5 w-5 text-emerald-600" />
                          {p.projectName}
                        </CardTitle>
                        <CardDescription className="text-xs mt-1">
                          {p.projectCode} • {p.city} • {p.afforestation?.treeSpecies}
                        </CardDescription>
                      </div>
                      <Badge variant="outline" className="text-xs bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700">
                        <Heart className="h-3 w-3 ml-1" />
                        صحة الموقع: {p.afforestation?.healthScore}%
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Trees stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="p-3 rounded-lg bg-muted/30">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                          <Sprout className="h-3 w-3" /> مزروعة
                        </div>
                        <p className="text-lg font-bold tabular-nums">{fmt(p.afforestation.plantedTrees)}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
                        <div className="flex items-center gap-1.5 text-xs text-emerald-700 mb-1">
                          <CheckCircle2 className="h-3 w-3" /> حية
                        </div>
                        <p className="text-lg font-bold tabular-nums text-emerald-600">{fmt(p.afforestation.aliveTrees)}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30">
                        <div className="flex items-center gap-1.5 text-xs text-red-700 mb-1">
                          <Ban className="h-3 w-3" /> مفقودة
                        </div>
                        <p className="text-lg font-bold tabular-nums text-red-600">{fmt(p.afforestation.lostTrees)}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/30">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                          <Gauge className="h-3 w-3" /> معدل البقاء
                        </div>
                        <p className="text-lg font-bold tabular-nums">{p.afforestation.survivalRate}%</p>
                      </div>
                    </div>

                    {/* Area & density */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="p-3 rounded-lg bg-muted/30">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                          <MapPin className="h-3 w-3" /> المساحة المزروعة
                        </div>
                        <p className="text-lg font-bold tabular-nums">{p.afforestation.plantedAreaHa} <span className="text-xs font-normal">ha</span></p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/30">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                          <Ruler className="h-3 w-3" /> الكثافة النباتية
                        </div>
                        <p className="text-lg font-bold tabular-nums">{fmt(p.afforestation.treeDensity)} <span className="text-xs font-normal">شجرة/ha</span></p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/30">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                          <Clock className="h-3 w-3" /> العمر المتوسط
                        </div>
                        <p className="text-lg font-bold tabular-nums">{p.afforestation.averageTreeAge} <span className="text-xs font-normal">سنة</span></p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/30">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                          <TrendingUp className="h-3 w-3" /> معدل النمو
                        </div>
                        <p className="text-lg font-bold tabular-nums">{p.afforestation.growthRate} <span className="text-xs font-normal">cm/سنة</span></p>
                      </div>
                    </div>

                    {/* Carbon & biomass */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
                        <div className="flex items-center gap-1.5 text-xs text-emerald-700 mb-1">
                          <Leaf className="h-3 w-3" /> الكتلة الحيوية
                        </div>
                        <p className="text-lg font-bold tabular-nums text-emerald-600">{fmt(p.afforestation.estimatedBiomass)} <span className="text-xs font-normal">kg</span></p>
                      </div>
                      <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
                        <div className="flex items-center gap-1.5 text-xs text-emerald-700 mb-1">
                          <Database className="h-3 w-3" /> الكربون المخزن
                        </div>
                        <p className="text-lg font-bold tabular-nums text-emerald-600">{fmt(p.afforestation.carbonStored)} <span className="text-xs font-normal">kgCO₂e</span></p>
                      </div>
                      <div className="p-3 rounded-lg bg-teal-50 dark:bg-teal-950/30">
                        <div className="flex items-center gap-1.5 text-xs text-teal-700 mb-1">
                          <Calendar className="h-3 w-3" /> ممتص سنويًا
                        </div>
                        <p className="text-lg font-bold tabular-nums text-teal-600">{fmt(p.afforestation.annualCarbonAbsorbed)} <span className="text-xs font-normal">kgCO₂e</span></p>
                      </div>
                      <div className="p-3 rounded-lg bg-violet-50 dark:bg-violet-950/30">
                        <div className="flex items-center gap-1.5 text-xs text-violet-700 mb-1">
                          <Gauge className="h-3 w-3" /> امتصاص/شجرة
                        </div>
                        <p className="text-lg font-bold tabular-nums text-violet-600">{p.afforestation.absorptionPerTree} <span className="text-xs font-normal">kgCO₂e/سنة</span></p>
                      </div>
                    </div>

                    {/* Operations */}
                    <Separator />
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                        <div className="flex items-center gap-1.5 text-xs text-blue-700 mb-1">
                          <Droplet className="h-3 w-3" /> عمليات الري
                        </div>
                        <p className="text-lg font-bold tabular-nums text-blue-600">{fmt(p.afforestation.irrigationCount)}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30">
                        <div className="flex items-center gap-1.5 text-xs text-amber-700 mb-1">
                          <Users className="h-3 w-3" /> زيارات ميدانية
                        </div>
                        <p className="text-lg font-bold tabular-nums text-amber-600">{fmt(p.afforestation.siteVisits)}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
                        <div className="flex items-center gap-1.5 text-xs text-emerald-700 mb-1">
                          <Heart className="h-3 w-3" /> مؤشر صحة الموقع
                        </div>
                        <p className="text-lg font-bold tabular-nums text-emerald-600">{p.afforestation.healthScore}%</p>
                      </div>
                      {p.afforestation.iotSensor && (
                        <div className="p-3 rounded-lg bg-violet-50 dark:bg-violet-950/30">
                          <div className="flex items-center gap-1.5 text-xs text-violet-700 mb-1">
                            <Beaker className="h-3 w-3" /> مستشعر IoT
                          </div>
                          <p className="text-sm font-bold text-violet-600">{p.afforestation.iotSensor.type}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{p.afforestation.iotSensor.serial}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Accounts & Ledger */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" />
            سجل وحدات الأثر (Ledger)
          </CardTitle>
          <CardDescription className="text-xs">
            حسابات وأرصدة وحركات غير قابلة للتعديل - وحدات داخلية ليست اعتمادات تجارية
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Aggregate stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="p-3 rounded-lg bg-muted/30">
              <p className="text-xs text-muted-foreground">الرصيد الكلي</p>
              <p className="text-lg font-bold tabular-nums">{fmt(stats.totalBalance)}</p>
              <p className="text-[10px] text-muted-foreground">kgCO₂e</p>
            </div>
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
              <p className="text-xs text-emerald-700">مُصدَر/متحقّق</p>
              <p className="text-lg font-bold tabular-nums text-emerald-600">{fmt(stats.totalIssued)}</p>
              <p className="text-[10px] text-muted-foreground">kgCO₂e</p>
            </div>
            <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/30">
              <p className="text-xs text-purple-700">مُحال (Retired)</p>
              <p className="text-lg font-bold tabular-nums text-purple-600">{fmt(stats.totalRetired)}</p>
              <p className="text-[10px] text-muted-foreground">kgCO₂e</p>
            </div>
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30">
              <p className="text-xs text-red-700">مُلغى</p>
              <p className="text-lg font-bold tabular-nums text-red-600">{fmt(stats.totalCancelled)}</p>
              <p className="text-[10px] text-muted-foreground">kgCO₂e</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30">
              <p className="text-xs text-muted-foreground">تقديري</p>
              <p className="text-lg font-bold tabular-nums">{fmt(stats.totalEstimated)}</p>
              <p className="text-[10px] text-muted-foreground">kgCO₂e</p>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 text-xs text-amber-800 dark:text-amber-300">
            <AlertCircle className="h-3 w-3 inline ml-1" />
            <strong>تنبيه:</strong> وحدات الأثر الداخلية ليست اعتمادات كربونية تجارية. التداول والاعتماد التجاري مؤجلان حتى استيفاء المتطلبات القانونية والمنهجية.
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/platform/status-badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  AreaChart, Area, BarChart, Bar, RadialBarChart, RadialBar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  Zap, Activity, TrendingUp, Gauge, Clock, AlertCircle,
  Calendar, Database, Sun, Battery, Cloud, Wrench, Grid3x3, BarChart3,
} from 'lucide-react'

export function EnergyPerformanceSection() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all')

  useEffect(() => {
    let cancelled = false
    const url = selectedProjectId === 'all'
      ? '/api/energy-performance'
      : `/api/energy-performance?projectId=${selectedProjectId}`
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        setData(d)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedProjectId])

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

  const { stats, projects } = data

  // Chart data: energy by project
  const energyByProject = projects.map((p: any) => ({
    name: p.project.code,
    daily: p.energy.daily,
    monthly: p.energy.monthly,
    lifetime: p.energy.lifetime,
  }))

  // Performance data for radial chart
  const performanceData = [
    { name: 'Performance Ratio', value: stats.averagePR, fill: '#16a34a' },
    { name: 'Availability', value: stats.averageAvailability, fill: '#0891b2' },
    { name: 'Capacity Factor', value: stats.averageCapacityFactor, fill: '#ca8a04' },
    { name: 'Achievement', value: stats.averageAchievementRate, fill: '#2563eb' },
  ]

  return (
    <div className="space-y-5">
      {/* Header with project selector */}
      <Card className="bg-gradient-to-br from-amber-500 to-orange-600 text-white border-0">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="font-cairo text-2xl font-bold mb-1">قسم مشاريع الطاقة الكهربائية</h2>
              <p className="text-sm opacity-90">
                مؤشرات الأداء التشغيلي - Energy Performance
              </p>
            </div>
            <div className="text-left">
              <p className="text-xs opacity-80">القدرة المنصوبة الكلية</p>
              <p className="font-cairo text-3xl font-bold tabular-nums">
                {fmt(stats.totalCapacityKwp)} <span className="text-lg">kWp</span>
              </p>
              <p className="text-xs opacity-80 mt-1">{stats.totalProjects} مشاريع</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Project filter */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">المشروع:</span>
        <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
          <SelectTrigger className="w-[300px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المشاريع</SelectItem>
            {projects.map((p: any) => (
              <SelectItem key={p.project.id} value={p.project.id}>
                {p.project.nameAr || p.project.name} ({p.project.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Energy Production - Main KPIs */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-5 w-5 text-amber-600" />
          <h3 className="font-cairo text-lg font-bold">إنتاج الطاقة (Energy Performance)</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4 bg-amber-50 dark:bg-amber-950/30 border-amber-200">
            <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 mb-1">
              <Calendar className="h-3.5 w-3.5" /> اليوم
            </div>
            <p className="text-xl font-bold tabular-nums text-amber-600">{fmtCompact(stats.totalEnergyDaily)}</p>
            <p className="text-xs text-muted-foreground">kWh</p>
          </Card>
          <Card className="p-4 bg-orange-50 dark:bg-orange-950/30 border-orange-200">
            <div className="flex items-center gap-2 text-xs text-orange-700 dark:text-orange-400 mb-1">
              <Calendar className="h-3.5 w-3.5" /> الشهر
            </div>
            <p className="text-xl font-bold tabular-nums text-orange-600">{fmtCompact(stats.totalEnergyMonthly)}</p>
            <p className="text-xs text-muted-foreground">kWh</p>
          </Card>
          <Card className="p-4 bg-red-50 dark:bg-red-950/30 border-red-200">
            <div className="flex items-center gap-2 text-xs text-red-700 dark:text-red-400 mb-1">
              <Calendar className="h-3.5 w-3.5" /> السنة
            </div>
            <p className="text-xl font-bold tabular-nums text-red-600">{fmtCompact(stats.totalEnergyYearly)}</p>
            <p className="text-xs text-muted-foreground">kWh</p>
          </Card>
          <Card className="p-4 bg-violet-50 dark:bg-violet-950/30 border-violet-200">
            <div className="flex items-center gap-2 text-xs text-violet-700 dark:text-violet-400 mb-1">
              <Clock className="h-3.5 w-3.5" /> تراكمية منذ التشغيل
            </div>
            <p className="text-xl font-bold tabular-nums text-violet-600">{fmtCompact(stats.totalEnergyLifetime)}</p>
            <p className="text-xs text-muted-foreground">kWh</p>
          </Card>
        </div>
      </div>

      {/* Power & Expected vs Actual */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              القدرة (Power)
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
              <div className="flex items-center gap-1.5 text-xs text-emerald-700 mb-1">
                <Zap className="h-3 w-3" /> القدرة الحالية
              </div>
              <p className="text-xl font-bold tabular-nums text-emerald-600">{fmt(stats.totalCurrentPower)}</p>
              <p className="text-xs text-muted-foreground">kW</p>
            </div>
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30">
              <div className="flex items-center gap-1.5 text-xs text-blue-700 mb-1">
                <TrendingUp className="h-3 w-3" /> أعلى قدرة مسجلة
              </div>
              <p className="text-xl font-bold tabular-nums text-blue-600">{fmt(stats.totalMaxPower)}</p>
              <p className="text-xs text-muted-foreground">kW</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Gauge className="h-5 w-5 text-primary" />
              المتوقع مقابل الفعلي
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {projects.slice(0, 5).map((p: any) => (
                <div key={p.project.id} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium">{p.project.code}</span>
                    <span className="tabular-nums">
                      {fmt(p.energy.achievementRate)}%
                      <span className="text-muted-foreground mr-2">
                        ({fmtCompact(p.energy.lifetime)} / {fmtCompact(p.energy.expectedLifetime)} kWh)
                      </span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all"
                      style={{ width: `${Math.min(100, p.energy.achievementRate)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Indicators */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            مؤشرات الأداء (Performance Indicators)
          </CardTitle>
          <CardDescription className="text-xs">متوسط كل المشاريع</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Radial chart for performance metrics */}
            <div className="col-span-2">
              <ResponsiveContainer width="100%" height={200}>
                <RadialBarChart cx="50%" cy="50%" innerRadius="20%" outerRadius="100%" data={performanceData} startAngle={90} endAngle={-270}>
                  <RadialBar background dataKey="value" cornerRadius={6} />
                  <Legend
                    iconSize={8}
                    layout="vertical"
                    verticalAlign="middle"
                    align="right"
                    wrapperStyle={{ fontSize: 10 }}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 6 }}
                    formatter={(v: number) => [`${v.toFixed(1)}%`, '']}
                  />
                </RadialBarChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              <div className="p-2 rounded-lg bg-muted/30">
                <p className="text-[10px] text-muted-foreground">Performance Ratio (PR)</p>
                <p className="text-lg font-bold tabular-nums text-emerald-600">{stats.averagePR.toFixed(1)}%</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/30">
                <p className="text-[10px] text-muted-foreground">Specific Yield</p>
                <p className="text-lg font-bold tabular-nums text-blue-600">
                  {projects.length > 0 ? (projects.reduce((s: number, p: any) => s + p.performance.specificYield, 0) / projects.length).toFixed(1) : 0}
                </p>
                <p className="text-[9px] text-muted-foreground">kWh/kWp</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="p-2 rounded-lg bg-muted/30">
                <p className="text-[10px] text-muted-foreground">Capacity Factor</p>
                <p className="text-lg font-bold tabular-nums text-amber-600">{stats.averageCapacityFactor.toFixed(1)}%</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/30">
                <p className="text-[10px] text-muted-foreground">Availability</p>
                <p className="text-lg font-bold tabular-nums text-teal-600">{stats.averageAvailability.toFixed(1)}%</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Operating Hours & Energy Flow */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              ساعات التشغيل والتوقف
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
                <div className="flex items-center gap-1.5 text-xs text-emerald-700 mb-1">
                  <Clock className="h-3 w-3" /> ساعات التشغيل
                </div>
                <p className="text-xl font-bold tabular-nums text-emerald-600">
                  {fmt(projects.reduce((s: number, p: any) => s + p.performance.operatingHours, 0))}
                </p>
                <p className="text-xs text-muted-foreground">ساعة</p>
              </div>
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30">
                <div className="flex items-center gap-1.5 text-xs text-red-700 mb-1">
                  <AlertCircle className="h-3 w-3" /> ساعات التوقف
                </div>
                <p className="text-xl font-bold tabular-nums text-red-600">
                  {fmt(projects.reduce((s: number, p: any) => s + p.performance.downtimeHours, 0))}
                </p>
                <p className="text-xs text-muted-foreground">ساعة</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Grid3x3 className="h-5 w-5 text-primary" />
              تدفق الطاقة (Energy Flow)
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30">
              <div className="flex items-center gap-1.5 text-xs text-blue-700 mb-1">
                <Grid3x3 className="h-3 w-3" /> مصدرة للشبكة
              </div>
              <p className="text-xl font-bold tabular-nums text-blue-600">{fmtCompact(stats.totalExported)}</p>
              <p className="text-xs text-muted-foreground">kWh</p>
            </div>
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
              <div className="flex items-center gap-1.5 text-xs text-emerald-700 mb-1">
                <Battery className="h-3 w-3" /> مستهلكة ذاتياً
              </div>
              <p className="text-xl font-bold tabular-nums text-emerald-600">{fmtCompact(stats.totalSelfConsumed)}</p>
              <p className="text-xs text-muted-foreground">kWh</p>
            </div>
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30">
              <div className="flex items-center gap-1.5 text-xs text-red-700 mb-1">
                <Wrench className="h-3 w-3" /> مفقودة (أعطال)
              </div>
              <p className="text-xl font-bold tabular-nums text-red-600">
                {fmtCompact(projects.reduce((s: number, p: any) => s + p.energyFlow.lostDueToFaults, 0))}
              </p>
              <p className="text-xs text-muted-foreground">kWh</p>
            </div>
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30">
              <div className="flex items-center gap-1.5 text-xs text-amber-700 mb-1">
                <Cloud className="h-3 w-3" /> مفقودة (طقس)
              </div>
              <p className="text-xl font-bold tabular-nums text-amber-600">
                {fmtCompact(projects.reduce((s: number, p: any) => s + p.energyFlow.lostDueToWeather, 0))}
              </p>
              <p className="text-xs text-muted-foreground">kWh</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-project detailed table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">تفاصيل الأداء لكل مشروع</CardTitle>
          <CardDescription className="text-xs">كل المؤشرات التشغيلية لكل مشروع شمسي</CardDescription>
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
                  <th className="p-2 text-center">تراكمي</th>
                  <th className="p-2 text-center">القدرة الحالية</th>
                  <th className="p-2 text-center">أعلى قدرة</th>
                  <th className="p-2 text-center">المتوقع</th>
                  <th className="p-2 text-center">الإنجاز</th>
                  <th className="p-2 text-center">PR</th>
                  <th className="p-2 text-center">SY</th>
                  <th className="p-2 text-center">Avail.</th>
                  <th className="p-2 text-center">CF</th>
                  <th className="p-2 text-center">ساعات تشغيل</th>
                  <th className="p-2 text-center">ساعات توقف</th>
                  <th className="p-2 text-center">مصدرة</th>
                  <th className="p-2 text-center">ذاتي</th>
                  <th className="p-2 text-center">مفقود (أعطال)</th>
                  <th className="p-2 text-center">مفقود (طقس)</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p: any) => (
                  <tr key={p.project.id} className="border-b hover:bg-muted/30">
                    <td className="p-2">
                      <p className="font-medium">{p.project.nameAr || p.project.name}</p>
                      <p className="text-[10px] text-muted-foreground">{p.project.code} • {p.project.city}</p>
                    </td>
                    <td className="p-2 text-center tabular-nums">{fmt(p.energy.daily)}</td>
                    <td className="p-2 text-center tabular-nums">{fmt(p.energy.monthly)}</td>
                    <td className="p-2 text-center tabular-nums">{fmt(p.energy.yearly)}</td>
                    <td className="p-2 text-center tabular-nums font-semibold text-violet-600">{fmt(p.energy.lifetime)}</td>
                    <td className="p-2 text-center tabular-nums text-emerald-600">{fmt(p.energy.currentPower)}</td>
                    <td className="p-2 text-center tabular-nums text-blue-600">{fmt(p.energy.maxPower)}</td>
                    <td className="p-2 text-center tabular-nums text-muted-foreground">{fmt(p.energy.expectedLifetime)}</td>
                    <td className="p-2 text-center">
                      <Badge variant="outline" className={`text-[10px] ${p.energy.achievementRate >= 80 ? 'bg-emerald-50 text-emerald-700' : p.energy.achievementRate >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                        {p.energy.achievementRate}%
                      </Badge>
                    </td>
                    <td className="p-2 text-center tabular-nums">{p.performance.performanceRatio}%</td>
                    <td className="p-2 text-center tabular-nums">{p.performance.specificYield}</td>
                    <td className="p-2 text-center tabular-nums">{p.performance.availability}%</td>
                    <td className="p-2 text-center tabular-nums">{p.performance.capacityFactor}%</td>
                    <td className="p-2 text-center tabular-nums">{fmt(p.performance.operatingHours)}</td>
                    <td className="p-2 text-center tabular-nums text-red-600">{fmt(p.performance.downtimeHours)}</td>
                    <td className="p-2 text-center tabular-nums text-blue-600">{fmt(p.energyFlow.exportedToGrid)}</td>
                    <td className="p-2 text-center tabular-nums text-emerald-600">{fmt(p.energyFlow.selfConsumed)}</td>
                    <td className="p-2 text-center tabular-nums text-red-600">{fmt(p.energyFlow.lostDueToFaults)}</td>
                    <td className="p-2 text-center tabular-nums text-amber-600">{fmt(p.energyFlow.lostDueToWeather)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

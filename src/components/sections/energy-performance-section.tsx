'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/platform/status-badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import {
  RadialBarChart, RadialBar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar,
} from 'recharts'
import {
  Zap, Activity, TrendingUp, Gauge, Clock, AlertCircle,
  Grid3x3, BarChart3, AlertTriangle, CheckCircle2, Bell, Filter, ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'

const PERIOD_OPTIONS = [
  { value: 'today', label: 'اليوم' },
  { value: 'week', label: 'الأسبوع' },
  { value: 'month', label: 'الشهر' },
  { value: 'quarter', label: 'الربع' },
  { value: 'year', label: 'السنة' },
  { value: 'all', label: 'الكل' },
]

const PROJECT_TYPE_LABELS: Record<string, string> = {
  grid_tied: 'مرتبط بالشبكة',
  hybrid: 'هجين',
  off_grid: 'مستقل',
}

const DEVICE_STATUS_LABELS: Record<string, string> = {
  connected: 'متصل',
  registered: 'مسجّل',
  offline: 'غير متصل',
  stale: 'بيانات قديمة',
  disabled: 'معطّل',
}

const ALERT_CONFIG: Record<string, { icon: any; color: string; bg: string }> = {
  performance_drop: { icon: TrendingUp, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/30 border-red-200' },
  missing_data: { icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200' },
  device_stopped: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/30 border-red-200' },
  anomalous_reading: { icon: AlertCircle, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200' },
}

const SEVERITY_LABELS: Record<string, string> = {
  critical: 'حرج',
  high: 'عالٍ',
  medium: 'متوسط',
  low: 'منخفض',
}

export function EnergyPerformanceSection() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  // Filters
  const [period, setPeriod] = useState('month')
  const [projectId, setProjectId] = useState('all')
  const [city, setCity] = useState('all')
  const [projectType, setProjectType] = useState('all')
  const [deviceStatus, setDeviceStatus] = useState('all')
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams()
    if (period !== 'all') params.set('period', period)
    if (projectId !== 'all') params.set('projectId', projectId)
    if (city !== 'all') params.set('city', city)
    if (projectType !== 'all') params.set('projectType', projectType)
    if (deviceStatus !== 'all') params.set('deviceStatus', deviceStatus)

    Promise.resolve().then(() => {
      if (cancelled) return
      setLoading(true)
      fetch(`/api/energy-performance?${params}`)
        .then((r) => { if (!r.ok) throw new Error(); return r.json() })
        .then((d) => { if (!cancelled && d && d.stats) setData(d) })
        .catch(() => { if (!cancelled) setData(null) })
        .finally(() => { if (!cancelled) setLoading(false) })
    })
    return () => { cancelled = true }
  }, [period, projectId, city, projectType, deviceStatus])

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
  const fmtDuration = (mins: number) => {
    if (mins < 60) return `${Math.round(mins)} دقيقة`
    if (mins < 1440) return `${(mins / 60).toFixed(1)} ساعة`
    return `${(mins / 1440).toFixed(1)} يوم`
  }

  const { stats, projects, alerts, filterOptions } = data

  const performanceData = [
    { name: 'PR', value: stats.averagePR, fill: '#16a34a' },
    { name: 'Avail', value: stats.averageAvailability, fill: '#0891b2' },
    { name: 'CF', value: stats.averageCapacityFactor, fill: '#ca8a04' },
    { name: 'Achieve', value: stats.averageAchievementRate, fill: '#2563eb' },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <Card className="bg-gradient-to-br from-amber-500 to-orange-600 text-white border-0">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="font-cairo text-2xl font-bold mb-1">قسم مشاريع الطاقة الكهربائية</h2>
              <p className="text-sm opacity-90">مؤشرات الأداء التشغيلي + SLA + التنبيهات الذكية</p>
            </div>
            <div className="text-left">
              <p className="text-xs opacity-80">القدرة المنصوبة الكلية</p>
              <p className="font-cairo text-3xl font-bold tabular-nums">{fmt(stats.totalCapacityKwp)} <span className="text-lg">kWp</span></p>
              <p className="text-xs opacity-80 mt-1">{stats.totalProjects} مشاريع</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters Bar */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Period filter */}
            <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1">
              {PERIOD_OPTIONS.map((p) => (
                <Button
                  key={p.value}
                  size="sm"
                  variant={period === p.value ? 'default' : 'ghost'}
                  className="h-7 text-xs"
                  onClick={() => setPeriod(p.value)}
                >
                  {p.label}
                </Button>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-3 w-3" />
              فلاتر متقدمة
              <ChevronDown className={`h-3 w-3 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </Button>

            {stats.totalAlerts > 0 && (
              <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200 ml-auto">
                <Bell className="h-3 w-3 ml-1" />
                {stats.totalAlerts} تنبيه
                {stats.criticalAlerts > 0 && ` (${stats.criticalAlerts} حرج)`}
              </Badge>
            )}
          </div>

          {/* Advanced filters */}
          {showFilters && (
            <div className="mt-3 pt-3 border-t grid grid-cols-2 md:grid-cols-4 gap-2">
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="المشروع" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المشاريع</SelectItem>
                  {(projects || []).map((p: any) => (
                    <SelectItem key={p.project.id} value={p.project.id}>{p.project.nameAr || p.project.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={city} onValueChange={setCity}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="المدينة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المدن</SelectItem>
                  {(filterOptions?.cities || []).map((c: string) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={projectType} onValueChange={setProjectType}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="نوع المشروع" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأنواع</SelectItem>
                  {(filterOptions?.projectTypes || []).map((t: string) => (
                    <SelectItem key={t} value={t}>{PROJECT_TYPE_LABELS[t] || t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={deviceStatus} onValueChange={setDeviceStatus}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="حالة الجهاز" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  {Object.entries(DEVICE_STATUS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Smart Alerts */}
      {alerts && alerts.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Bell className="h-5 w-5 text-red-600" />
            <h3 className="font-cairo text-lg font-bold">التنبيهات الذكية</h3>
            <Badge variant="outline" className="text-xs">{alerts.length} تنبيه</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {alerts.slice(0, 8).map((alert: any, i: number) => {
              const config = ALERT_CONFIG[alert.type] || ALERT_CONFIG.anomalous_reading
              const Icon = config.icon
              return (
                <div key={i} className={`p-3 rounded-xl border-2 ${config.bg}`}>
                  <div className="flex items-start gap-2">
                    <Icon className={`h-5 w-5 ${config.color} shrink-0 mt-0.5`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-semibold">{alert.title}</p>
                        <Badge variant="outline" className={`text-[10px] ${
                          alert.severity === 'critical' ? 'bg-red-100 text-red-700' :
                          alert.severity === 'high' ? 'bg-amber-100 text-amber-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {SEVERITY_LABELS[alert.severity] || alert.severity}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground mr-auto">{alert.projectCode}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{alert.message}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Energy KPIs */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-5 w-5 text-amber-600" />
          <h3 className="font-cairo text-lg font-bold">إنتاج الطاقة</h3>
          <Badge variant="outline" className="text-xs">{PERIOD_OPTIONS.find(p => p.value === period)?.label}</Badge>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4 bg-amber-50 dark:bg-amber-950/30 border-amber-200">
            <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 mb-1">
              <Zap className="h-3.5 w-3.5" /> إجمالي الطاقة
            </div>
            <p className="text-xl font-bold tabular-nums text-amber-600">{fmtCompact(stats.totalEnergy)}</p>
            <p className="text-xs text-muted-foreground">kWh</p>
          </Card>
          <Card className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200">
            <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 mb-1">
              <Activity className="h-3.5 w-3.5" /> القدرة الحالية
            </div>
            <p className="text-xl font-bold tabular-nums text-emerald-600">{fmtCompact(stats.totalCurrentPower)}</p>
            <p className="text-xs text-muted-foreground">kW</p>
          </Card>
          <Card className="p-4 bg-blue-50 dark:bg-blue-950/30 border-blue-200">
            <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-400 mb-1">
              <TrendingUp className="h-3.5 w-3.5" /> أعلى قدرة
            </div>
            <p className="text-xl font-bold tabular-nums text-blue-600">{fmtCompact(stats.totalMaxPower)}</p>
            <p className="text-xs text-muted-foreground">kW</p>
          </Card>
          <Card className="p-4 bg-violet-50 dark:bg-violet-950/30 border-violet-200">
            <div className="flex items-center gap-2 text-xs text-violet-700 dark:text-violet-400 mb-1">
              <Grid3x3 className="h-3.5 w-3.5" /> مصدرة للشبكة
            </div>
            <p className="text-xl font-bold tabular-nums text-violet-600">{fmtCompact(stats.totalExported)}</p>
            <p className="text-xs text-muted-foreground">kWh</p>
          </Card>
        </div>
      </div>

      {/* SLA Indicators */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Gauge className="h-5 w-5 text-primary" />
          <h3 className="font-cairo text-lg font-bold">مؤشرات SLA</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4 bg-red-50 dark:bg-red-950/30 border-red-200">
            <div className="flex items-center gap-2 text-xs text-red-700 dark:text-red-400 mb-1">
              <Clock className="h-3.5 w-3.5" /> زمن انقطاع الأجهزة
            </div>
            <p className="text-xl font-bold tabular-nums text-red-600">{fmtDuration(stats.totalDeviceDowntimeMinutes)}</p>
          </Card>
          <Card className="p-4 bg-amber-50 dark:bg-amber-950/30 border-amber-200">
            <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 mb-1">
              <Clock className="h-3.5 w-3.5" /> زمن معالجة الحالات
            </div>
            <p className="text-xl font-bold tabular-nums text-amber-600">{stats.avgCaseProcessingHours.toFixed(1)} <span className="text-xs font-normal">ساعة</span></p>
          </Card>
          <Card className="p-4 bg-blue-50 dark:bg-blue-950/30 border-blue-200">
            <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-400 mb-1">
              <AlertCircle className="h-3.5 w-3.5" /> قراءات ناقصة
            </div>
            <p className="text-xl font-bold tabular-nums text-blue-600">{stats.avgMissingReadingsPct.toFixed(1)}%</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <AlertTriangle className="h-3.5 w-3.5" /> حالات مفتوحة
            </div>
            <p className="text-xl font-bold tabular-nums">{stats.totalOpenCases}</p>
          </Card>
        </div>
      </div>

      {/* Performance Indicators */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            مؤشرات الأداء
          </CardTitle>
          <CardDescription className="text-xs">متوسط كل المشاريع</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="col-span-2">
              <ResponsiveContainer width="100%" height={200}>
                <RadialBarChart cx="50%" cy="50%" innerRadius="20%" outerRadius="100%" data={performanceData} startAngle={90} endAngle={-270}>
                  <RadialBar background dataKey="value" cornerRadius={6} />
                  <Legend iconSize={8} layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} formatter={(v: number) => [`${v.toFixed(1)}%`, '']} />
                </RadialBarChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              <div className="p-2 rounded-lg bg-muted/30">
                <p className="text-[10px] text-muted-foreground">Performance Ratio</p>
                <p className="text-lg font-bold tabular-nums text-emerald-600">{stats.averagePR.toFixed(1)}%</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/30">
                <p className="text-[10px] text-muted-foreground">Technical Avail.</p>
                <p className="text-lg font-bold tabular-nums text-teal-600">{stats.averageTechnicalAvailability.toFixed(1)}%</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="p-2 rounded-lg bg-muted/30">
                <p className="text-[10px] text-muted-foreground">Data Avail.</p>
                <p className="text-lg font-bold tabular-nums text-blue-600">{stats.averageDataAvailability.toFixed(1)}%</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/30">
                <p className="text-[10px] text-muted-foreground">Capacity Factor</p>
                <p className="text-lg font-bold tabular-nums text-amber-600">{stats.averageCapacityFactor.toFixed(1)}%</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-project table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">تفاصيل الأداء لكل مشروع</CardTitle>
          <CardDescription className="text-xs">كل المؤشرات + SLA + التنبيهات</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-right">المشروع</th>
                  <th className="p-2 text-center">الطاقة</th>
                  <th className="p-2 text-center">القدرة</th>
                  <th className="p-2 text-center">PR</th>
                  <th className="p-2 text-center">Tech Avail</th>
                  <th className="p-2 text-center">Data Avail</th>
                  <th className="p-2 text-center">إنجاز</th>
                  <th className="p-2 text-center">انقطاع</th>
                  <th className="p-2 text-center">معالجة</th>
                  <th className="p-2 text-center">ناقصة</th>
                  <th className="p-2 text-center">تنبيهات</th>
                </tr>
              </thead>
              <tbody>
                {(projects || []).map((p: any) => (
                  <tr key={p.project.id} className="border-b hover:bg-muted/30">
                    <td className="p-2">
                      <p className="font-medium">{p.project.nameAr || p.project.name}</p>
                      <p className="text-[10px] text-muted-foreground">{p.project.code} • {p.project.city}</p>
                    </td>
                    <td className="p-2 text-center tabular-nums">{fmtCompact(p.energy.total)}</td>
                    <td className="p-2 text-center tabular-nums text-emerald-600">{fmt(p.energy.currentPower)}</td>
                    <td className="p-2 text-center tabular-nums">{p.performance.performanceRatio}%</td>
                    <td className="p-2 text-center tabular-nums">{p.performance.technicalAvailability}%</td>
                    <td className="p-2 text-center tabular-nums">{p.performance.dataAvailability}%</td>
                    <td className="p-2 text-center">
                      <Badge variant="outline" className={`text-[10px] ${p.energy.achievementRate >= 80 ? 'bg-emerald-50 text-emerald-700' : p.energy.achievementRate >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                        {p.energy.achievementRate}%
                      </Badge>
                    </td>
                    <td className="p-2 text-center tabular-nums text-red-600">{fmtDuration(p.sla.deviceDowntimeMinutes)}</td>
                    <td className="p-2 text-center tabular-nums text-amber-600">{p.sla.avgCaseProcessingHours}س</td>
                    <td className="p-2 text-center tabular-nums text-blue-600">{p.sla.missingReadingsPct}%</td>
                    <td className="p-2 text-center">
                      {p.alerts.length > 0 ? (
                        <Badge variant="outline" className={`text-[10px] ${p.alerts.some((a: any) => a.severity === 'critical') ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                          {p.alerts.length}
                        </Badge>
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mx-auto" />
                      )}
                    </td>
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

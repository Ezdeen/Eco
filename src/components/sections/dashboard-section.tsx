'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Zap,
  Leaf,
  DollarSign,
  Sun,
  Cpu,
  AlertTriangle,
  ShieldCheck,
  Activity,
  CheckCircle2,
  XCircle,
  TrendingUp,
} from 'lucide-react'
import { KpiCard } from '@/components/platform/kpi-card'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { StatusBadge } from '@/components/platform/status-badge'

interface DashboardData {
  organization: { id: string; name: string; nameAr: string; code: string; currency: string }
  kpis: {
    totalEnergyKwh: number
    totalCo2AvoidedKg: number
    totalCo2AvoidedTons: number
    totalSavingsSar: number
    totalCapacityKwp: number
    activeProjects: number
    totalProjects: number
    connectedDevices: number
    offlineDevices: number
    totalDevices: number
    openCases: number
    criticalCases: number
    confirmedAttestations: number
    attestedItems: number
    dataQualityRate: number
    attestationRate: number
    unreadNotifications: number
    treeEquivalent: number
    carKmAvoided: number
  }
  trends: { date: string; energy: number; co2: number; savings: number }[]
  projectRanking: {
    id: string
    name: string
    nameAr: string
    code: string
    energy: number
    capacity: number
    specificYield: number
  }[]
  dataQuality: { validated: number; suspect: number; total: number }
  lastUpdated: string
}

export function DashboardSection() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dashboard')
      if (!res.ok) {
        // API returned error (401, 500, etc.) - don't crash, just keep loading state
        console.warn('Dashboard API returned status:', res.status)
        setData(null)
        setLoading(false)
        return
      }
      const json = await res.json()
      // Validate response has expected structure
      if (json && json.kpis) {
        setData(json)
      } else {
        console.warn('Dashboard API returned unexpected data structure')
        setData(null)
      }
    } catch (e) {
      console.error('Dashboard fetch error:', e)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="h-32 animate-pulse bg-muted/40" />
          ))}
        </div>
        <Card className="h-96 animate-pulse bg-muted/40" />
      </div>
    )
  }

  const { kpis, trends, projectRanking, dataQuality, organization } = data

  // Format numbers
  const fmt = (n: number) => n.toLocaleString('en-US')
  const fmtCompact = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toString()

  // Chart colors
  const COLORS = ['#16a34a', '#0891b2', '#ca8a04', '#2563eb', '#dc2626']

  return (
    <div className="space-y-5">
      {/* Top KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <KpiCard
          label="إجمالي الطاقة المُنتجة"
          value={fmtCompact(kpis.totalEnergyKwh)}
          unit="kWh"
          icon={Zap}
          variant="success"
          trend={12.4}
          trendLabel="آخر 30 يوم"
          sublabel={`القدرة المنصوبة: ${fmt(kpis.totalCapacityKwp)} kWp`}
        />
        <KpiCard
          label="الكربون المتجنب"
          value={fmtCompact(kpis.totalCo2AvoidedKg)}
          unit="kgCO₂e"
          icon={Leaf}
          variant="success"
          trend={11.8}
          trendLabel="آخر 30 يوم"
          sublabel={`≈ ${fmt(kpis.totalCo2AvoidedTons)} طن CO₂e`}
        />
        <KpiCard
          label="الوفر المالي"
          value={fmtCompact(kpis.totalSavingsSar)}
          unit={organization.currency}
          icon={DollarSign}
          variant="info"
          trend={9.2}
          trendLabel="آخر 30 يوم"
          sublabel={`بمعدّل تعرفة متوسط 0.18 SAR/kWh`}
        />
        <KpiCard
          label="المشاريع النشطة"
          value={kpis.activeProjects}
          unit={`/ ${kpis.totalProjects}`}
          icon={Sun}
          variant="default"
          sublabel={`${kpis.connectedDevices}/${kpis.totalDevices} جهاز متصل`}
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Energy trend */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">اتجاه الإنتاج اليومي</CardTitle>
                <CardDescription className="text-xs">آخر 30 يومًا - الطاقة والكربون المتجنب</CardDescription>
              </div>
              <div className="flex gap-2">
                <Badge variant="outline" className="text-xs">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 ml-1.5" />
                  الطاقة (kWh)
                </Badge>
                <Badge variant="outline" className="text-xs">
                  <span className="h-2 w-2 rounded-full bg-teal-500 ml-1.5" />
                  CO₂e (kg)
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={trends} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="energyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#16a34a" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="co2Grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0891b2" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#0891b2" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#6b7280' }}
                  tickFormatter={(d) => d.slice(5)}
                  interval={4}
                />
                <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} tickFormatter={(v) => fmtCompact(v)} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                  formatter={(v: number, name: string) => [fmt(v), name === 'energy' ? 'الطاقة (kWh)' : 'CO₂e (kg)']}
                />
                <Area type="monotone" dataKey="energy" stroke="#16a34a" strokeWidth={2} fill="url(#energyGrad)" />
                <Area type="monotone" dataKey="co2" stroke="#0891b2" strokeWidth={2} fill="url(#co2Grad)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Data Quality Donut */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">جودة البيانات</CardTitle>
            <CardDescription className="text-xs">حالة القراءات المستلَمة</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={[
                    { name: 'متحقّق', value: dataQuality.validated, color: '#16a34a' },
                    { name: 'مشبوه', value: dataQuality.suspect, color: '#ca8a04' },
                  ]}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {[0, 1].map((i) => (
                    <Cell key={i} fill={i === 0 ? '#16a34a' : '#ca8a04'} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(v: number) => [fmt(v), '']}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-2 mt-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>متحقّق</span>
                </div>
                <span className="tabular-nums font-semibold">{fmt(dataQuality.validated)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span>مشبوه</span>
                </div>
                <span className="tabular-nums font-semibold">{fmt(dataQuality.suspect)}</span>
              </div>
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">نسبة الجودة</span>
                  <span className="font-bold text-emerald-600 tabular-nums">{kpis.dataQualityRate}%</span>
                </div>
                <Progress value={kpis.dataQualityRate} className="h-1.5 mt-1" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <KpiCard
          label="الأجهزة المتصلة"
          value={kpis.connectedDevices}
          unit={`/ ${kpis.totalDevices}`}
          icon={Cpu}
          variant={kpis.offlineDevices > 0 ? 'warning' : 'success'}
          sublabel={`${kpis.offlineDevices} غير متصل`}
        />
        <KpiCard
          label="الحالات المفتوحة"
          value={kpis.openCases}
          icon={AlertTriangle}
          variant={kpis.criticalCases > 0 ? 'danger' : 'default'}
          sublabel={`${kpis.criticalCases} حرجة`}
        />
        <KpiCard
          label="تأكيدات Hedera"
          value={kpis.confirmedAttestations}
          icon={ShieldCheck}
          variant="success"
          sublabel={`${fmt(kpis.attestedItems)} عنصر موثّق`}
        />
        <KpiCard
          label="نسبة التوثيق"
          value={kpis.attestationRate}
          unit="%"
          icon={Activity}
          variant="info"
          sublabel="من إجمالي القراءات"
        />
      </div>

      {/* Equivalences + Project Ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Equivalences */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">المكافئات التوعوية</CardTitle>
            <CardDescription className="text-xs">تقديرات تواصلية لأثر بيئي مكافئ</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900 text-2xl">
                🌳
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">أشجار مكافئة</p>
                <p className="font-cairo text-xl font-bold tabular-nums">{fmt(kpis.treeEquivalent)}</p>
                <p className="text-[10px] text-muted-foreground">شجرة/سنة</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900 text-2xl">
                🚗
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">كم سيارة متجنّب</p>
                <p className="font-cairo text-xl font-bold tabular-nums">{fmt(kpis.carKmAvoided)}</p>
                <p className="text-[10px] text-muted-foreground">km</p>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed pt-2 border-t">
              * هذه المكافئات تقديرية لأغراض التواصل وفق عوامل EPA. القيم الفعلية تتأثر بالمنهجية والعوامل المؤرخة.
            </p>
          </CardContent>
        </Card>

        {/* Project Ranking */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">ترتيب المشاريع بالإنتاج</CardTitle>
                <CardDescription className="text-xs">حسب الطاقة المُنتجة آخر 30 يومًا</CardDescription>
              </div>
              <TrendingUp className="h-5 w-5 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={projectRanking} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#6b7280' }} tickFormatter={(v) => fmtCompact(v)} />
                <YAxis
                  type="category"
                  dataKey="code"
                  tick={{ fontSize: 11, fill: '#374151' }}
                  width={70}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(v: number) => [`${fmt(v)} kWh`, 'الطاقة']}
                  labelFormatter={(code) => {
                    const p = projectRanking.find((p) => p.code === code)
                    return p?.nameAr || code
                  }}
                />
                <Bar dataKey="energy" radius={[0, 4, 4, 0]}>
                  {projectRanking.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Specific Yield table */}
            <div className="mt-3 space-y-1.5">
              {projectRanking.slice(0, 3).map((p, i) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/40 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white shrink-0"
                      style={{ backgroundColor: COLORS[i] }}
                    >
                      {i + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{p.nameAr}</p>
                      <p className="text-xs text-muted-foreground">{p.code}</p>
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    <p className="text-sm font-semibold tabular-nums">{fmtCompact(p.energy)} kWh</p>
                    <p className="text-xs text-muted-foreground tabular-nums">SY: {p.specificYield.toFixed(1)} kWh/kWp</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

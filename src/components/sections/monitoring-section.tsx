'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/platform/status-badge'
import { Activity, AlertTriangle, AlertCircle, CheckCircle2, Clock, BellRing, ShieldCheck } from 'lucide-react'
import { Progress } from '@/components/ui/progress'

interface Case {
  id: string
  title: string
  caseType: string
  priority: string
  status: string
  description?: string
  slaDeadline?: string
  createdAt: string
  project: { name: string; nameAr?: string; code: string }
}

interface NotificationItem {
  id: string
  title: string
  body: string
  severity: string
  isRead: boolean
  createdAt: string
  project?: { name: string; nameAr?: string; code: string }
}

interface DashboardSummary {
  kpis?: {
    dataQualityRate?: number
    attestationRate?: number
    connectedDevices?: number
    totalDevices?: number
    unreadNotifications?: number
    openCases?: number
    criticalCases?: number
  }
}

const CASE_TYPE_LABELS: Record<string, string> = {
  anomaly: 'قراءة شاذة',
  device_offline: 'جهاز غير متصل',
  data_gap: 'فجوة بيانات',
  attestation_failure: 'فشل التوثيق',
  performance_drop: 'هبوط الأداء',
}

const PRIORITY_CONFIG = {
  critical: { label: 'حرج', color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900' },
  high: { label: 'عالٍ', color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900' },
  medium: { label: 'متوسط', color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900' },
  low: { label: 'منخفض', color: 'text-gray-600', bg: 'bg-gray-100 dark:bg-gray-800' },
}

const SEVERITY_CONFIG: Record<string, { label: string; color: string }> = {
  error: { label: 'خطأ', color: 'text-red-600' },
  warning: { label: 'تنبيه', color: 'text-amber-600' },
  success: { label: 'نجاح', color: 'text-emerald-600' },
  info: { label: 'معلومة', color: 'text-blue-600' },
}

export function MonitoringSection() {
  const [cases, setCases] = useState<Case[]>([])
  const [stats, setStats] = useState<any>(null)
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      setLoading(true)
      try {
        const [casesRes, dashboardRes, notificationsRes] = await Promise.all([
          fetch('/api/cases'),
          fetch('/api/dashboard'),
          fetch('/api/notifications?unreadOnly=true&limit=5'),
        ])

        if (cancelled) return

        const casesData = casesRes.ok ? await casesRes.json() : { cases: [], stats: null }
        const dashboardData = dashboardRes.ok ? await dashboardRes.json() : null
        const notificationsData = notificationsRes.ok ? await notificationsRes.json() : { notifications: [] }

        setCases(casesData?.cases || [])
        setStats(casesData?.stats || null)
        setDashboard(dashboardData)
        setNotifications(notificationsData?.notifications || [])
      } catch {
        if (!cancelled) {
          setCases([])
          setStats(null)
          setDashboard(null)
          setNotifications([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadData()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return <Card className="h-96 animate-pulse bg-muted/40" />
  }

  const dataQualityRate = dashboard?.kpis?.dataQualityRate ?? 0
  const attestationRate = dashboard?.kpis?.attestationRate ?? 0
  const connectedDevices = dashboard?.kpis?.connectedDevices ?? 0
  const totalDevices = dashboard?.kpis?.totalDevices ?? 0
  const connectedRatio = totalDevices > 0 ? (connectedDevices / totalDevices) * 100 : 0
  const unreadNotifications = notifications.length
  const openCasesCount = stats?.open || 0
  const criticalCasesCount = stats?.critical || 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">إجمالي الحالات</p>
              <p className="text-2xl font-bold tabular-nums">{stats?.total || 0}</p>
            </div>
            <Activity className="h-8 w-8 text-muted-foreground/30" />
          </div>
        </Card>
        <Card className="p-4 bg-amber-50 dark:bg-amber-950/30 border-amber-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-amber-700 dark:text-amber-400">مفتوحة</p>
              <p className="text-2xl font-bold tabular-nums text-amber-600">{openCasesCount}</p>
            </div>
            <AlertCircle className="h-8 w-8 text-amber-300" />
          </div>
        </Card>
        <Card className="p-4 bg-blue-50 dark:bg-blue-950/30 border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-blue-700 dark:text-blue-400">تنبيهات غير مقروءة</p>
              <p className="text-2xl font-bold tabular-nums text-blue-600">{unreadNotifications}</p>
            </div>
            <BellRing className="h-8 w-8 text-blue-300" />
          </div>
        </Card>
        <Card className="p-4 bg-red-50 dark:bg-red-950/30 border-red-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-red-700 dark:text-red-400">حرجة</p>
              <p className="text-2xl font-bold tabular-nums text-red-600">{criticalCasesCount}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-red-300" />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">آخر التحديثات</CardTitle>
          <CardDescription className="text-xs">
            متصل مباشرة بالتنبيهات والحالات الجديدة من النظام
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {notifications.length > 0 ? (
            notifications.map((notification) => {
              const config = SEVERITY_CONFIG[notification.severity] || SEVERITY_CONFIG.info
              return (
                <div key={notification.id} className="rounded-xl border border-border bg-muted/30 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{notification.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{notification.body}</p>
                    </div>
                    <Badge variant="outline" className={`text-[10px] ${config.color} border-current`}>
                      {config.label}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    {notification.project && <span>{notification.project.nameAr || notification.project.name}</span>}
                    <span>•</span>
                    <span className="tabular-nums">{new Date(notification.createdAt).toLocaleString('ar-SA', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              )
            })
          ) : (
            <p className="text-sm text-muted-foreground">لا توجد تحديثات جديدة حالياً.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">الحوادث والتنبيهات</CardTitle>
          <CardDescription className="text-xs">
            كل عنصر يعرض السبب والحالة الحالية مباشرة من سجلات النظام
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {cases.map((c) => {
            const config = PRIORITY_CONFIG[c.priority as keyof typeof PRIORITY_CONFIG] || PRIORITY_CONFIG.medium
            const isResolved = c.status === 'resolved' || c.status === 'closed'
            return (
              <div
                key={c.id}
                className={`p-4 rounded-xl border ${
                  isResolved
                    ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200'
                    : c.priority === 'critical'
                      ? 'bg-red-50/50 dark:bg-red-950/20 border-red-200'
                      : c.priority === 'high'
                        ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200'
                        : 'bg-card border-border'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${config.bg}`}>
                    {isResolved ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    ) : c.priority === 'critical' ? (
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                    ) : (
                      <AlertCircle className={`h-5 w-5 ${config.color}`} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h4 className="font-semibold text-sm">{c.title}</h4>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className={`text-xs ${config.color} border-current`}>
                          {config.label}
                        </Badge>
                        <StatusBadge status={c.status} />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{c.description}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="font-medium">{c.project.nameAr || c.project.name}</span>
                      <span>•</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {CASE_TYPE_LABELS[c.caseType] || c.caseType}
                      </Badge>
                      <span>•</span>
                      <span className="tabular-nums">
                        {new Date(c.createdAt).toLocaleString('ar-SA', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {c.slaDeadline && !isResolved && (
                        <>
                          <span>•</span>
                          <span className="text-red-600 dark:text-red-400">
                            SLA: {new Date(c.slaDeadline).toLocaleString('ar-SA', { hour: '2-digit', minute: '2-digit', day: '2-digit' })}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">صحة النظام</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm">جودة البيانات</span>
              <span className="text-sm font-semibold text-emerald-600">{dataQualityRate.toFixed(1)}%</span>
            </div>
            <Progress value={dataQualityRate} className="h-2" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm">توصّل الأجهزة</span>
              <span className="text-sm font-semibold text-emerald-600">{connectedRatio.toFixed(1)}%</span>
            </div>
            <Progress value={connectedRatio} className="h-2" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm">نسبة التوثيق</span>
              <span className="text-sm font-semibold text-blue-600">{attestationRate.toFixed(1)}%</span>
            </div>
            <Progress value={attestationRate} className="h-2" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm">الحالات الحرجة</span>
              <span className="text-sm font-semibold text-red-600">{criticalCasesCount}</span>
            </div>
            <Progress value={Math.min(100, criticalCasesCount * 20)} className="h-2" />
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            آخر تحديث تلقائي من لوحة القيادة والتنبيهات
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

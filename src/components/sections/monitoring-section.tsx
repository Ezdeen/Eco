'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/platform/status-badge'
import { Activity, AlertTriangle, AlertCircle, CheckCircle2, Clock, TrendingDown } from 'lucide-react'
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

export function MonitoringSection() {
  const [cases, setCases] = useState<Case[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/cases')
      .then((r) => r.json())
      .then((d) => {
        setCases(d.cases || [])
        setStats(d.stats)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <Card className="h-96 animate-pulse bg-muted/40" />
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
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
              <p className="text-2xl font-bold tabular-nums text-amber-600">{stats?.open || 0}</p>
            </div>
            <AlertCircle className="h-8 w-8 text-amber-300" />
          </div>
        </Card>
        <Card className="p-4 bg-blue-50 dark:bg-blue-950/30 border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-blue-700 dark:text-blue-400">قيد المعالجة</p>
              <p className="text-2xl font-bold tabular-nums text-blue-600">{stats?.inProgress || 0}</p>
            </div>
            <Clock className="h-8 w-8 text-blue-300" />
          </div>
        </Card>
        <Card className="p-4 bg-red-50 dark:bg-red-950/30 border-red-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-red-700 dark:text-red-400">حرجة</p>
              <p className="text-2xl font-bold tabular-nums text-red-600">{stats?.critical || 0}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-red-300" />
          </div>
        </Card>
      </div>

      {/* Cases list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">الحوادث والتنبيهات</CardTitle>
          <CardDescription className="text-xs">
            لا تعتمد على اللون فقط؛ كل تنبيه يعرض نصاً وسببًا قابلًا للتفسير
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
                      <CheckCircle2 className={`h-5 w-5 text-emerald-600`} />
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

      {/* Health overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">صحة النظام</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm">جودة البيانات</span>
              <span className="text-sm font-semibold text-emerald-600">96.2%</span>
            </div>
            <Progress value={96.2} className="h-2" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm">توصّل الأجهزة</span>
              <span className="text-sm font-semibold text-emerald-600">93.5%</span>
            </div>
            <Progress value={93.5} className="h-2" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm">نسبة التوثيق</span>
              <span className="text-sm font-semibold text-blue-600">87.4%</span>
            </div>
            <Progress value={87.4} className="h-2" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm">Performance Ratio</span>
              <span className="text-sm font-semibold text-emerald-600">82.1%</span>
            </div>
            <Progress value={82.1} className="h-2" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm">التوافر</span>
              <span className="text-sm font-semibold text-emerald-600">98.5%</span>
            </div>
            <Progress value={98.5} className="h-2" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/platform/status-badge'
import { Coins, TrendingUp, TrendingDown, Ban, CheckCircle2 } from 'lucide-react'

export function ImpactSection() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/impact')
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false))
  }, [])

  if (loading || !data) {
    return <Card className="h-96 animate-pulse bg-muted/40" />
  }

  const fmt = (n: number) => (n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
            <Coins className="h-3 w-3" /> الرصيد الكلي
          </div>
          <p className="text-xl font-bold tabular-nums">{fmt(data.stats?.totalBalance || 0)}</p>
          <p className="text-[10px] text-muted-foreground">kgCO₂e</p>
        </Card>
        <Card className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200">
          <div className="flex items-center gap-1 text-xs text-emerald-700 mb-1">
            <CheckCircle2 className="h-3 w-3" /> مُصدَر/متحقّق
          </div>
          <p className="text-xl font-bold tabular-nums text-emerald-600">{fmt(data.stats?.totalIssued || 0)}</p>
          <p className="text-[10px] text-muted-foreground">kgCO₂e</p>
        </Card>
        <Card className="p-4 bg-purple-50 dark:bg-purple-950/30 border-purple-200">
          <div className="flex items-center gap-1 text-xs text-purple-700 mb-1">
            <TrendingDown className="h-3 w-3" /> مُحال (Retired)
          </div>
          <p className="text-xl font-bold tabular-nums text-purple-600">{fmt(data.stats?.totalRetired || 0)}</p>
          <p className="text-[10px] text-muted-foreground">kgCO₂e</p>
        </Card>
        <Card className="p-4 bg-red-50 dark:bg-red-950/30 border-red-200">
          <div className="flex items-center gap-1 text-xs text-red-700 mb-1">
            <Ban className="h-3 w-3" /> مُلغى
          </div>
          <p className="text-xl font-bold tabular-nums text-red-600">{fmt(data.stats?.totalCancelled || 0)}</p>
          <p className="text-[10px] text-muted-foreground">kgCO₂e</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
            <TrendingUp className="h-3 w-3" /> تقديري
          </div>
          <p className="text-xl font-bold tabular-nums">{fmt(data.stats?.totalEstimated || 0)}</p>
          <p className="text-[10px] text-muted-foreground">kgCO₂e</p>
        </Card>
      </div>

      {/* Disclaimer banner */}
      <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200">
        <CardContent className="p-3">
          <p className="text-xs text-amber-800 dark:text-amber-300">
            <strong>تنبيه:</strong> وحدات الأثر الداخلية في المنصة ليست اعتمادات كربونية تجارية افتراضيًا.
            لا تُسمّ كل طن CO₂e متجنب «عملة كربونية». التداول والاعتماد التجاري مؤجلان حتى استيفاء المتطلبات القانونية والمنهجية.
          </p>
        </CardContent>
      </Card>

      {/* Accounts */}
      {data.accounts?.map((acc: any) => (
        <Card key={acc.id}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Coins className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">{acc.name}</CardTitle>
                  <CardDescription className="text-xs">
                    {acc.organization?.nameAr} • {acc.unit}
                  </CardDescription>
                </div>
              </div>
              <div className="text-left">
                <p className="text-2xl font-bold tabular-nums">{fmt(acc.balance)}</p>
                <p className="text-xs text-muted-foreground">{acc.unit}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Status breakdown */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
              {['estimated', 'verified', 'issued', 'transferred', 'retired', 'cancelled'].map((status) => {
                const value = acc.byStatus?.[status] || 0
                return (
                  <div key={status} className="p-2 rounded-lg bg-muted/40 text-center">
                    <p className="text-[10px] text-muted-foreground">
                      {status === 'estimated' ? 'تقديري' :
                       status === 'verified' ? 'متحقّق' :
                       status === 'issued' ? 'مُصدَر' :
                       status === 'transferred' ? 'منقول' :
                       status === 'retired' ? 'مُحال' : 'مُلغى'}
                    </p>
                    <p className="text-sm font-bold tabular-nums">{fmt(value)}</p>
                  </div>
                )
              })}
            </div>

            {/* Recent units */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">آخر الحركات</p>
              {acc.recentUnits?.slice(0, 5).map((u: any) => (
                <div key={u.id} className="flex items-center justify-between p-2 rounded-lg bg-card border">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                      <TrendingUp className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{u.project?.nameAr || u.project?.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(u.periodStart).toLocaleDateString('ar-SA')} → {new Date(u.periodEnd).toLocaleDateString('ar-SA')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <p className="text-sm font-bold tabular-nums">{fmt(u.amount)}</p>
                    <span className="text-[10px] text-muted-foreground">{u.unit}</span>
                    <StatusBadge status={u.status} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

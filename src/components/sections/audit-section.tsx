'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollText, Shield, CheckCircle2, XCircle, Activity } from 'lucide-react'

export function AuditSection() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/audit')
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false))
  }, [])

  if (loading || !data) {
    return <Card className="h-96 animate-pulse bg-muted/40" />
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
            <ScrollText className="h-3 w-3" /> إجمالي الأحداث
          </div>
          <p className="text-xl font-bold tabular-nums">{data.stats.total.toLocaleString()}</p>
        </Card>
        <Card className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200">
          <div className="flex items-center gap-1 text-xs text-emerald-700 mb-1">
            <CheckCircle2 className="h-3 w-3" /> ناجحة
          </div>
          <p className="text-xl font-bold tabular-nums text-emerald-600">{data.stats.successful.toLocaleString()}</p>
        </Card>
        <Card className="p-4 bg-red-50 dark:bg-red-950/30 border-red-200">
          <div className="flex items-center gap-1 text-xs text-red-700 mb-1">
            <XCircle className="h-3 w-3" /> فاشلة
          </div>
          <p className="text-xl font-bold tabular-nums text-red-600">{data.stats.failed.toLocaleString()}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
            <Activity className="h-3 w-3" /> اليوم
          </div>
          <p className="text-xl font-bold tabular-nums">{data.stats.today.toLocaleString()}</p>
        </Card>
      </div>

      {/* Audit log table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-5 w-5" />
            سجل التدقيق
          </CardTitle>
          <CardDescription className="text-xs">
            سجل append-only يحتوي actor, action, resource, result, IP, correlation ID. لا تُخزَّن الأسرار.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead>الوقت</TableHead>
                  <TableHead>المستخدم</TableHead>
                  <TableHead>الإجراء</TableHead>
                  <TableHead>المورد</TableHead>
                  <TableHead>النتيجة</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Correlation ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.events.map((e: any) => (
                  <TableRow key={e.id} className="hover:bg-muted/40">
                    <TableCell>
                      <p className="text-xs tabular-nums">
                        {new Date(e.createdAt).toLocaleString('ar-SA', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs font-medium">{e.user?.nameAr || e.user?.name || e.actor}</p>
                      <p className="text-[10px] text-muted-foreground">{e.actor}</p>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{e.action}</code>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs">{e.resource}</p>
                      {e.resourceId && <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[100px]">{e.resourceId.slice(0, 12)}...</p>}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={e.result === 'success' ? 'default' : 'destructive'}
                        className={`text-xs ${e.result === 'success' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900 dark:text-emerald-300' : ''}`}
                      >
                        {e.result === 'success' ? 'ناجح' : 'فاشل'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs font-mono">{e.ipAddress || '—'}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-[10px] font-mono text-muted-foreground">{e.correlationId || '—'}</p>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/platform/status-badge'
import { Button } from '@/components/ui/button'
import { FileBarChart, Download, FileText, CheckCircle2, Clock, FilePlus } from 'lucide-react'
import { toast } from 'sonner'

export function ReportsSection() {
  const [reports, setReports] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/reports')
      .then((r) => r.json())
      .then((d) => setReports(d.reports || []))
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
          <p className="text-xs text-muted-foreground">إجمالي التقارير</p>
          <p className="text-2xl font-bold tabular-nums">{reports.length}</p>
        </Card>
        <Card className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200">
          <p className="text-xs text-emerald-700">منشور</p>
          <p className="text-2xl font-bold tabular-nums text-emerald-600">{reports.filter(r => r.status === 'published').length}</p>
        </Card>
        <Card className="p-4 bg-amber-50 dark:bg-amber-950/30 border-amber-200">
          <p className="text-xs text-amber-700">قيد المراجعة</p>
          <p className="text-2xl font-bold tabular-nums text-amber-600">{reports.filter(r => r.status === 'under_review').length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">مسودة</p>
          <p className="text-2xl font-bold tabular-nums">{reports.filter(r => r.status === 'draft').length}</p>
        </Card>
      </div>

      {/* Actions */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">تقرير موحد يذكر مصادر البيانات والصيغ وإصدارات المعاملات - حالات: draft, under_review, approved, published, revoked</p>
          <Button>
            <FilePlus className="h-4 w-4 ml-1" />
            تقرير جديد
          </Button>
        </CardContent>
      </Card>

      {/* Reports list */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reports.map((r) => (
          <Card key={r.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-sm">{r.title}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {r.project?.nameAr || r.project?.name} ({r.project?.code})
                    </p>
                  </div>
                </div>
                <StatusBadge status={r.status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{r.summary}</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-muted/40">
                  <p className="text-muted-foreground">الفترة</p>
                  <p className="font-medium tabular-nums">
                    {new Date(r.periodStart).toLocaleDateString('ar-SA')} → {new Date(r.periodEnd).toLocaleDateString('ar-SA')}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-muted/40">
                  <p className="text-muted-foreground">النوع</p>
                  <p className="font-medium">{r.reportType === 'comprehensive' ? 'شامل' : r.reportType}</p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {new Date(r.createdAt).toLocaleDateString('ar-SA')}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">v{r.version}</Badge>
                  <Button variant="outline" size="sm" className="h-7 text-xs">
                    <Download className="h-3 w-3 ml-1" />
                    PDF
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs">
                    <Download className="h-3 w-3 ml-1" />
                    XLSX
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {reports.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileBarChart className="h-12 w-12 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">لا توجد تقارير</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

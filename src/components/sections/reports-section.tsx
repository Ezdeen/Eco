'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/platform/status-badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { FileBarChart, Download, FileText, CheckCircle2, Clock, FilePlus, FileSpreadsheet, FileCode, Eye, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export function ReportsSection() {
  const [reports, setReports] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [previewReport, setPreviewReport] = useState<any | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const fetchReports = useCallback(() => {
    setLoading(true)
    fetch('/api/reports')
      .then((r) => r.json())
      .then((d) => setReports(d.reports || []))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      fetch('/api/reports')
        .then((r) => r.json())
        .then((d) => {
          if (cancelled) return
          setReports(d.reports || [])
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleDownload = async (report: any, format: 'pdf' | 'csv' | 'html') => {
    setDownloadingId(report.id)
    try {
      const reportName = `${report.project?.code || 'report'}-${(report.periodStart || '').slice(0, 10)}`

      if (format === 'pdf') {
        // Use the dedicated PDF API that uses Playwright to generate a real PDF
        const res = await fetch(`/api/reports/${report.id}/pdf`)
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'فشل توليد PDF')
        }
        const pdfBlob = await res.blob()

        // Trigger download using a more robust method
        const url = URL.createObjectURL(pdfBlob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${reportName}.pdf`
        a.rel = 'noopener'
        a.target = '_self'
        a.style.display = 'none'
        document.body.appendChild(a)

        // Use programmatic click
        const clickEvent = new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true,
        })
        a.dispatchEvent(clickEvent)

        // Cleanup after download starts
        setTimeout(() => {
          if (a.parentNode) {
            document.body.removeChild(a)
          }
          URL.revokeObjectURL(url)
        }, 2000)

        toast.success(`تم تحميل التقرير بصيغة PDF (${(pdfBlob.size / 1024).toFixed(0)} KB)`)
      } else if (format === 'csv') {
        const res = await fetch(`/api/reports/${report.id}/download?format=csv`)
        if (!res.ok) throw new Error('فشل تحميل CSV')
        const csv = await res.text()
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${reportName}.csv`
        a.rel = 'noopener'
        a.style.display = 'none'
        document.body.appendChild(a)
        const clickEvent = new MouseEvent('click', { view: window, bubbles: true, cancelable: true })
        a.dispatchEvent(clickEvent)
        setTimeout(() => {
          if (a.parentNode) document.body.removeChild(a)
          URL.revokeObjectURL(url)
        }, 2000)
        toast.success('تم تحميل التقرير بصيغة CSV')
      } else if (format === 'html') {
        const res = await fetch(`/api/reports/${report.id}/download?format=html`)
        if (!res.ok) throw new Error('فشل تحميل HTML')
        const html = await res.text()
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${reportName}.html`
        a.rel = 'noopener'
        a.style.display = 'none'
        document.body.appendChild(a)
        const clickEvent = new MouseEvent('click', { view: window, bubbles: true, cancelable: true })
        a.dispatchEvent(clickEvent)
        setTimeout(() => {
          if (a.parentNode) document.body.removeChild(a)
          URL.revokeObjectURL(url)
        }, 2000)
        toast.success('تم تحميل التقرير بصيغة HTML')
      }
    } catch (e: any) {
      console.error('Download error:', e)
      toast.error(e.message || 'فشل تحميل التقرير')
    } finally {
      setDownloadingId(null)
    }
  }

  const handlePreview = async (report: any) => {
    setPreviewReport({ ...report, loading: true })
    setPreviewOpen(true)
    try {
      const res = await fetch(`/api/reports/${report.id}/download?format=json`)
      const data = await res.json()
      setPreviewReport({ ...report, data, loading: false })
    } catch (e) {
      setPreviewReport({ ...report, loading: false, error: true })
      toast.error('فشل تحميل معاينة التقرير')
    }
  }

  if (loading) {
    return <Card className="h-96 animate-pulse bg-muted/40" />
  }

  const fmt = (n: number) => (n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })

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
          <p className="text-2xl font-bold tabular-nums text-emerald-600">{reports.filter((r) => r.status === 'published').length}</p>
        </Card>
        <Card className="p-4 bg-amber-50 dark:bg-amber-950/30 border-amber-200">
          <p className="text-xs text-amber-700">قيد المراجعة</p>
          <p className="text-2xl font-bold tabular-nums text-amber-600">{reports.filter((r) => r.status === 'under_review').length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">مسودة</p>
          <p className="text-2xl font-bold tabular-nums">{reports.filter((r) => r.status === 'draft').length}</p>
        </Card>
      </div>

      {/* Actions */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            تقارير شاملة مع رسوم بيانية وألوان ومعلومات تفصيلية - يمكن تحميلها بصيغ متعددة
          </p>
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
                  <Badge variant="outline" className="text-xs">v{r.version}</Badge>
                </div>
              </div>

              {/* Download buttons */}
              <div className="grid grid-cols-4 gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs flex flex-col gap-0.5"
                  onClick={() => handlePreview(r)}
                  title="معاينة"
                >
                  <Eye className="h-3 w-3" />
                  <span className="text-[10px]">معاينة</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs flex flex-col gap-0.5 border-red-200 text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                  onClick={() => handleDownload(r, 'pdf')}
                  disabled={downloadingId === r.id}
                  title="تحميل PDF (HTML قابل للطباعة)"
                >
                  {downloadingId === r.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <FileText className="h-3 w-3" />
                  )}
                  <span className="text-[10px]">PDF</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs flex flex-col gap-0.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                  onClick={() => handleDownload(r, 'csv')}
                  disabled={downloadingId === r.id}
                  title="تحميل CSV"
                >
                  <FileSpreadsheet className="h-3 w-3" />
                  <span className="text-[10px]">CSV</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs flex flex-col gap-0.5 border-blue-200 text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30"
                  onClick={() => handleDownload(r, 'html')}
                  disabled={downloadingId === r.id}
                  title="تحميل HTML"
                >
                  <FileCode className="h-3 w-3" />
                  <span className="text-[10px]">HTML</span>
                </Button>
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

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileBarChart className="h-5 w-5 text-primary" />
              معاينة التقرير
            </DialogTitle>
            <DialogDescription>
              {previewReport?.title}
            </DialogDescription>
          </DialogHeader>

          {previewReport?.loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="mr-2 text-sm text-muted-foreground">جاري تحميل التقرير...</span>
            </div>
          ) : previewReport?.error ? (
            <div className="text-center py-12 text-red-600">
              فشل تحميل التقرير
            </div>
          ) : previewReport?.data ? (
            <div className="space-y-4">
              {/* Header */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
                <h3 className="font-cairo text-xl font-bold">{previewReport.data.project.nameAr || previewReport.data.project.name}</h3>
                <p className="text-sm opacity-90 mt-1">
                  {previewReport.data.project.code} • {previewReport.data.project.city} • الفترة: {new Date(previewReport.data.summary.periodStart).toLocaleDateString('ar-SA')} → {new Date(previewReport.data.summary.periodEnd).toLocaleDateString('ar-SA')}
                </p>
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200">
                  <p className="text-xs text-muted-foreground">إجمالي الطاقة</p>
                  <p className="text-xl font-bold tabular-nums text-emerald-600">{fmt(previewReport.data.summary.totalEnergy)}</p>
                  <p className="text-[10px] text-muted-foreground">kWh</p>
                </Card>
                <Card className="p-3 bg-teal-50 dark:bg-teal-950/30 border-teal-200">
                  <p className="text-xs text-muted-foreground">CO₂ متجنب</p>
                  <p className="text-xl font-bold tabular-nums text-teal-600">{fmt(previewReport.data.summary.totalCo2AvoidedTons)}</p>
                  <p className="text-[10px] text-muted-foreground">طن</p>
                </Card>
                <Card className="p-3 bg-amber-50 dark:bg-amber-950/30 border-amber-200">
                  <p className="text-xs text-muted-foreground">الوفر المالي</p>
                  <p className="text-xl font-bold tabular-nums text-amber-600">{fmt(previewReport.data.summary.totalSavings)}</p>
                  <p className="text-[10px] text-muted-foreground">{previewReport.data.project.currency}</p>
                </Card>
                <Card className="p-3 bg-blue-50 dark:bg-blue-950/30 border-blue-200">
                  <p className="text-xs text-muted-foreground">Performance Ratio</p>
                  <p className="text-xl font-bold tabular-nums text-blue-600">{previewReport.data.summary.performanceRatio}</p>
                  <p className="text-[10px] text-muted-foreground">%</p>
                </Card>
              </div>

              {/* Quality */}
              <Card className="p-4">
                <p className="text-sm font-semibold mb-2">جودة البيانات</p>
                <div className="flex h-6 rounded-full overflow-hidden">
                  <div className="bg-emerald-500 flex items-center justify-center text-white text-[10px] font-bold" style={{ width: `${previewReport.data.summary.dataQualityRate}%` }}>
                    {previewReport.data.summary.dataQualityRate.toFixed(1)}% صحيحة
                  </div>
                  {previewReport.data.summary.suspectReadings > 0 && (
                    <div className="bg-amber-500 flex items-center justify-center text-white text-[10px] font-bold" style={{ width: `${(previewReport.data.summary.suspectReadings / previewReport.data.summary.totalReadings) * 100}%` }}>
                      {previewReport.data.summary.suspectReadings}
                    </div>
                  )}
                  {previewReport.data.summary.rejectedReadings > 0 && (
                    <div className="bg-red-500 flex items-center justify-center text-white text-[10px] font-bold" style={{ width: `${(previewReport.data.summary.rejectedReadings / previewReport.data.summary.totalReadings) * 100}%` }}>
                      {previewReport.data.summary.rejectedReadings}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2 mt-3 text-xs">
                  <div className="text-center">
                    <p className="text-muted-foreground">إجمالي</p>
                    <p className="font-bold tabular-nums">{fmt(previewReport.data.summary.totalReadings)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground">صحيحة</p>
                    <p className="font-bold tabular-nums text-emerald-600">{fmt(previewReport.data.summary.validReadings)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground">مشبوهة</p>
                    <p className="font-bold tabular-nums text-amber-600">{fmt(previewReport.data.summary.suspectReadings)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground">مرفوضة</p>
                    <p className="font-bold tabular-nums text-red-600">{fmt(previewReport.data.summary.rejectedReadings)}</p>
                  </div>
                </div>
              </Card>

              {/* Equivalences */}
              <Card className="p-4">
                <p className="text-sm font-semibold mb-3">المكافئات التوعوية</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
                    <span className="text-2xl">🌳</span>
                    <div>
                      <p className="text-xs text-muted-foreground">أشجار مكافئة</p>
                      <p className="font-bold tabular-nums">{fmt(previewReport.data.summary.treeEquivalent)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                    <span className="text-2xl">🚗</span>
                    <div>
                      <p className="text-xs text-muted-foreground">كم سيارة متجنّب</p>
                      <p className="font-bold tabular-nums">{fmt(previewReport.data.summary.carKmAvoided)}</p>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Project info */}
              <Card className="p-4">
                <p className="text-sm font-semibold mb-2">معلومات المشروع</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between p-1.5">
                    <span className="text-muted-foreground">الموقع:</span>
                    <span className="font-medium">{previewReport.data.project.city}, {previewReport.data.project.country}</span>
                  </div>
                  <div className="flex justify-between p-1.5">
                    <span className="text-muted-foreground">القدرة:</span>
                    <span className="font-medium">{fmt(previewReport.data.project.capacityKwp)} kWp</span>
                  </div>
                  <div className="flex justify-between p-1.5">
                    <span className="text-muted-foreground">نوع الإنفرتر:</span>
                    <span className="font-medium">{previewReport.data.project.inverterType || '—'}</span>
                  </div>
                  <div className="flex justify-between p-1.5">
                    <span className="text-muted-foreground">العملة:</span>
                    <span className="font-medium">{previewReport.data.project.currency}</span>
                  </div>
                  {previewReport.data.project.sponsorName && (
                    <div className="flex justify-between p-1.5 col-span-2">
                      <span className="text-muted-foreground">الممول:</span>
                      <span className="font-medium">{previewReport.data.project.sponsorName} ({previewReport.data.project.sponsorPhone})</span>
                    </div>
                  )}
                </div>
              </Card>

              {/* Download buttons in preview */}
              <div className="flex gap-2 pt-2 border-t">
                <Button onClick={() => handleDownload(previewReport, 'pdf')} className="flex-1 bg-red-600 hover:bg-red-700">
                  <FileText className="h-4 w-4 ml-1" />
                  تحميل PDF
                </Button>
                <Button onClick={() => handleDownload(previewReport, 'csv')} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                  <FileSpreadsheet className="h-4 w-4 ml-1" />
                  تحميل CSV
                </Button>
                <Button onClick={() => handleDownload(previewReport, 'html')} className="flex-1 bg-blue-600 hover:bg-blue-700">
                  <FileCode className="h-4 w-4 ml-1" />
                  تحميل HTML
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

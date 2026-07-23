'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/platform/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { FileBarChart, Download, FileText, CheckCircle2, Clock, FilePlus, FileSpreadsheet, FileCode, Eye, Loader2, Printer } from 'lucide-react'
import { toast } from 'sonner'

export function ReportsSection() {
  const [reports, setReports] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newReport, setNewReport] = useState({
    projectId: '',
    title: '',
    reportType: 'comprehensive',
    periodStart: '',
    periodEnd: '',
    summary: '',
  })
  const [previewReport, setPreviewReport] = useState<any | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [cleanupMode, setCleanupMode] = useState<'archive' | 'delete'>('archive')
  const [retentionDays, setRetentionDays] = useState('90')
  const [cleaningUp, setCleaningUp] = useState(false)

  const fetchReports = useCallback(() => {
    setLoading(true)
    fetch('/api/reports')
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then((d) => { setReports(d?.reports || []) })
      .catch(() => { setReports([]) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      fetch('/api/reports')
        .then((r) => { if (!r.ok) throw new Error(); return r.json() })
        .then((d) => {
          if (cancelled) return
          setReports(d?.reports || [])
        })
        .catch(() => {
          if (cancelled) return
          setReports([])
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
      console.warn('Download error:', e)
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
      if (!res.ok) throw new Error('فشل تحميل المعاينة')
      const data = await res.json()
      if (data && data.project && data.summary) {
        setPreviewReport({ ...report, data, loading: false })
      } else {
        setPreviewReport({ ...report, loading: false, error: true })
        toast.error('استجابة غير صالحة')
      }
    } catch {
      setPreviewReport({ ...report, loading: false, error: true })
      toast.error('فشل تحميل معاينة التقرير')
    }
  }

  const handleDelete = async (report: any) => {
    if (!window.confirm('هل تريد حذف هذا التقرير نهائيًا؟')) {
      return
    }

    setDeletingId(report.id)
    try {
      const res = await fetch(`/api/reports/${report.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.error || 'فشل حذف التقرير')
      }
      setReports((current) => current.filter((item) => item.id !== report.id))
      toast.success('تم حذف التقرير بنجاح')
    } catch (e: any) {
      toast.error(e.message || 'فشل حذف التقرير')
    } finally {
      setDeletingId(null)
    }
  }

  const openCreateDialog = async () => {
    setCreateOpen(true)

    if (projects.length > 0) return

    try {
      const response = await fetch('/api/projects')
      if (!response.ok) throw new Error()
      const data = await response.json()
      setProjects(data?.projects || [])
    } catch {
      toast.error('تعذر تحميل قائمة المشاريع')
    }
  }

  const handleCleanupReports = async () => {
    const parsedDays = Number(retentionDays)
    if (!Number.isFinite(parsedDays) || parsedDays < 1) {
      toast.error('يرجى إدخال عدد أيام صالح')
      return
    }

    setCleaningUp(true)
    try {
      const response = await fetch('/api/reports/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: cleanupMode, retentionDays: parsedDays, dryRun: false }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'تعذر تنظيف التقارير')

      toast.success(data.message || 'تمت عملية التنظيف بنجاح')
      fetchReports()
    } catch (error: any) {
      toast.error(error.message || 'تعذر تنظيف التقارير')
    } finally {
      setCleaningUp(false)
    }
  }

  const handleCreateReport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!newReport.projectId || !newReport.title.trim() || !newReport.periodStart || !newReport.periodEnd) {
      toast.error('يرجى إدخال المشروع والعنوان والفترة')
      return
    }

    if (newReport.periodStart > newReport.periodEnd) {
      toast.error('تاريخ البداية يجب أن يسبق تاريخ النهاية')
      return
    }

    setCreating(true)
    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newReport,
          title: newReport.title.trim(),
          summary: newReport.summary.trim() || undefined,
          periodStart: `${newReport.periodStart}T00:00:00.000Z`,
          periodEnd: `${newReport.periodEnd}T23:59:59.999Z`,
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'تعذر إنشاء التقرير')
      }

      setNewReport({
        projectId: '',
        title: '',
        reportType: 'comprehensive',
        periodStart: '',
        periodEnd: '',
        summary: '',
      })
      setCreateOpen(false)
      fetchReports()
      toast.success('تم إنشاء التقرير كمسودة')
    } catch (error: any) {
      toast.error(error.message || 'تعذر إنشاء التقرير')
    } finally {
      setCreating(false)
    }
  }

  // Print report - opens print dialog with formatted HTML
  const handlePrint = async (report: any) => {
    try {
      toast.info('جاري تحضير التقرير للطباعة...')
      const res = await fetch(`/api/reports/${report.id}/download?format=html`)
      if (!res.ok) throw new Error('فشل تحميل التقرير')
      const html = await res.text()

      // Open print window
      const printWindow = window.open('', '_blank', 'width=800,height=900')
      if (!printWindow) {
        toast.error('يرجى السماح بالنوافذ المنبثقة للطباعة')
        return
      }

      printWindow.document.write(html)
      printWindow.document.close()

      // Wait for content to load then print
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.focus()
          printWindow.print()
        }, 500)
      }

      toast.success('تم فتح نافذة الطباعة')
    } catch (e: any) {
      toast.error(e.message || 'فشل تحضير الطباعة')
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
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">مؤرشف</p>
          <p className="text-2xl font-bold tabular-nums">{reports.filter((r) => r.status === 'archived').length}</p>
        </Card>
      </div>

      {/* Actions */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            تقارير شاملة مع رسوم بيانية وألوان ومعلومات تفصيلية - يمكن تحميلها بصيغ متعددة
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-md border bg-background px-2 py-1">
              <Label htmlFor="cleanup-mode" className="text-xs">الإجراء</Label>
              <Select value={cleanupMode} onValueChange={(value) => setCleanupMode(value as 'archive' | 'delete')}>
                <SelectTrigger id="cleanup-mode" className="h-8 w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="archive">أرشفة</SelectItem>
                  <SelectItem value="delete">حذف</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 rounded-md border bg-background px-2 py-1">
              <Label htmlFor="retention-days" className="text-xs">أيام</Label>
              <Input id="retention-days" type="number" min="1" value={retentionDays} onChange={(event) => setRetentionDays(event.target.value)} className="h-8 w-20" />
            </div>
            <Button variant="outline" onClick={handleCleanupReports} disabled={cleaningUp}>
              {cleaningUp ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              تنظيف تلقائي
            </Button>
            <Button onClick={openCreateDialog}>
              <FilePlus className="h-4 w-4 ml-1" />
              تقرير جديد
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إنشاء تقرير جديد</DialogTitle>
            <DialogDescription>سيُنشأ التقرير كمسودة ويمكن تنزيله بعد ذلك.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleCreateReport}>
            <div className="space-y-2">
              <Label htmlFor="report-project">المشروع</Label>
              <select
                id="report-project"
                className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                value={newReport.projectId}
                onChange={(event) => setNewReport((current) => ({ ...current, projectId: event.target.value }))}
                required
              >
                <option value="">اختر مشروعًا</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.nameAr || project.name} ({project.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-title">عنوان التقرير</Label>
              <Input
                id="report-title"
                value={newReport.title}
                onChange={(event) => setNewReport((current) => ({ ...current, title: event.target.value }))}
                placeholder="مثال: التقرير الشهري للطاقة"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-type">نوع التقرير</Label>
              <select
                id="report-type"
                className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                value={newReport.reportType}
                onChange={(event) => setNewReport((current) => ({ ...current, reportType: event.target.value }))}
              >
                <option value="comprehensive">شامل</option>
                <option value="energy">الطاقة</option>
                <option value="carbon">الكربون</option>
                <option value="performance">الأداء</option>
                <option value="quality">جودة البيانات</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="report-period-start">بداية الفترة</Label>
                <Input id="report-period-start" type="date" value={newReport.periodStart} onChange={(event) => setNewReport((current) => ({ ...current, periodStart: event.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="report-period-end">نهاية الفترة</Label>
                <Input id="report-period-end" type="date" value={newReport.periodEnd} onChange={(event) => setNewReport((current) => ({ ...current, periodEnd: event.target.value }))} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-summary">ملاحظات مختصرة (اختياري)</Label>
              <textarea id="report-summary" className="border-input min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={newReport.summary} onChange={(event) => setNewReport((current) => ({ ...current, summary: event.target.value }))} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>إلغاء</Button>
              <Button type="submit" disabled={creating}>
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                إنشاء التقرير
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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
              <div className="grid grid-cols-5 gap-2 pt-2 border-t">
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
                  title="تحميل PDF"
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
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs flex flex-col gap-0.5 border-violet-200 text-violet-700 hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-950/30"
                  onClick={() => handlePrint(r)}
                  title="طباعة التقرير"
                >
                  <Printer className="h-3 w-3" />
                  <span className="text-[10px]">طباعة</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs flex flex-col gap-0.5 border-red-200 text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                  onClick={() => handleDelete(r)}
                  disabled={deletingId === r.id}
                  title="حذف التقرير"
                >
                  {deletingId === r.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3" />
                  )}
                  <span className="text-[10px]">حذف</span>
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
              <Button onClick={() => handlePrint(previewReport)} className="w-full bg-violet-600 hover:bg-violet-700">
                <Printer className="h-4 w-4 ml-1" />
                طباعة التقرير
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

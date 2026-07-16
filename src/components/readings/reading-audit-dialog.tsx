'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Loader2, AlertTriangle, AlertCircle, CheckCircle2, XCircle, TrendingUp, Activity, FileSearch, ArrowUpCircle, Edit3, ShieldAlert } from 'lucide-react'
import { StatusBadge } from '@/components/platform/status-badge'
import { toast } from 'sonner'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'

interface ReadingAuditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  readingId: string | null
  onAudited?: () => void
}

interface AuditData {
  reading: any
  project: any
  device: any
  asset: any
  audit: {
    suspectReason?: string | null
    suspectRuleCode?: string | null
    suspectSeverity?: string | null
    suspectDetails?: any
    auditedAt?: string | null
    auditedBy?: string | null
    auditAction?: string | null
    auditNote?: string | null
    generated?: boolean
  }
  contextReadings?: any[]
  statistics?: {
    average: number
    max: number
    min: number
    stdDev: number
    sampleSize: number
    deviation: number
    isOutlier: boolean
  }
}

const SEVERITY_CONFIG = {
  critical: { label: 'حرج', color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900', icon: AlertCircle },
  high: { label: 'عالٍ', color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900', icon: AlertTriangle },
  medium: { label: 'متوسط', color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900', icon: AlertCircle },
  low: { label: 'منخفض', color: 'text-gray-600', bg: 'bg-gray-100 dark:bg-gray-800', icon: AlertCircle },
}

export function ReadingAuditDialog({ open, onOpenChange, readingId, onAudited }: ReadingAuditDialogProps) {
  const [data, setData] = useState<AuditData | null>(null)
  const [loading, setLoading] = useState(false)
  const [action, setAction] = useState<'approve' | 'correct' | 'reject' | 'escalate'>('approve')
  const [note, setNote] = useState('')
  const [correctedValue, setCorrectedValue] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open || !readingId) {
      setData(null)
      setNote('')
      setCorrectedValue('')
      setAction('approve')
      return
    }

    setLoading(true)
    fetch(`/api/readings/${readingId}/audit`)
      .then((r) => r.json())
      .then((d) => {
        setData(d)
        setCorrectedValue(d.reading?.value?.toString() || '')
      })
      .catch((e) => {
        console.error(e)
        toast.error('فشل تحميل بيانات التدقيق')
      })
      .finally(() => setLoading(false))
  }, [open, readingId])

  const handleSubmit = async () => {
    if (!readingId) return

    setSubmitting(true)
    try {
      const payload: any = { action, note }
      if (action === 'correct' && correctedValue) {
        payload.correctedValue = correctedValue
      }

      const res = await fetch(`/api/readings/${readingId}/audit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await res.json()
      if (!res.ok) {
        toast.error(result.error || 'فشل إرسال قرار التدقيق')
        return
      }

      const actionLabels = {
        approve: 'اعتماد',
        correct: 'تصحيح',
        reject: 'رفض',
        escalate: 'إحالة',
      }
      toast.success(`تم ${actionLabels[action]} القراءة بنجاح`)
      onOpenChange(false)
      onAudited?.()
    } catch (e) {
      toast.error('حدث خطأ في الاتصال')
    } finally {
      setSubmitting(false)
    }
  }

  const fmt = (n: number) => n?.toLocaleString('en-US', { maximumFractionDigits: 2 }) || '—'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <FileSearch className="h-5 w-5 text-primary" />
            استعلام وتدقيق القراءة
          </DialogTitle>
          <DialogDescription>
            تفاصيل القراءة المشبوهة/المرفوضة مع السبب والإجراءات المتاحة
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="mr-2 text-sm text-muted-foreground">جاري تحميل بيانات التدقيق...</span>
          </div>
        ) : !data ? (
          <div className="text-center py-12 text-muted-foreground">لا توجد بيانات</div>
        ) : (
          <div className="space-y-5">
            <Card className="p-4 bg-muted/30">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">المشروع</p>
                  <p className="font-medium">{data.project?.nameAr || data.project?.name}</p>
                  <p className="text-xs text-muted-foreground">{data.project?.code}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">الجهاز</p>
                  <p className="font-medium">{data.device?.name}</p>
                  <p className="text-xs font-mono">{data.device?.serialNumber}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">وقت القياس</p>
                  <p className="font-medium tabular-nums">
                    {new Date(data.reading.measuredAt).toLocaleString('ar-SA', {
                      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">القيمة</p>
                  <p className="font-bold tabular-nums text-lg">
                    {fmt(data.reading.value)} <span className="text-xs font-normal">{data.reading.unit}</span>
                  </p>
                </div>
              </div>
              <Separator className="my-3" />
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-muted-foreground">الحالة:</span>
                <StatusBadge status={data.reading.qualityStatus} />
                <StatusBadge status={data.reading.validationStatus} />
                <span className="text-xs text-muted-foreground ml-auto">
                  Hash: <code className="font-mono">{data.reading.canonicalPayloadHash?.slice(0, 16)}...</code>
                </span>
              </div>
            </Card>

            {data.audit.suspectReason && (
              <div className={`p-4 rounded-xl border-2 ${
                data.audit.suspectSeverity === 'critical'
                  ? 'bg-red-50 dark:bg-red-950/30 border-red-300'
                  : data.audit.suspectSeverity === 'high'
                    ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300'
                    : 'bg-blue-50 dark:bg-blue-950/30 border-blue-300'
              }`}>
                <div className="flex items-start gap-3">
                  {(() => {
                    const sev = data.audit.suspectSeverity || 'medium'
                    const config = SEVERITY_CONFIG[sev as keyof typeof SEVERITY_CONFIG] || SEVERITY_CONFIG.medium
                    const Icon = config.icon
                    return (
                      <div className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ${config.bg}`}>
                        <Icon className={`h-5 w-5 ${config.color}`} />
                      </div>
                    )
                  })()}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold text-sm">سبب الاشتباه/الرفض</h4>
                      <Badge variant="outline" className={`text-xs ${
                        data.audit.suspectSeverity === 'critical'
                          ? 'border-red-300 text-red-700'
                          : data.audit.suspectSeverity === 'high'
                            ? 'border-amber-300 text-amber-700'
                            : 'border-blue-300 text-blue-700'
                      }`}>
                        {SEVERITY_CONFIG[data.audit.suspectSeverity as keyof typeof SEVERITY_CONFIG]?.label || data.audit.suspectSeverity}
                      </Badge>
                      {data.audit.generated && (
                        <Badge variant="outline" className="text-xs bg-yellow-50 dark:bg-yellow-950/30">
                          مُولّد تلقائيًا
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm leading-relaxed">{data.audit.suspectReason}</p>
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <code className="font-mono bg-muted px-1.5 py-0.5 rounded">{data.audit.suspectRuleCode}</code>
                    </div>
                    {data.audit.suspectDetails && (
                      <div className="mt-2 p-2 rounded-lg bg-muted/40 text-xs">
                        <p className="font-semibold mb-1">تفاصيل إضافية:</p>
                        <pre className="font-mono whitespace-pre-wrap text-[11px]">
                          {typeof data.audit.suspectDetails === 'string'
                            ? JSON.stringify(JSON.parse(data.audit.suspectDetails), null, 2)
                            : JSON.stringify(data.audit.suspectDetails, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {data.audit.auditedAt && (
              <Card className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <h4 className="font-semibold text-sm">تم التدقيق مسبقًا</h4>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">الإجراء المتّخذ</p>
                    <Badge variant="outline" className="mt-1">{data.audit.auditAction}</Badge>
                  </div>
                  <div>
                    <p className="text-muted-foreground">بواسطة</p>
                    <p className="font-medium">{data.audit.auditedBy}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">في تاريخ</p>
                    <p className="font-medium tabular-nums">
                      {new Date(data.audit.auditedAt).toLocaleString('ar-SA')}
                    </p>
                  </div>
                  {data.audit.auditNote && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground">ملاحظات</p>
                      <p className="font-medium">{data.audit.auditNote}</p>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {data.statistics && (
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <h4 className="font-semibold text-sm">تحليل إحصائي (آخر 24 ساعة)</h4>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div className="p-2 rounded-lg bg-muted/40">
                    <p className="text-muted-foreground">المتوسط</p>
                    <p className="font-bold tabular-nums">{fmt(data.statistics.average)}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/40">
                    <p className="text-muted-foreground">الحد الأقصى</p>
                    <p className="font-bold tabular-nums">{fmt(data.statistics.max)}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/40">
                    <p className="text-muted-foreground">الحد الأدنى</p>
                    <p className="font-bold tabular-nums">{fmt(data.statistics.min)}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/40">
                    <p className="text-muted-foreground">الانحراف المعياري</p>
                    <p className="font-bold tabular-nums">{fmt(data.statistics.stdDev)}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/40">
                    <p className="text-muted-foreground">حجم العينة</p>
                    <p className="font-bold tabular-nums">{data.statistics.sampleSize}</p>
                  </div>
                  <div className={`p-2 rounded-lg ${
                    data.statistics.deviation > 0 ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-blue-50 dark:bg-blue-950/30'
                  }`}>
                    <p className="text-muted-foreground">الانحراف عن المتوسط</p>
                    <p className={`font-bold tabular-nums ${data.statistics.deviation > 0 ? 'text-amber-600' : 'text-blue-600'}`}>
                      {data.statistics.deviation > 0 ? '+' : ''}{data.statistics.deviation}%
                    </p>
                  </div>
                  <div className={`p-2 rounded-lg col-span-2 ${
                    data.statistics.isOutlier ? 'bg-red-50 dark:bg-red-950/30' : 'bg-emerald-50 dark:bg-emerald-950/30'
                  }`}>
                    <p className="text-muted-foreground">حالة القيمة المتطرفة</p>
                    <p className={`font-bold ${data.statistics.isOutlier ? 'text-red-600' : 'text-emerald-600'}`}>
                      {data.statistics.isOutlier ? '⚠️ قيمة متطرفة (Outlier)' : '✓ ضمن النطاق الطبيعي'}
                    </p>
                  </div>
                </div>

                {data.contextReadings && data.contextReadings.length > 0 && (
                  <div className="mt-4">
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={data.contextReadings.map((r) => ({
                        time: new Date(r.measuredAt).toLocaleString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
                        value: r.value,
                        quality: r.qualityStatus,
                      }))}>
                        <defs>
                          <linearGradient id="valueGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#16a34a" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="time" tick={{ fontSize: 9 }} interval={4} />
                        <YAxis tick={{ fontSize: 9 }} />
                        <Tooltip
                          contentStyle={{ fontSize: 11, borderRadius: 6 }}
                          formatter={(v: number) => [fmt(v), 'القيمة']}
                        />
                        <Area type="monotone" dataKey="value" stroke="#16a34a" strokeWidth={2} fill="url(#valueGrad)" />
                        <ReferenceLine y={data.reading.value} stroke="#dc2626" strokeDasharray="5 5" label={{ value: 'الحالية', position: 'top', fill: '#dc2626', fontSize: 10 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>
            )}

            {!data.audit.auditedAt && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    <h4 className="font-semibold text-sm">إجراء التدقيق</h4>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <button
                      onClick={() => setAction('approve')}
                      className={`p-3 rounded-lg border-2 text-right transition-all ${
                        action === 'approve' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30' : 'border-border hover:border-emerald-300'
                      }`}
                    >
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 mb-1" />
                      <p className="text-xs font-semibold">اعتماد</p>
                      <p className="text-[10px] text-muted-foreground">القراءة صحيحة</p>
                    </button>
                    <button
                      onClick={() => setAction('correct')}
                      className={`p-3 rounded-lg border-2 text-right transition-all ${
                        action === 'correct' ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' : 'border-border hover:border-blue-300'
                      }`}
                    >
                      <Edit3 className="h-4 w-4 text-blue-600 mb-1" />
                      <p className="text-xs font-semibold">تصحيح</p>
                      <p className="text-[10px] text-muted-foreground">تعديل القيمة</p>
                    </button>
                    <button
                      onClick={() => setAction('reject')}
                      className={`p-3 rounded-lg border-2 text-right transition-all ${
                        action === 'reject' ? 'border-red-500 bg-red-50 dark:bg-red-950/30' : 'border-border hover:border-red-300'
                      }`}
                    >
                      <XCircle className="h-4 w-4 text-red-600 mb-1" />
                      <p className="text-xs font-semibold">رفض</p>
                      <p className="text-[10px] text-muted-foreground">القراءة خاطئة</p>
                    </button>
                    <button
                      onClick={() => setAction('escalate')}
                      className={`p-3 rounded-lg border-2 text-right transition-all ${
                        action === 'escalate' ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30' : 'border-border hover:border-amber-300'
                      }`}
                    >
                      <ShieldAlert className="h-4 w-4 text-amber-600 mb-1" />
                      <p className="text-xs font-semibold">إحالة</p>
                      <p className="text-[10px] text-muted-foreground">للتدقيق المتقدم</p>
                    </button>
                  </div>

                  {action === 'correct' && (
                    <div className="space-y-1.5">
                      <Label htmlFor="correctedValue" className="text-xs">القيمة المصحّحة</Label>
                      <Input
                        id="correctedValue"
                        type="number"
                        step="any"
                        value={correctedValue}
                        onChange={(e) => setCorrectedValue(e.target.value)}
                        dir="ltr"
                        className="font-mono"
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="note" className="text-xs">ملاحظات المراجع</Label>
                    <Textarea
                      id="note"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="اشرح سبب القرار وأي تفاصيل ذات صلة..."
                      rows={3}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            إغلاق
          </Button>
          {data && !data.audit.auditedAt && (
            <Button onClick={handleSubmit} disabled={submitting} className="bg-primary">
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 ml-1 animate-spin" />
                  جاري الإرسال...
                </>
              ) : (
                <>
                  <ArrowUpCircle className="h-4 w-4 ml-1" />
                  تأكيد الإجراء
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

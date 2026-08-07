'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  ShieldCheck, Satellite, Hash, ExternalLink, Loader2, CheckCircle2,
  XCircle, AlertTriangle, Clock, Copy, Check,
} from 'lucide-react'

// تصنيف مصدر كل رقم — نفس التصنيف الصادر من impact-attestation.ts (DataSourceClass)
const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  measured: { label: 'مقاس فعليًا', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' },
  estimated: { label: 'تقديري', color: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' },
  reference_db: { label: 'مرجع معتمد بقاعدة البيانات', color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' },
  reference_fallback: { label: 'قيمة احتياطية (fallback)', color: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400' },
}

const ELIGIBILITY_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  eligible: { label: 'مؤهلة', icon: CheckCircle2, color: 'text-emerald-600' },
  ineligible: { label: 'غير مؤهلة', icon: XCircle, color: 'text-red-600' },
  needs_review: { label: 'تحتاج مراجعة', icon: AlertTriangle, color: 'text-amber-600' },
}

const BATCH_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'قيد الإرسال إلى Hedera', color: 'bg-slate-100 text-slate-700' },
  submitted: { label: 'أُرسل، بانتظار الإجماع', color: 'bg-blue-100 text-blue-700' },
  confirmed: { label: 'مؤكَّد على Hedera', color: 'bg-emerald-100 text-emerald-700' },
  mismatch: { label: 'تعارض في الهاش', color: 'bg-red-100 text-red-700' },
  failed: { label: 'فشل الإرسال', color: 'bg-red-100 text-red-700' },
  superseded: { label: 'استُبدل بدفعة أحدث', color: 'bg-slate-100 text-slate-500' },
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="text-muted-foreground hover:text-foreground shrink-0"
      onClick={() => {
        navigator.clipboard?.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      title="نسخ"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

export function CarbonAttestationDialog({
  batchId,
  open,
  onOpenChange,
}: {
  batchId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !batchId) return
    setLoading(true)
    setData(null)
    fetch(`/api/attestations/batch/${batchId}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then(setData)
      .catch(() => setData({ error: true }))
      .finally(() => setLoading(false))
  }, [open, batchId])

  const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0 flex flex-col">
        <DialogHeader className="p-5 pb-3 shrink-0">
          <DialogTitle className="flex items-center gap-2 font-cairo">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            شهادة إثبات الكربون
          </DialogTitle>
          <DialogDescription className="text-xs">
            سجل كامل قابل للتحقق المستقل: من رُصد التغيّر البيئي فضائيًا إلى توثيق الهاش على Hedera
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-5 pb-5">
          {loading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin ml-2" /> جارِ التحميل...
            </div>
          )}

          {!loading && data?.error && (
            <div className="text-center py-12 text-sm text-red-600">تعذّر تحميل ملف الإثبات</div>
          )}

          {!loading && data && !data.error && (
            <div className="space-y-5">
              {/* Header summary */}
              <div className="p-3 rounded-lg bg-muted/30 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold">{data.project?.nameAr || data.project?.name}</p>
                  <Badge className={BATCH_STATUS_LABELS[data.status]?.color || ''}>
                    {BATCH_STATUS_LABELS[data.status]?.label || data.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  الفترة: {new Date(data.periodStart).toLocaleDateString('ar')} — {new Date(data.periodEnd).toLocaleDateString('ar')}
                </p>
                <p className="text-lg font-bold tabular-nums text-emerald-600">
                  {fmt(data.kgCO2eClaimed)} <span className="text-xs font-normal">kgCO₂e</span>
                </p>
              </div>

              {/* 1. Ground vs Space eligibility gate */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Satellite className="h-4 w-4 text-blue-600" />
                  <h4 className="text-sm font-bold">1. بوابة المراقبة الأرضية-الفضائية</h4>
                </div>
                <div className="p-3 rounded-lg border space-y-2">
                  <div className="flex items-center gap-2">
                    {(() => {
                      const el = ELIGIBILITY_LABELS[data.eligibility?.status] || ELIGIBILITY_LABELS.needs_review
                      const Icon = el.icon
                      return (
                        <>
                          <Icon className={`h-4 w-4 ${el.color}`} />
                          <span className={`text-sm font-bold ${el.color}`}>{el.label}</span>
                        </>
                      )
                    })()}
                    {data.eligibility?.normalPct != null && (
                      <span className="text-xs text-muted-foreground">
                        ({data.eligibility.normalPct}% من القراءات ضمن النطاق الطبيعي)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    استندت هذه الشهادة إلى {data.eligibility?.comparedReadingCount ?? 0} مقارنة أرضية-فضائية
                  </p>
                  {data.eligibility?.distribution && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {Object.entries(data.eligibility.distribution).map(([k, v]: [string, any]) =>
                        v > 0 ? (
                          <Badge key={k} variant="outline" className="text-[10px]">
                            {k}: {v}
                          </Badge>
                        ) : null,
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* 2. Calculation inputs */}
              {data.payload && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    <h4 className="text-sm font-bold">2. المدخلات الداخلة في الحساب</h4>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2 font-mono bg-muted/30 p-2 rounded">
                    {data.payload.formula}
                  </p>
                  <div className="space-y-1.5">
                    {data.payload.inputs?.map((inp: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between text-xs p-2 rounded bg-muted/20">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{inp.label}</p>
                          <p className="text-muted-foreground truncate">{inp.sourceDetail}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 pr-2">
                          <span className="tabular-nums font-bold">{fmt(inp.value)} {inp.unit}</span>
                          <Badge className={`text-[10px] ${SOURCE_LABELS[inp.sourceClass]?.color || ''}`}>
                            {SOURCE_LABELS[inp.sourceClass]?.label || inp.sourceClass}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    مبني على {data.payload.readingRefs?.length ?? data.itemCount} قراءة أرضية فردية (السجل الكامل مخزَّن ضمن payload الشهادة)
                  </p>
                </div>
              )}

              <Separator />

              {/* 3. Hash & Hedera */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Hash className="h-4 w-4 text-violet-600" />
                  <h4 className="text-sm font-bold">3. بصمة الإثبات (Hash) والتوثيق</h4>
                </div>
                <div className="p-3 rounded-lg border space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground shrink-0">SHA-256:</span>
                    <code className="text-[10px] font-mono truncate flex-1 text-left" dir="ltr">{data.batchHash}</code>
                    <CopyButton text={data.batchHash} />
                  </div>

                  {data.hashIntegrityOk != null && (
                    <div className="flex items-center gap-1.5 text-xs">
                      {data.hashIntegrityOk ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-emerald-600">الهاش مُعاد حسابه من البيانات المخزَّنة ومطابق — لا تلاعب</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3.5 w-3.5 text-red-600" />
                          <span className="text-red-600">تحذير: الهاش المُعاد حسابه لا يطابق batchHash المخزَّن</span>
                        </>
                      )}
                    </div>
                  )}

                  {data.hedera?.transactionId ? (
                    <div className="flex items-center justify-between pt-1">
                      <div className="text-xs">
                        <p className="text-muted-foreground">رقم معاملة Hedera</p>
                        <code className="font-mono text-[10px]" dir="ltr">{data.hedera.transactionId}</code>
                      </div>
                      <a
                        href={data.hedera.mirrorNodeUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-600 flex items-center gap-1 hover:underline"
                      >
                        تحقق على HashScan <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
                      <Clock className="h-3.5 w-3.5" />
                      لم يُؤكَّد على Hedera بعد — بانتظار استلام رقم المعاملة والطابع الزمني
                    </div>
                  )}
                </div>
              </div>

              {/* 4. Impact units promoted from this batch */}
              {data.impactUnits?.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold mb-2">4. وحدات الأثر الصادرة عن هذه الشهادة</h4>
                  <div className="space-y-1.5">
                    {data.impactUnits.map((u: any) => (
                      <div key={u.id} className="flex items-center justify-between text-xs p-2 rounded bg-emerald-50 dark:bg-emerald-950/20">
                        <span>{fmt(u.amount)} kgCO₂e</span>
                        <Badge variant="outline" className="text-[10px]">{u.status}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

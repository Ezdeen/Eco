'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ShieldCheck, Hash, Satellite } from 'lucide-react'
import { CarbonAttestationDialog } from './carbon-attestation-dialog'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'قيد الإرسال', color: 'bg-slate-100 text-slate-700' },
  submitted: { label: 'بانتظار الإجماع', color: 'bg-blue-100 text-blue-700' },
  confirmed: { label: 'مؤكَّد على Hedera', color: 'bg-emerald-100 text-emerald-700' },
  mismatch: { label: 'تعارض بالهاش', color: 'bg-red-100 text-red-700' },
  failed: { label: 'فشل', color: 'bg-red-100 text-red-700' },
  superseded: { label: 'استُبدل', color: 'bg-slate-100 text-slate-500' },
}

// يعرض سجل كل ملفات إثبات الكربون (AttestationBatch) الصادرة عبر المنظومة الجديدة:
// المراقبة الفضائية-الأرضية → التحقق الكمي → الهاش والتوثيق على Hedera.
export function AttestationBatchesList() {
  const [batches, setBatches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [openBatchId, setOpenBatchId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    fetch('/api/attestations/batch')
      .then((r) => (r.ok ? r.json() : { batches: [] }))
      .then((d) => setBatches(d.batches || []))
      .catch(() => setBatches([]))
      .finally(() => setLoading(false))
  }, [])

  const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          ملفات إثبات الكربون
        </CardTitle>
        <CardDescription className="text-xs">
          كل ملف يجمّد بيانات فترة/مشروع بعد التحقق من توافق القراءات الأرضية مع البيانات الفضائية، ويوثّق هاشها على Hedera
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-6">جارِ التحميل...</p>
        ) : batches.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            لا توجد ملفات إثبات صادرة بعد — استخدم زر "فحص أهلية إثبات الكربون" في جدول المشاريع أعلاه
          </p>
        ) : (
          <div className="space-y-2">
            {batches.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => { setOpenBatchId(b.id); setDialogOpen(true) }}
                className="w-full text-right flex items-center justify-between gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{b.project?.nameAr || b.project?.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Hash className="h-3 w-3 text-muted-foreground shrink-0" />
                    <code className="text-[10px] font-mono text-muted-foreground truncate" dir="ltr">
                      {b.batchHash?.slice(0, 16)}...
                    </code>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {b.eligibilityStatus === 'eligible' && (
                    <span title="اجتازت بوابة المراقبة الفضائية">
                      <Satellite className="h-3.5 w-3.5 text-blue-600" />
                    </span>
                  )}
                  <span className="text-sm font-bold tabular-nums">{fmt(b.kgCO2eClaimed)} kgCO₂e</span>
                  <Badge className={`text-[10px] ${STATUS_LABELS[b.status]?.color || ''}`}>
                    {STATUS_LABELS[b.status]?.label || b.status}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>

      <CarbonAttestationDialog batchId={openBatchId} open={dialogOpen} onOpenChange={setDialogOpen} />
    </Card>
  )
}

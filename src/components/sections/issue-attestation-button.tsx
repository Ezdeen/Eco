'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ShieldCheck, Loader2, Satellite, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import { CarbonAttestationDialog } from './carbon-attestation-dialog'

// زر "إصدار ملف إثبات الكربون" لمشروع معيّن، لفترة السنة الحالية حتى الآن (يمكن
// تعميمه لاحقًا باختيار فترة مخصصة). يفحص الأهلية أولاً (بوابة المراقبة الأرضية-الفضائية)
// قبل عرض خيار الإصدار الفعلي — لا يُصدر شيء دون اجتياز الفحص.
export function IssueAttestationButton({ projectId }: { projectId: string }) {
  const [checking, setChecking] = useState(false)
  const [eligibility, setEligibility] = useState<any>(null)
  const [issuing, setIssuing] = useState(false)
  const [issuedBatchId, setIssuedBatchId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const now = new Date()
  const periodStart = new Date(now.getFullYear(), 0, 1).toISOString()
  const periodEnd = now.toISOString()

  const checkEligibility = () => {
    setChecking(true)
    setError(null)
    fetch(`/api/attestations/eligibility?projectId=${projectId}&periodStart=${periodStart}&periodEnd=${periodEnd}`)
      .then((r) => r.json())
      .then((d) => setEligibility(d.eligibility || null))
      .catch(() => setError('تعذّر فحص الأهلية'))
      .finally(() => setChecking(false))
  }

  const issue = () => {
    setIssuing(true)
    setError(null)
    fetch('/api/attestations/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, periodStart, periodEnd }),
    })
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'فشل الإصدار')
        setIssuedBatchId(d.batch.id)
        setDialogOpen(true)
      })
      .catch((e) => setError(e.message))
      .finally(() => setIssuing(false))
  }

  if (!eligibility && !checking) {
    return (
      <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" onClick={checkEligibility}>
        <ShieldCheck className="h-3.5 w-3.5" />
        فحص أهلية إثبات الكربون
      </Button>
    )
  }

  if (checking) {
    return (
      <Button size="sm" variant="outline" disabled className="gap-1.5 text-xs h-7">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> جارِ الفحص...
      </Button>
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        {eligibility?.status === 'eligible' && (
          <Badge className="bg-emerald-100 text-emerald-700 gap-1 text-[10px]">
            <CheckCircle2 className="h-3 w-3" /> مؤهلة ({eligibility.normalPct}%)
          </Badge>
        )}
        {eligibility?.status === 'ineligible' && (
          <Badge className="bg-red-100 text-red-700 gap-1 text-[10px]">
            <XCircle className="h-3 w-3" /> غير مؤهلة
          </Badge>
        )}
        {eligibility?.status === 'needs_review' && (
          <Badge className="bg-amber-100 text-amber-700 gap-1 text-[10px]">
            <AlertTriangle className="h-3 w-3" /> تحتاج مراجعة
          </Badge>
        )}
        {eligibility?.status === 'eligible' ? (
          <Button size="sm" className="gap-1.5 text-xs h-7 bg-emerald-600 hover:bg-emerald-700" onClick={issue} disabled={issuing}>
            {issuing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Satellite className="h-3.5 w-3.5" />}
            إصدار ملف الإثبات
          </Button>
        ) : (
          <Button size="sm" variant="ghost" className="text-[10px] h-7" onClick={checkEligibility}>
            إعادة الفحص
          </Button>
        )}
      </div>
      {eligibility?.reason && (
        <p className="text-[10px] text-muted-foreground max-w-sm">{eligibility.reason}</p>
      )}
      {error && <p className="text-[10px] text-red-600">{error}</p>}

      <CarbonAttestationDialog batchId={issuedBatchId} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}

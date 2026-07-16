'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/platform/status-badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { ShieldCheck, Link2, FileCheck, Hash, Network, CheckCircle2, AlertTriangle, Loader2, Clock, RefreshCw, FileText, Database } from 'lucide-react'
import { toast } from 'sonner'

export function AttestationsSection() {
  const [attestations, setAttestations] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [projects, setProjects] = useState<any[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchData = () => {
    setLoading(true)
    fetch('/api/attestations')
      .then((r) => r.json())
      .then((d) => {
        setAttestations(d.attestations || [])
        setStats(d.stats)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchData()
    fetch('/api/projects').then((r) => r.json()).then((d) => setProjects(d.projects || []))
  }, [])

  const submitAttestation = async () => {
    if (!selectedProject) {
      toast.error('اختر مشروعًا')
      return
    }
    setSubmitting(true)
    try {
      // Fetch recent readings for the project
      const readingsRes = await fetch(`/api/readings?projectId=${selectedProject}&limit=50&days=7`)
      const readingsData = await readingsRes.json()
      const readings = readingsData.readings || []

      if (readings.length === 0) {
        toast.error('لا توجد قراءات لتوثيقها في آخر 7 أيام')
        setSubmitting(false)
        return
      }

      const res = await fetch('/api/attestations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject,
          readings,
          methodologyVersion: 'ghg_protocol_scope2_v1.2',
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`تم توثيق ${readings.length} قراءة على Hedera`)
        fetchData()
      } else {
        toast.error('فشل التوثيق')
      }
    } catch (e) {
      toast.error('خطأ في الاتصال')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <Card className="h-96 animate-pulse bg-muted/40" />
  }

  return (
    <div className="space-y-4">
      {/* Stats - Comprehensive */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Card className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200">
          <div className="flex items-center gap-1 text-xs text-emerald-700 mb-0.5"><CheckCircle2 className="h-3 w-3" /> حزم موثقة</div>
          <p className="text-xl font-bold tabular-nums text-emerald-600">{stats?.attestedBatches || 0}</p>
        </Card>
        <Card className="p-3 bg-amber-50 dark:bg-amber-950/30 border-amber-200">
          <div className="flex items-center gap-1 text-xs text-amber-700 mb-0.5"><AlertTriangle className="h-3 w-3" /> حزم غير موثقة</div>
          <p className="text-xl font-bold tabular-nums text-amber-600">{stats?.unattestedBatches || 0}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5"><Network className="h-3 w-3" /> حالة Hedera</div>
          <p className="text-sm font-bold text-emerald-600">{stats?.hederaStatus === 'connected' ? '🟢 متصل' : '🔴 غير متصل'}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5"><Clock className="h-3 w-3" /> آخر توثيق</div>
          <p className="text-xs font-medium">
            {stats?.lastAttestation?.confirmedAt
              ? new Date(stats.lastAttestation.confirmedAt).toLocaleString('ar-SA', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
              : '—'}
          </p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5"><Link2 className="h-3 w-3" /> آخر Consensus</div>
          <p className="text-[10px] font-mono truncate">{stats?.lastConsensusTimestamp || '—'}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5"><RefreshCw className="h-3 w-3" /> إعادة المحاولة</div>
          <p className="text-xl font-bold tabular-nums">{stats?.retryCount || 0}</p>
        </Card>
        <Card className="p-3 bg-red-50 dark:bg-red-950/30 border-red-200">
          <div className="flex items-center gap-1 text-xs text-red-700 mb-0.5"><AlertTriangle className="h-3 w-3" /> عدم تطابق</div>
          <p className="text-xl font-bold tabular-nums text-red-600">{stats?.mismatchCount || 0}</p>
        </Card>
        <Card className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200">
          <div className="flex items-center gap-1 text-xs text-emerald-700 mb-0.5"><CheckCircle2 className="h-3 w-3" /> تقارير معتمدة</div>
          <p className="text-xl font-bold tabular-nums text-emerald-600">{stats?.approvedReports || 0}</p>
        </Card>
        <Card className="p-3 bg-amber-50 dark:bg-amber-950/30 border-amber-200">
          <div className="flex items-center gap-1 text-xs text-amber-700 mb-0.5"><Clock className="h-3 w-3" /> قيد المراجعة</div>
          <p className="text-xl font-bold tabular-nums text-amber-600">{stats?.underReviewReports || 0}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5"><FileText className="h-3 w-3" /> إصدار المنهجية</div>
          <p className="text-xs font-mono">{stats?.latestMethodology || '—'}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5"><Database className="h-3 w-3" /> معامل الانبعاث</div>
          <p className="text-xs font-mono">{stats?.latestEmissionFactor || '—'}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5"><Database className="h-3 w-3" /> قراءات غير موثقة</div>
          <p className="text-xl font-bold tabular-nums">{stats?.unattestedReadings?.toLocaleString() || 0}</p>
        </Card>
      </div>

      {/* Submit new attestation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Network className="h-5 w-5" />
            توثيق جديد على Hedera
          </CardTitle>
          <CardDescription className="text-xs">
            إنشاء Canonical Payload وحساب SHA-256 و Merkle Root ثم إرسال إلى شبكة Hedera. لا تُرسل PII أو أسرار إلى السجل العام.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">المشروع</Label>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر مشروعًا" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nameAr || p.name} ({p.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">الفترة</Label>
              <Select defaultValue="7d">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1d">آخر 24 ساعة</SelectItem>
                  <SelectItem value="7d">آخر 7 أيام</SelectItem>
                  <SelectItem value="30d">آخر 30 يومًا</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={submitAttestation} disabled={submitting || !selectedProject} className="w-full">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 ml-1 animate-spin" />
                    جاري التوثيق...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4 ml-1" />
                    توثيق على Hedera
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Attestation batches */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            دفعات التوثيق
          </CardTitle>
          <CardDescription className="text-xs">
            تطابق Hash دليل على عدم تغيّر الحزمة بعد التوثيق، وليس دليلاً منفردًا على صحة القراءة الفيزيائية الأصلية
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {attestations.map((a) => (
            <div key={a.id} className="p-4 rounded-xl border bg-card hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900 text-emerald-600 shrink-0">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">
                      {a.project?.nameAr || a.project?.name}
                      <span className="text-muted-foreground font-normal mr-2">({a.project?.code})</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {a.itemCount.toLocaleString()} عنصر موثّق
                    </p>
                  </div>
                </div>
                <StatusBadge status={a.status} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs mb-3">
                <div className="flex items-center gap-1.5 p-2 rounded-lg bg-muted/40 min-w-0">
                  <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-muted-foreground">Batch Hash (SHA-256)</p>
                    <p className="font-mono text-[10px] truncate">{a.batchHash}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 p-2 rounded-lg bg-muted/40 min-w-0">
                  <Network className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-muted-foreground">Hedera Transaction ID</p>
                    <p className="font-mono text-[10px] truncate">{a.hederaTransactionId}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 p-2 rounded-lg bg-muted/40 min-w-0">
                  <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-muted-foreground">Merkle Root</p>
                    <p className="font-mono text-[10px] truncate">{a.merkleRoot}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 p-2 rounded-lg bg-muted/40 min-w-0">
                  <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-muted-foreground">Consensus Timestamp</p>
                    <p className="font-mono text-[10px] truncate">{a.consensusTimestamp}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
                <span>أُرسل: {a.submittedAt ? new Date(a.submittedAt).toLocaleString('ar-SA') : '—'}</span>
                <span>أُكِّد: {a.confirmedAt ? new Date(a.confirmedAt).toLocaleString('ar-SA') : '—'}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Disclaimer */}
      <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-2 text-sm">
            <AlertTriangle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-blue-900 dark:text-blue-300 mb-1">إخلاء مسؤولية</p>
              <p className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed">
                توثيق Hedera يثبت عدم تغيّر الحزمة بعد وقت التوثيق، وليس اعتمادًا تجاريًا قابلاً للتداول.
                وحدات الأثر الداخلية في المنصة ليست اعتمادات كربونية تجارية افتراضيًا. التداول والاعتماد
                التجاري مؤجلان حتى استيفاء المتطلبات القانونية والمنهجية.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

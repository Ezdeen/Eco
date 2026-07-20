'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { StatusBadge } from '@/components/platform/status-badge'
import { ShieldCheck, Network, AlertTriangle, Loader2, Hash, RefreshCw } from 'lucide-react'

interface AttestedReading {
  readingId: string
  projectId: string
  projectName: string
  projectCode: string
  sequence: number
  measuredAt: string
  hash: string | null
  n8nHash: string | null
  hashMatchStatus: string | null
  hederaTransactionId: string | null
  hederaConsensusAt: string | null
}

export function AttestationsSection() {
  const [readings, setReadings] = useState<AttestedReading[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('all')
  const [loading, setLoading] = useState(true)

  const fetchData = (projectId?: string) => {
    setLoading(true)
    const qs = projectId && projectId !== 'all' ? `?projectId=${projectId}` : ''
    fetch(`/api/attestations/readings${qs}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then((d) => setReadings(d?.readings || []))
      .catch(() => setReadings([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchData()
    fetch('/api/projects')
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then((d) => setProjects(d?.projects || []))
      .catch(() => setProjects([]))
  }, [])

  const handleProjectChange = (value: string) => {
    setSelectedProject(value)
    fetchData(value)
  }

  const matchedCount = readings.filter((r) => r.hashMatchStatus === 'match').length
  const mismatchCount = readings.filter((r) => r.hashMatchStatus === 'mismatch').length

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200">
          <div className="flex items-center gap-1 text-xs text-emerald-700 mb-0.5">
            <ShieldCheck className="h-3 w-3" /> قراءات موثّقة
          </div>
          <p className="text-xl font-bold tabular-nums text-emerald-600">{readings.length}</p>
        </Card>
        <Card className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200">
          <div className="flex items-center gap-1 text-xs text-emerald-700 mb-0.5">
            <Hash className="h-3 w-3" /> مطابقة الهاش
          </div>
          <p className="text-xl font-bold tabular-nums text-emerald-600">{matchedCount}</p>
        </Card>
        <Card className="p-3 bg-red-50 dark:bg-red-950/30 border-red-200">
          <div className="flex items-center gap-1 text-xs text-red-700 mb-0.5">
            <AlertTriangle className="h-3 w-3" /> عدم تطابق
          </div>
          <p className="text-xl font-bold tabular-nums text-red-600">{mismatchCount}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
            <Network className="h-3 w-3" /> مصدر التوثيق
          </div>
          <p className="text-xs font-medium">n8n + Blind Signer</p>
        </Card>
      </div>

      {/* Filter + refresh */}
      <Card>
        <CardContent className="p-4 flex items-end gap-3">
          <div className="space-y-1.5 flex-1 max-w-xs">
            <Label className="text-xs">تصفية حسب المشروع</Label>
            <Select value={selectedProject} onValueChange={handleProjectChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المشاريع</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nameAr || p.name} ({p.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <button
            onClick={() => fetchData(selectedProject)}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg border transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> تحديث
          </button>
        </CardContent>
      </Card>

      {/* Attested readings table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            القراءات الموثّقة
          </CardTitle>
          <CardDescription className="text-xs">
            كل قراءة تُحسب لها هاش SHA-256 مستقل، يُوثَّق مباشرة على Hedera عبر خدمة توقيع
            معزولة عن قاعدة بيانات المنصة (Blind Signer)، ثم تُقارَن المنصة بينه وبين ما
            استقبلته ليتأكد من عدم التلاعب أثناء النقل
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : readings.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
              لا توجد قراءات موثّقة بعد
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-right py-2 px-2 font-medium">المشروع</th>
                    <th className="text-right py-2 px-2 font-medium">الترتيب</th>
                    <th className="text-right py-2 px-2 font-medium">الوقت</th>
                    <th className="text-right py-2 px-2 font-medium">الهاش</th>
                    <th className="text-right py-2 px-2 font-medium">رقم المعاملة (Hedera)</th>
                    <th className="text-right py-2 px-2 font-medium">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {readings.map((r) => (
                    <tr key={r.readingId} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-2">
                        <span className="font-medium">{r.projectName}</span>
                        <span className="text-muted-foreground mr-1">({r.projectCode})</span>
                      </td>
                      <td className="py-2 px-2 tabular-nums">{r.sequence}</td>
                      <td className="py-2 px-2 whitespace-nowrap">
                        {new Date(r.measuredAt).toLocaleString('ar-SA', {
                          year: 'numeric', month: '2-digit', day: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className="py-2 px-2">
                        <span className="font-mono text-[10px]" title={r.hash || ''}>
                          {r.hash ? `${r.hash.slice(0, 10)}…${r.hash.slice(-6)}` : '—'}
                        </span>
                      </td>
                      <td className="py-2 px-2">
                        <span className="font-mono text-[10px]" title={r.hederaTransactionId || ''}>
                          {r.hederaTransactionId || '—'}
                        </span>
                      </td>
                      <td className="py-2 px-2">
                        <StatusBadge status={r.hashMatchStatus === 'match' ? 'validated' : 'suspect'} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
                تطابق الهاش يثبت عدم تغيّر البيانات بعد وقت التوثيق على Hedera، وليس دليلاً
                منفرداً على صحة القراءة الفيزيائية الأصلية من الإنفيرتر. وحدات الأثر الداخلية
                في المنصة ليست اعتمادات كربونية تجارية افتراضياً.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

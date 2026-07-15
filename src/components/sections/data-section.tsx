'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/platform/status-badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Database, Search, Download, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Filter } from 'lucide-react'

interface Reading {
  id: string
  metricType: string
  measuredAt: string
  receivedAt: string
  intervalStart: string
  intervalEnd?: string
  value: number
  unit: string
  cumulativeValue?: number
  qualityStatus: string
  validationStatus: string
  canonicalPayloadHash?: string
  project: { name: string; nameAr?: string; code: string }
  device?: { name: string; serialNumber: string }
  asset?: { name: string }
}

const METRIC_LABELS: Record<string, string> = {
  energy_export_kwh: 'طاقة مُصدَّرة',
  energy_import_kwh: 'طاقة مستوردة',
  power_kw: 'قدرة لحظية',
  irradiance_wm2: 'إشعاع شمسي',
  temperature_c: 'درجة الحرارة',
}

export function DataCenterSection() {
  const [readings, setReadings] = useState<Reading[]>([])
  const [quality, setQuality] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [projectId, setProjectId] = useState<string>('all')
  const [qualityFilter, setQualityFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [projects, setProjects] = useState<{ id: string; name: string; nameAr?: string; code: string }[]>([])

  const fetchData = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (projectId !== 'all') params.set('projectId', projectId)
    if (qualityFilter !== 'all') params.set('qualityStatus', qualityFilter)
    params.set('limit', '200')
    params.set('days', '7')

    fetch(`/api/readings?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setReadings(d.readings || [])
        setQuality(d.qualitySummary || null)
      })
      .finally(() => setLoading(false))
  }, [projectId, qualityFilter])

  useEffect(() => {
    let cancelled = false
    fetch('/api/projects')
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setProjects(d.projects || [])
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams()
    if (projectId !== 'all') params.set('projectId', projectId)
    if (qualityFilter !== 'all') params.set('qualityStatus', qualityFilter)
    params.set('limit', '200')
    params.set('days', '7')

    Promise.resolve().then(() => {
      if (!cancelled) setLoading(true)
    })

    fetch(`/api/readings?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        setReadings(d.readings || [])
        setQuality(d.qualitySummary || null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, qualityFilter])

  const filtered = readings.filter(
    (r) =>
      search === '' ||
      r.project.code.toLowerCase().includes(search.toLowerCase()) ||
      (r.device?.serialNumber || '').toLowerCase().includes(search.toLowerCase()) ||
      (r.canonicalPayloadHash || '').toLowerCase().includes(search.toLowerCase()),
  )

  if (loading) {
    return (
      <div className="space-y-4">
        <Card className="h-32 animate-pulse bg-muted/40" />
        <Card className="h-96 animate-pulse bg-muted/40" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Quality summary cards */}
      {quality && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">إجمالي القراءات</p>
            <p className="text-xl font-bold tabular-nums">{quality.total.toLocaleString()}</p>
          </Card>
          <Card className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200">
            <div className="flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="h-3 w-3" /> متحقّق</div>
            <p className="text-xl font-bold tabular-nums text-emerald-600">{quality.validated.toLocaleString()}</p>
          </Card>
          <Card className="p-3 bg-amber-50 dark:bg-amber-950/30 border-amber-200">
            <div className="flex items-center gap-1 text-xs text-amber-700"><AlertTriangle className="h-3 w-3" /> مشبوه</div>
            <p className="text-xl font-bold tabular-nums text-amber-600">{quality.suspect.toLocaleString()}</p>
          </Card>
          <Card className="p-3 bg-red-50 dark:bg-red-950/30 border-red-200">
            <div className="flex items-center gap-1 text-xs text-red-700"><XCircle className="h-3 w-3" /> مرفوض</div>
            <p className="text-xl font-bold tabular-nums text-red-600">{quality.rejected.toLocaleString()}</p>
          </Card>
          <Card className="p-3 bg-blue-50 dark:bg-blue-950/30 border-blue-200">
            <div className="flex items-center gap-1 text-xs text-blue-700"><RefreshCw className="h-3 w-3" /> مصحّح</div>
            <p className="text-xl font-bold tabular-nums text-blue-600">{quality.corrected.toLocaleString()}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">معتمد</p>
            <p className="text-xl font-bold tabular-nums">{quality.approved.toLocaleString()}</p>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث بالرمز أو الرقم التسلسلي أو الـ Hash..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-9"
              />
            </div>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="كل المشاريع" />
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
            <Select value={qualityFilter} onValueChange={setQualityFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="جودة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="validated">متحقّق</SelectItem>
                <SelectItem value="suspect">مشبوه</SelectItem>
                <SelectItem value="rejected">مرفوض</SelectItem>
                <SelectItem value="corrected">مصحّح</SelectItem>
                <SelectItem value="approved">معتمد</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={fetchData}>
              <RefreshCw className="h-4 w-4 ml-1" /> تحديث
            </Button>
            <Button variant="outline">
              <Download className="h-4 w-4 ml-1" /> تصدير
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Readings table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4" />
            القراءات الخام والمطبّعة
          </CardTitle>
          <CardDescription className="text-xs">
            عرض {filtered.length} من {readings.length} قراءة - لا تُعدّل السجل الخام، أنشئ Adjustment بدلاً من ذلك
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead>المشروع</TableHead>
                  <TableHead>الجهاز</TableHead>
                  <TableHead>المقياس</TableHead>
                  <TableHead>وقت القياس</TableHead>
                  <TableHead>القيمة</TableHead>
                  <TableHead>التراكمي</TableHead>
                  <TableHead>Hash</TableHead>
                  <TableHead>الجودة</TableHead>
                  <TableHead>التحقق</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id} className="hover:bg-muted/40">
                    <TableCell>
                      <p className="text-xs font-medium">{r.project.code}</p>
                      <p className="text-[10px] text-muted-foreground truncate max-w-[100px]">{r.project.nameAr}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs font-mono">{r.device?.serialNumber || '—'}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {METRIC_LABELS[r.metricType] || r.metricType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs tabular-nums">
                        {new Date(r.measuredAt).toLocaleString('ar-SA', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-semibold tabular-nums">{r.value.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">{r.unit}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {r.cumulativeValue?.toLocaleString() || '—'}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="text-[10px] font-mono text-muted-foreground truncate max-w-[80px]">
                        {r.canonicalPayloadHash?.slice(0, 12) || '—'}...
                      </p>
                    </TableCell>
                    <TableCell><StatusBadge status={r.qualityStatus} /></TableCell>
                    <TableCell><StatusBadge status={r.validationStatus} /></TableCell>
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

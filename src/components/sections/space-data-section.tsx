'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Satellite, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, Filter, X,
  CloudSun, Leaf, Wind, Thermometer, Loader2, CheckCircle2, AlertTriangle, XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

interface SpaceObservation {
  id: string
  projectId: string
  projectName: string
  projectType: string
  observedDate: string
  latitude: number
  longitude: number
  openMeteo: {
    observedAt: string
    fetchedAt: string
    ghiWm2: number | null
    temperatureC: number | null
    humidityPct: number | null
    windSpeedMs: number | null
    cloudCoverPct: number | null
    precipitationMm: number | null
  } | null
  cdse: {
    observedAt: string
    fetchedAt: string
    fetchRun: string | null
    dataset: string
    ndvi: number | null
    evi: number | null
    lstC: number | null
    no2ColumnMolM2: number | null
    aerosolIndex: number | null
    qualityFlag: string | null
  } | null
}

interface ProjectOption {
  id: string
  name: string
  nameAr?: string | null
}

interface SyncRun {
  id: string
  runLabel: string
  startedAt: string
  finishedAt: string | null
  status: string
  observationsCreated: number
  projectsOk: number
  projectsFailed: number
  errors: Array<{ projectId: string; projectName: string; source: string; error: string }>
}

const RUN_LABELS: Record<string, string> = {
  morning: 'صباحًا (10:55)',
  afternoon: 'ظهرًا (15:55)',
  evening: 'مساءً (17:50)',
  manual: 'يدوي',
}

export function SpaceDataSection() {
  const [rows, setRows] = useState<SpaceObservation[]>([])
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [lastRuns, setLastRuns] = useState<SyncRun[]>([])
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 25

  // Filters
  const [projectId, setProjectId] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Sort
  const [sortBy, setSortBy] = useState<'observedAt' | 'projectName'>('observedAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const fetchProjects = useCallback(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setProjects(d)
        else if (Array.isArray(d?.projects)) setProjects(d.projects)
      })
      .catch(() => {})
  }, [])

  const fetchData = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({
      sortBy, sortDir, page: String(page), pageSize: String(pageSize),
    })
    if (projectId !== 'all') params.set('projectId', projectId)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)

    fetch(`/api/space-data?${params.toString()}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then((d) => {
        setRows(d.data || [])
        setTotal(d.pagination?.total || 0)
        setLastRuns(d.lastRuns || [])
      })
      .catch(() => toast.error('تعذر تحميل البيانات الفضائية'))
      .finally(() => setLoading(false))
  }, [projectId, dateFrom, dateTo, sortBy, sortDir, page])

  useEffect(() => { fetchProjects() }, [fetchProjects])
  useEffect(() => { fetchData() }, [fetchData])

  const handleSort = (field: 'observedAt' | 'projectName') => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(field)
      setSortDir('desc')
    }
    setPage(1)
  }

  const renderSortIcon = (field: 'observedAt' | 'projectName') => {
    if (sortBy !== field) return <ArrowUpDown className="h-3 w-3 opacity-40" />
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
  }

  const handleManualSync = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/space-data/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runLabel: 'manual' }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error || 'فشل تشغيل المزامنة')
        return
      }
      const s = data.summary
      if (s.errorsCount > 0) {
        toast.warning(`تمت المزامنة جزئيًا: ${s.observationsCreated} قراءة جديدة، ${s.errorsCount} خطأ`)
      } else {
        toast.success(`تمت المزامنة: ${s.observationsCreated} قراءة جديدة عبر ${s.projectsOk} مشروع`)
      }
      fetchData()
    } catch {
      toast.error('حدث خطأ أثناء الاتصال بخادم المزامنة')
    } finally {
      setSyncing(false)
    }
  }

  const clearFilters = () => {
    setProjectId('all'); setDateFrom(''); setDateTo('')
    setPage(1)
  }

  const hasActiveFilters = projectId !== 'all' || dateFrom || dateTo

  const fmtNum = (v: number | null, digits = 1) => (v === null || v === undefined ? '—' : v.toFixed(digits))

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-5">
      {/* Header */}
      <Card className="bg-gradient-to-br from-sky-600 to-blue-700 text-white border-0">
        <CardContent className="p-5">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Satellite className="h-10 w-10" />
              <div>
                <h2 className="font-cairo text-2xl font-bold">البيانات الفضائية</h2>
                <p className="text-sm opacity-90">
                  بيانات الطقس والإشعاع الشمسي من Open-Meteo Solar API مع مؤشرات CDSE (Sentinel-2 / Sentinel-5P)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-left">
                <p className="text-xs opacity-80">إجمالي القراءات</p>
                <p className="font-cairo text-2xl font-bold tabular-nums">{total.toLocaleString('ar-SA')}</p>
              </div>
              <Button
                onClick={handleManualSync}
                disabled={syncing}
                variant="secondary"
                className="gap-2"
              >
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                سحب البيانات الآن
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Last sync runs */}
      {lastRuns.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {lastRuns.map((run) => {
            const hasErrors = run.errors && run.errors.length > 0
            const isExpanded = expandedRunId === run.id
            return (
              <Card
                key={run.id}
                className={`p-3 ${hasErrors ? 'cursor-pointer hover:border-amber-300' : ''}`}
                onClick={() => hasErrors && setExpandedRunId(isExpanded ? null : run.id)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium">{RUN_LABELS[run.runLabel] || run.runLabel}</span>
                  {run.status === 'success' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                  {run.status === 'partial' && <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
                  {run.status === 'failed' && <XCircle className="h-3.5 w-3.5 text-red-600" />}
                  {run.status === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(run.startedAt).toLocaleString('ar-SA')}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {run.observationsCreated} قراءة · {run.projectsOk} مشروع ناجح
                  {run.projectsFailed > 0 && ` · ${run.projectsFailed} فشل`}
                </p>
                {hasErrors && (
                  <p className="text-[10px] text-amber-700 mt-1 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> {run.errors.length} تنبيه — اضغط للتفاصيل
                  </p>
                )}
                {isExpanded && hasErrors && (
                  <div className="mt-2 pt-2 border-t space-y-1.5 max-h-48 overflow-y-auto">
                    {run.errors.map((err, i) => (
                      <div key={i} className="text-[10px] bg-amber-50 dark:bg-amber-950/30 rounded p-1.5">
                        <span className="font-medium">{err.source}</span>
                        {err.projectName && err.projectName !== '-' && (
                          <span className="text-muted-foreground"> · {err.projectName}</span>
                        )}
                        <p className="text-amber-800 dark:text-amber-300 mt-0.5">{err.error}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="h-4 w-4" /> الفلاتر
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">المشروع</label>
              <Select value={projectId} onValueChange={(v) => { setProjectId(v); setPage(1) }}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="كل المشاريع" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المشاريع</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nameAr || p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">من تاريخ</label>
              <Input type="date" className="h-9 text-xs" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1) }} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">إلى تاريخ</label>
              <Input type="date" className="h-9 text-xs" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1) }} />
            </div>
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="mt-2 gap-1 text-xs text-muted-foreground">
              <X className="h-3 w-3" /> مسح الفلاتر
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">القراءات ({total.toLocaleString('ar-SA')})</CardTitle>
          <CardDescription className="text-xs">يمكن فرز الجدول بالنقر على رأس العمود</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> جاري التحميل...
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              <Satellite className="h-10 w-10 mx-auto mb-2 opacity-30" />
              لا توجد قراءات بعد. تأكد من تفعيل المصادر من قسم التكاملات ثم اضغط "سحب البيانات الآن".
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort('projectName')}>
                      <span className="flex items-center gap-1">المشروع {renderSortIcon('projectName')}</span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort('observedAt')}>
                      <span className="flex items-center gap-1">التاريخ {renderSortIcon('observedAt')}</span>
                    </TableHead>
                    <TableHead>
                      <span className="flex items-center gap-1"><CloudSun className="h-3 w-3" /> GHI (Open-Meteo, W/m²)</span>
                    </TableHead>
                    <TableHead>
                      <span className="flex items-center gap-1"><Thermometer className="h-3 w-3" /> حرارة°C</span>
                    </TableHead>
                    <TableHead>
                      <span className="flex items-center gap-1"><Wind className="h-3 w-3" /> رياح m/s</span>
                    </TableHead>
                    <TableHead>رطوبة % / غيوم %</TableHead>
                    <TableHead>
                      <span className="flex items-center gap-1"><Leaf className="h-3 w-3" /> NDVI/EVI (CDSE)</span>
                    </TableHead>
                    <TableHead>NO2/Aerosol (CDSE)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs font-medium max-w-[140px] truncate">{r.projectName}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(r.observedDate).toLocaleDateString('ar-SA')}
                        <div className="flex gap-1 mt-1">
                          {r.openMeteo && <Badge variant="outline" className="text-[9px]">Open-Meteo</Badge>}
                          {r.cdse && <Badge variant="outline" className="text-[9px]">CDSE</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">{fmtNum(r.openMeteo?.ghiWm2 ?? null)}</TableCell>
                      <TableCell className="text-xs tabular-nums">{fmtNum(r.openMeteo?.temperatureC ?? null)}</TableCell>
                      <TableCell className="text-xs tabular-nums">{fmtNum(r.openMeteo?.windSpeedMs ?? null)}</TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {fmtNum(r.openMeteo?.humidityPct ?? null)} / {fmtNum(r.openMeteo?.cloudCoverPct ?? null)}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {r.cdse?.ndvi != null ? fmtNum(r.cdse.ndvi, 3) : '—'} / {r.cdse?.evi != null ? fmtNum(r.cdse.evi, 3) : '—'}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {r.cdse?.no2ColumnMolM2 != null ? r.cdse.no2ColumnMolM2.toExponential(2) : '—'} / {r.cdse?.aerosolIndex != null ? fmtNum(r.cdse.aerosolIndex, 2) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3 border-t">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>السابق</Button>
            <span className="text-xs text-muted-foreground">صفحة {page} من {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>التالي</Button>
          </div>
        )}
      </Card>
    </div>
  )
}

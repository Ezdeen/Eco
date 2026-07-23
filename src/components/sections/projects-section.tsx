'use client'

/**
 * ProjectsSection — نسخة مُصحَّحة
 * - إصلاح toLocaleString crash (الحصول على counts من _count.* و sites.length إلخ)
 * - إضافة أزرار دورة الحياة: تشغيل رسمي / تعليق / تقاعد / إرسال للمراجعة
 */

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/platform/status-badge'
import { ProjectFormModal } from '@/components/projects/project-form-modal'
import { DeleteProjectDialog } from '@/components/projects/delete-project-dialog'
import { ProjectWeatherWidget } from '@/components/projects/project-weather-widget'
import {
  FolderKanban, MapPin, Calendar, Zap, DollarSign, Search, Plus, Pencil, Trash2,
  Cpu, User, Phone, MoreVertical,
  PlayCircle, PauseCircle, Power, Send, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface Project {
  id: string
  name: string
  nameAr?: string | null
  code: string
  status: string
  projectType: string
  country?: string | null
  city?: string | null
  latitude?: number | null
  longitude?: number | null
  commissionedAt?: string | null
  capacityKwp?: number | null
  currency?: string | null
  tariffRetail?: number | null
  tariffFeedIn?: number | null
  methodology?: string
  sponsorName?: string | null
  sponsorPhone?: string | null
  inverterSerial?: string | null
  inverterType?: string | null
  createdAt: string
  sites: unknown[]
  assets: unknown[]
  devices: unknown[]
  _count: { readings: number; cases: number; attestations: number; reports: number }
}

function fmtNum(n: number | null | undefined, locale = 'en-US'): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '0'
  return n.toLocaleString(locale)
}

export function ProjectsSection() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [deletingProject, setDeletingProject] = useState<Project | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/auth/me', { signal: controller.signal })
      .then((r) => r.json())
      .then((d: { user?: { role?: string } }) => setUserRole(d?.user?.role || null))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setUserRole(null)
      })
    return () => controller.abort()
  }, [])

  const canCreateProject = userRole === 'org_admin'

  const fetchProjects = useCallback(() => {
    setLoading(true)
    fetch('/api/projects')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((d: { projects?: Project[] }) => {
        const safe = Array.isArray(d?.projects)
          ? d.projects.filter((p) => p && typeof p === 'object' && p.id)
          : []
        setProjects(safe)
      })
      .catch(() => { setProjects([]) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      setLoading(true)
      fetch('/api/projects')
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
        .then((d: { projects?: Project[] }) => {
          if (cancelled) return
          const safe = Array.isArray(d?.projects)
            ? d.projects.filter((p) => p && typeof p === 'object' && p.id)
            : []
          setProjects(safe)
        })
        .catch(() => { if (cancelled) return; setProjects([]) })
        .finally(() => { if (!cancelled) setLoading(false) })
    })
    return () => { cancelled = true }
  }, [])

  const filtered = projects.filter(
    (p) =>
      (filterStatus === 'all' || p.status === filterStatus) &&
      (search === '' ||
        (p.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.code || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.nameAr || '').includes(search) ||
        (p.inverterSerial || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.sponsorName || '').toLowerCase().includes(search.toLowerCase())),
  )

  const handleNew = () => { setEditingProject(null); setFormOpen(true) }
  const handleEdit = (project: Project) => { setEditingProject(project); setFormOpen(true) }
  const handleDeleteClick = (project: Project) => { setDeletingProject(project); setDeleteOpen(true) }

  const changeStatus = useCallback(
    async (project: Project, newStatus: 'active' | 'suspended' | 'decommissioned' | 'under_review' | 'approved' | 'draft', confirmLabel?: string) => {
      if (confirmLabel && !window.confirm(confirmLabel)) return
      setActionLoadingId(project.id)
      try {
        const res = await fetch(`/api/projects/${project.id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) { toast.error(data?.error || 'فشل تغيير حالة المشروع'); return }
        toast.success(data?.message || 'تم تحديث حالة المشروع')
        fetchProjects()
      } catch (err) {
        console.error('changeStatus error:', err)
        toast.error('حدث خطأ في الاتصال بالخادم')
      } finally {
        setActionLoadingId(null)
      }
    },
    [fetchProjects],
  )

  const handleCommission = useCallback(
    async (project: Project) => {
      if (!window.confirm(`تشغيل المشروع "${project.nameAr || project.name}" رسميًا؟\nسيتم تعيين الحالة إلى "نشط" وتسجيل تاريخ التشغيل.`)) return
      setActionLoadingId(project.id)
      try {
        const res = await fetch(`/api/projects/${project.id}/commission`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) { toast.error(data?.error || 'فشل تشغيل المشروع'); return }
        toast.success(data?.message || 'تم تشغيل المشروع رسميًا')
        if (Array.isArray(data?.warnings) && data.warnings.length > 0) {
          toast.warning('تحذيرات:', {
            description: (
              <ul className="mt-1 space-y-0.5 text-xs">
                {data.warnings.map((w: string, i: number) => (<li key={i}>• {w}</li>))}
              </ul>
            ),
          })
        }
        fetchProjects()
      } catch (err) {
        console.error('commission error:', err)
        toast.error('حدث خطأ في الاتصال بالخادم')
      } finally {
        setActionLoadingId(null)
      }
    },
    [fetchProjects],
  )

  const handleSuspend = useCallback(
    (project: Project) => changeStatus(project, 'suspended', `تعليق المشروع "${project.nameAr || project.name}"؟\nلن يستقبل بيانات جديدة حتى إعادة تفعيله.`),
    [changeStatus],
  )

  const handleDecommission = useCallback(
    (project: Project) => changeStatus(project, 'decommissioned', `تقاعد المشروع "${project.nameAr || project.name}" نهائيًا؟\nلا يمكن التراجع عن هذا الإجراء.`),
    [changeStatus],
  )

  const handleSubmitForReview = useCallback(
    (project: Project) => changeStatus(project, 'under_review', `إرسال المشروع "${project.nameAr || project.name}" للمراجعة؟`),
    [changeStatus],
  )

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="h-72 animate-pulse bg-muted/40" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث بالاسم، الرمز، السيريال، أو الممول..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>
        <div className="flex items-center gap-1.5 bg-muted/40 rounded-lg p-1">
          {[
            { value: 'all', label: 'الكل' },
            { value: 'active', label: 'نشط' },
            { value: 'under_review', label: 'قيد المراجعة' },
            { value: 'draft', label: 'مسودة' },
          ].map((s) => (
            <Button
              key={s.value}
              size="sm"
              variant={filterStatus === s.value ? 'default' : 'ghost'}
              className="h-8"
              onClick={() => setFilterStatus(s.value)}
            >
              {s.label}
            </Button>
          ))}
        </div>
        {canCreateProject && (
          <Button className="bg-primary" onClick={handleNew}>
            <Plus className="h-4 w-4 ml-1" />
            مشروع جديد
          </Button>
        )}
      </div>

      <div className="text-sm text-muted-foreground">
        عرض {filtered.length} من {projects.length} مشروع
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((p) => {
          const sitesCount = Array.isArray(p.sites) ? p.sites.length : 0
          const assetsCount = Array.isArray(p.assets) ? p.assets.length : 0
          const devicesCount = Array.isArray(p.devices) ? p.devices.length : 0
          const readingsCount = p?._count?.readings ?? 0
          const casesCount = p?._count?.cases ?? 0
          const attestationsCount = p?._count?.attestations ?? 0

          return (
            <Card key={p.id} className="overflow-hidden hover:shadow-lg transition-shadow group">
              <CardHeader className="pb-3 bg-gradient-to-br from-emerald-50/50 to-transparent dark:from-emerald-950/20">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                      <FolderKanban className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">{p.nameAr || p.name}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">{p.code}</p>
                    </div>
                  </div>
                  {canCreateProject && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 opacity-60 group-hover:opacity-100" disabled={actionLoadingId === p.id}>
                          {actionLoadingId === p.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MoreVertical className="h-4 w-4" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(p)}>
                          <Pencil className="h-3.5 w-3.5 ml-2" />
                          تعديل
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />

                        {p.status !== 'active' && p.status !== 'decommissioned' && (
                          <DropdownMenuItem onClick={() => handleCommission(p)} className="text-emerald-700 focus:text-emerald-800 focus:bg-emerald-50 dark:focus:bg-emerald-950/30">
                            <PlayCircle className="h-3.5 w-3.5 ml-2" />
                            تشغيل رسمي
                          </DropdownMenuItem>
                        )}

                        {p.status === 'draft' && (
                          <DropdownMenuItem onClick={() => handleSubmitForReview(p)}>
                            <Send className="h-3.5 w-3.5 ml-2" />
                            إرسال للمراجعة
                          </DropdownMenuItem>
                        )}

                        {p.status === 'active' && (
                          <DropdownMenuItem onClick={() => handleSuspend(p)} className="text-amber-700 focus:text-amber-800 focus:bg-amber-50 dark:focus:bg-amber-950/30">
                            <PauseCircle className="h-3.5 w-3.5 ml-2" />
                            تعليق
                          </DropdownMenuItem>
                        )}

                        {(p.status === 'active' || p.status === 'suspended') && (
                          <DropdownMenuItem onClick={() => handleDecommission(p)} className="text-red-600 focus:text-red-700 focus:bg-red-50 dark:focus:bg-red-950">
                            <Power className="h-3.5 w-3.5 ml-2" />
                            تقاعد نهائي
                          </DropdownMenuItem>
                        )}

                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleDeleteClick(p)} className="text-red-600 focus:text-red-700 focus:bg-red-50 dark:focus:bg-red-950">
                          <Trash2 className="h-3.5 w-3.5 ml-2" />
                          حذف
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                <div className="mt-2">
                  <StatusBadge status={p.status} />
                </div>
              </CardHeader>
              <CardContent className="pt-3 space-y-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>{p.city || '—'}, {p.country || '—'}</span>
                </div>

                {p.latitude !== undefined && p.longitude !== undefined &&
                 p.latitude !== null && p.longitude !== null && (
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                    <span className="tabular-nums">
                      {Number(p.latitude).toFixed(4)}°, {Number(p.longitude).toFixed(4)}°
                    </span>
                  </div>
                )}

                <ProjectWeatherWidget projectId={p.id} latitude={p.latitude} longitude={p.longitude} />

                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded-lg bg-muted/40">
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-0.5">
                      <Zap className="h-3 w-3" />
                      القدرة
                    </div>
                    <p className="text-sm font-bold tabular-nums">
                      {p.capacityKwp != null ? fmtNum(p.capacityKwp) : '—'}{' '}
                      <span className="text-xs font-normal text-muted-foreground">kWp</span>
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/40">
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-0.5">
                      <DollarSign className="h-3 w-3" />
                      التعرفة
                    </div>
                    <p className="text-sm font-bold tabular-nums">
                      {p.tariffRetail ?? '—'}{' '}
                      <span className="text-xs font-normal text-muted-foreground">{p.currency || 'SAR'}/kWh</span>
                    </p>
                  </div>
                </div>

                {p.inverterSerial && (
                  <div className="flex items-center gap-2 text-xs p-2 rounded-lg bg-muted/30">
                    <Cpu className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">إنفرتر:</span>
                    <code className="font-mono text-[11px] truncate">{p.inverterSerial}</code>
                  </div>
                )}

                {(p.sponsorName || p.sponsorPhone) && (
                  <div className="p-2 rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900">
                    <div className="flex items-center gap-1.5 text-[10px] text-violet-700 dark:text-violet-400 mb-1">
                      <User className="h-3 w-3" />
                      <span className="font-medium">المراقب / الممول</span>
                    </div>
                    {p.sponsorName && <p className="text-xs font-medium truncate">{p.sponsorName}</p>}
                    {p.sponsorPhone && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                        <Phone className="h-2.5 w-2.5" />
                        <span className="font-mono" dir="ltr">{p.sponsorPhone}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t">
                  <div>
                    <p className="text-base font-bold tabular-nums">{fmtNum(sitesCount)}</p>
                    <p className="text-[10px] text-muted-foreground">مواقع</p>
                  </div>
                  <div>
                    <p className="text-base font-bold tabular-nums">{fmtNum(devicesCount)}</p>
                    <p className="text-[10px] text-muted-foreground">أجهزة</p>
                  </div>
                  <div>
                    <p className="text-base font-bold tabular-nums">{fmtNum(readingsCount)}</p>
                    <p className="text-[10px] text-muted-foreground">قراءة</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {p.commissionedAt
                      ? `تشغيل: ${new Date(p.commissionedAt).toLocaleDateString('ar-SA')}`
                      : p.status === 'active'
                        ? 'نشط بدون تاريخ تشغيل'
                        : 'غير مُشغّل بعد'}
                  </div>
                  <div className="flex items-center gap-1">
                    {casesCount > 0 && (
                      <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">
                        {fmtNum(casesCount)} حالة
                      </Badge>
                    )}
                    {attestationsCount > 0 && (
                      <Badge variant="outline" className="text-xs text-emerald-700 border-emerald-300">
                        {fmtNum(attestationsCount)} توثيق
                      </Badge>
                    )}
                  </div>
                </div>

                {canCreateProject && p.status !== 'active' && p.status !== 'decommissioned' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full text-emerald-700 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                    onClick={() => handleCommission(p)}
                    disabled={actionLoadingId === p.id}
                  >
                    {actionLoadingId === p.id ? (
                      <Loader2 className="h-3.5 w-3.5 ml-1 animate-spin" />
                    ) : (
                      <PlayCircle className="h-3.5 w-3.5 ml-1" />
                    )}
                    تشغيل رسمي
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FolderKanban className="h-12 w-12 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground mb-4">لا توجد مشاريع مطابقة</p>
            {canCreateProject && (
              <Button onClick={handleNew} className="bg-primary">
                <Plus className="h-4 w-4 ml-1" />
                إنشاء أول مشروع
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <ProjectFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={fetchProjects}
        initialData={editingProject}
      />
      <DeleteProjectDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        project={deletingProject}
        onDeleted={fetchProjects}
      />
    </div>
  )
}

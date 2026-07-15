'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/platform/status-badge'
import { FolderKanban, MapPin, Calendar, Zap, DollarSign, Search, Plus, Filter } from 'lucide-react'

interface Project {
  id: string
  name: string
  nameAr?: string
  code: string
  status: string
  projectType: string
  country?: string
  city?: string
  latitude?: number
  longitude?: number
  commissionedAt?: string
  capacityKwp?: number
  currency: string
  tariffRetail?: number
  tariffFeedIn?: number
  methodology: string
  sitesCount: number
  assetsCount: number
  devicesCount: number
  readingsCount: number
  casesCount: number
  attestationsCount: number
  createdAt: string
}

export function ProjectsSection() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((d) => setProjects(d.projects || []))
      .finally(() => setLoading(false))
  }, [])

  const filtered = projects.filter(
    (p) =>
      (filterStatus === 'all' || p.status === filterStatus) &&
      (search === '' ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.code.toLowerCase().includes(search.toLowerCase()) ||
        (p.nameAr || '').includes(search)),
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
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث باسم أو رمز المشروع..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>
        <div className="flex items-center gap-1.5 bg-muted/40 rounded-lg p-1">
          {['all', 'active', 'under_review', 'draft'].map((s) => (
            <Button
              key={s}
              size="sm"
              variant={filterStatus === s ? 'default' : 'ghost'}
              className="h-8"
              onClick={() => setFilterStatus(s)}
            >
              {s === 'all' ? 'الكل' : s === 'active' ? 'نشط' : s === 'under_review' ? 'قيد المراجعة' : 'مسودة'}
            </Button>
          ))}
        </div>
        <Button className="bg-primary">
          <Plus className="h-4 w-4 ml-1" />
          مشروع جديد
        </Button>
      </div>

      <div className="text-sm text-muted-foreground">
        عرض {filtered.length} من {projects.length} مشروع
      </div>

      {/* Project cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((p) => (
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
                <StatusBadge status={p.status} />
              </div>
            </CardHeader>
            <CardContent className="pt-3 space-y-3">
              {/* Location */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                <span>{p.city || '—'}, {p.country || '—'}</span>
              </div>

              {/* Capacity + Tariff */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded-lg bg-muted/40">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-0.5">
                    <Zap className="h-3 w-3" />
                    القدرة
                  </div>
                  <p className="text-sm font-bold tabular-nums">
                    {p.capacityKwp?.toLocaleString() || '—'} <span className="text-xs font-normal text-muted-foreground">kWp</span>
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-muted/40">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-0.5">
                    <DollarSign className="h-3 w-3" />
                    التعرفة
                  </div>
                  <p className="text-sm font-bold tabular-nums">
                    {p.tariffRetail || '—'} <span className="text-xs font-normal text-muted-foreground">{p.currency}/kWh</span>
                  </p>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t">
                <div>
                  <p className="text-base font-bold tabular-nums">{p.sitesCount}</p>
                  <p className="text-[10px] text-muted-foreground">مواقع</p>
                </div>
                <div>
                  <p className="text-base font-bold tabular-nums">{p.devicesCount}</p>
                  <p className="text-[10px] text-muted-foreground">أجهزة</p>
                </div>
                <div>
                  <p className="text-base font-bold tabular-nums">{p.readingsCount.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">قراءة</p>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-2 border-t">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {p.commissionedAt
                    ? `تشغيل: ${new Date(p.commissionedAt).toLocaleDateString('ar-SA')}`
                    : 'غير مُشغّل بعد'}
                </div>
                {p.casesCount > 0 && (
                  <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">
                    {p.casesCount} حالة
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FolderKanban className="h-12 w-12 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">لا توجد مشاريع مطابقة</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

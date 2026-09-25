'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/platform/status-badge'
import { Cpu, Activity, Settings2, Calendar } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface Asset {
  id: string
  name: string
  assetType: string
  status: string
  project: { name: string; nameAr?: string; code: string }
  site?: { name: string; nameAr?: string; city?: string }
  solarProfile?: {
    capacityKwp: number
    panelAreaM2?: number
    tiltDegrees?: number
    azimuthDegrees?: number
    technology: string
    moduleEfficiency?: number
    systemLosses?: number
    inverterEfficiency?: number
  }
  devices: { id: string; name: string; status: string; serialNumber: string }[]
  readingsCount: number
  capacityKwp?: number
  technology?: string
  moduleEfficiency?: number
  tiltDegrees?: number
  azimuthDegrees?: number
  createdAt: string
}

const TECH_LABELS: Record<string, string> = {
  mono_si: 'أحادي البلورة',
  poly_si: 'متعدد البلورة',
  thin_film: 'غشاء رقيق',
  bifacial: 'ثنائي الوجه',
}

const ASSET_TYPE_LABELS: Record<string, string> = {
  solar_array: 'مصفوفة شمسية',
  inverter: 'إنفرتر',
  meter: 'عدّاد',
  bess: 'تخزين بطاريات',
}

export function AssetsSection() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/assets')
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then((d) => { setAssets(d?.assets || []) })
      .catch(() => { setAssets([]) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="h-32 animate-pulse bg-muted/40" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">إجمالي الأصول</p>
          <p className="text-2xl font-bold tabular-nums">{assets.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">القدرة الكلية</p>
          <p className="text-2xl font-bold tabular-nums">
            {assets.reduce((s, a) => s + (a.capacityKwp || 0), 0).toLocaleString()} <span className="text-sm font-normal text-muted-foreground">kWp</span>
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">نشطة</p>
          <p className="text-2xl font-bold tabular-nums text-emerald-600">{assets.filter((a) => a.status === 'active').length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">الأجهزة المرتبطة</p>
          <p className="text-2xl font-bold tabular-nums">{assets.reduce((s, a) => s + (a.devices?.length || 0), 0)}</p>
        </Card>
      </div>

      {/* Assets table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">الأصول الشمسية</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الأصل</TableHead>
                  <TableHead>المشروع</TableHead>
                  <TableHead>القدرة</TableHead>
                  <TableHead>التقنية</TableHead>
                  <TableHead>الميل/الاتجاه</TableHead>
                  <TableHead>الكفاءة</TableHead>
                  <TableHead>الأجهزة</TableHead>
                  <TableHead>القراءات</TableHead>
                  <TableHead>الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Cpu className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{a.name}</p>
                          <p className="text-xs text-muted-foreground">{ASSET_TYPE_LABELS[a.assetType] || a.assetType}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium">{a.project.nameAr || a.project.name}</p>
                      <p className="text-xs text-muted-foreground">{a.project.code}</p>
                    </TableCell>
                    <TableCell>
                      <p className="font-semibold tabular-nums">{a.capacityKwp?.toLocaleString() || '—'}</p>
                      <p className="text-xs text-muted-foreground">kWp</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {TECH_LABELS[a.technology || ''] || a.technology}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs tabular-nums">{a.tiltDegrees}° / {a.azimuthDegrees}°</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs tabular-nums">{((a.moduleEfficiency || 0) * 100).toFixed(1)}%</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{a.devices?.length || 0}</Badge>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs tabular-nums">{(a.readingsCount ?? 0).toLocaleString()}</p>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={a.status} />
                    </TableCell>
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

'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/platform/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Cpu, Wifi, WifiOff, AlertCircle, Clock, Settings, Server, Activity, Zap, Gauge } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface Asset {
  id: string
  name: string
  assetType: string
  status: string
  project: { name: string; nameAr?: string; code: string; inverterType?: string }
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
  devices: { id: string; name: string; status: string; serialNumber: string; lastSeenAt?: string }[]
  readingsCount: number
  capacityKwp?: number
  technology?: string
  moduleEfficiency?: number
  tiltDegrees?: number
  azimuthDegrees?: number
  createdAt: string
}

interface Device {
  id: string
  name: string
  manufacturer?: string
  model?: string
  serialNumber: string
  protocol: string
  status: string
  lastSeenAt?: string
  firmwareVersion?: string
  project: { name: string; nameAr?: string; code: string }
  site?: { name: string; nameAr?: string; city?: string }
  asset?: { name: string }
  readingsCount: number
  minutesSinceLastSeen: number | null
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

const PROTOCOL_LABELS: Record<string, string> = {
  modbus_tcp: 'Modbus TCP',
  mqtt: 'MQTT',
  http_api: 'HTTP API',
  sunspec: 'SunSpec',
}

const INVERTER_TYPE_LABELS: Record<string, string> = {
  string: 'String Inverter',
  central: 'Central Inverter',
  micro: 'Microinverter',
  hybrid: 'Hybrid Inverter',
  battery: 'Battery Inverter',
}

export function AssetsDevicesSection() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(async () => {
      if (cancelled) return
      try {
        const [assetsRes, devicesRes] = await Promise.all([
          fetch('/api/assets'),
          fetch('/api/devices'),
        ])
        if (!assetsRes.ok || !devicesRes.ok) throw new Error()
        const assetsData = await assetsRes.json()
        const devicesData = await devicesRes.json()
        if (cancelled) return
        setAssets(assetsData?.assets || [])
        setDevices(devicesData?.devices || [])
      } catch (e) {
        console.warn('Assets/devices fetch failed:', e)
        setAssets([])
        setDevices([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        <Card className="h-32 animate-pulse bg-muted/40" />
        <Card className="h-96 animate-pulse bg-muted/40" />
      </div>
    )
  }

  // Combined stats
  const totalAssets = assets.length
  const totalDevices = devices.length
  const connectedDevices = devices.filter((d) => d.status === 'connected').length
  const offlineDevices = devices.filter((d) => d.status === 'offline' || d.status === 'registered').length
  const staleDevices = devices.filter((d) => d.status === 'stale').length
  const activeAssets = assets.filter((a) => a.status === 'active').length
  const totalCapacityKwp = assets.reduce((s, a) => s + (a.capacityKwp || 0), 0)
  const totalReadings = assets.reduce((s, a) => s + (a.readingsCount || 0), 0)

  return (
    <div className="space-y-4">
      {/* Top stats - combined */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Server className="h-3.5 w-3.5" /> إجمالي الأصول
          </div>
          <p className="text-xl font-bold tabular-nums">{totalAssets}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Cpu className="h-3.5 w-3.5" /> إجمالي الأجهزة
          </div>
          <p className="text-xl font-bold tabular-nums">{totalDevices}</p>
        </Card>
        <Card className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200">
          <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 mb-1">
            <Wifi className="h-3.5 w-3.5" /> متصل
          </div>
          <p className="text-xl font-bold tabular-nums text-emerald-600">{connectedDevices}</p>
        </Card>
        <Card className="p-4 bg-amber-50 dark:bg-amber-950/30 border-amber-200">
          <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 mb-1">
            <AlertCircle className="h-3.5 w-3.5" /> بيانات قديمة
          </div>
          <p className="text-xl font-bold tabular-nums text-amber-600">{staleDevices}</p>
        </Card>
        <Card className="p-4 bg-red-50 dark:bg-red-950/30 border-red-200">
          <div className="flex items-center gap-2 text-xs text-red-700 dark:text-red-400 mb-1">
            <WifiOff className="h-3.5 w-3.5" /> غير متصل
          </div>
          <p className="text-xl font-bold tabular-nums text-red-600">{offlineDevices}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Zap className="h-3.5 w-3.5" /> القدرة الكلية
          </div>
          <p className="text-xl font-bold tabular-nums">{(totalCapacityKwp ?? 0).toLocaleString()} <span className="text-xs font-normal text-muted-foreground">kWp</span></p>
        </Card>
      </div>

      {/* Tabs for assets vs devices */}
      <Tabs defaultValue="assets" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="assets" className="gap-2">
            <Server className="h-3.5 w-3.5" />
            الأصول ({assets.length})
          </TabsTrigger>
          <TabsTrigger value="devices" className="gap-2">
            <Cpu className="h-3.5 w-3.5" />
            الأجهزة ({devices.length})
          </TabsTrigger>
        </TabsList>

        {/* Assets tab */}
        <TabsContent value="assets" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Server className="h-5 w-5" />
                الأصول الشمسية
              </CardTitle>
              <CardDescription className="text-xs">
                المصفوفات الشمسية مع خصائصها الفنية والإنفرترات المرتبطة بها
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الأصل</TableHead>
                      <TableHead>المشروع</TableHead>
                      <TableHead>نوع الإنفرتر</TableHead>
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
                              <Server className="h-4 w-4" />
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
                          {a.project.inverterType ? (
                            <Badge variant="outline" className="text-xs bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 border-violet-200">
                              {INVERTER_TYPE_LABELS[a.project.inverterType] || a.project.inverterType}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
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
        </TabsContent>

        {/* Devices tab */}
        <TabsContent value="devices" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Cpu className="h-5 w-5" />
                الأجهزة المتصلة
              </CardTitle>
              <CardDescription className="text-xs">
                الإنفرترات والعدادات وبوابات IoT مع حالة الاتصال وآخر قراءة
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الجهاز</TableHead>
                      <TableHead>المشروع</TableHead>
                      <TableHead>الرقم التسلسلي</TableHead>
                      <TableHead>البروتوكول</TableHead>
                      <TableHead>آخر رؤية</TableHead>
                      <TableHead>Firmware</TableHead>
                      <TableHead>القراءات</TableHead>
                      <TableHead>الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {devices.map((d) => {
                      const isStale = d.status === 'stale'
                      const isOffline = d.status === 'offline' || d.status === 'registered'
                      return (
                        <TableRow key={d.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                                isOffline
                                  ? 'bg-red-100 dark:bg-red-900 text-red-600'
                                  : isStale
                                    ? 'bg-amber-100 dark:bg-amber-900 text-amber-600'
                                    : 'bg-emerald-100 dark:bg-emerald-900 text-emerald-600'
                              }`}>
                                <Cpu className="h-4 w-4" />
                              </div>
                              <div>
                                <p className="font-medium text-sm">{d.name}</p>
                                <p className="text-xs text-muted-foreground">{d.manufacturer} {d.model}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm font-medium">{d.project.nameAr || d.project.name}</p>
                            <p className="text-xs text-muted-foreground">{d.project.code}</p>
                          </TableCell>
                          <TableCell>
                            <code className="text-xs font-mono">{d.serialNumber}</code>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{PROTOCOL_LABELS[d.protocol] || d.protocol}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 text-xs">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              {d.lastSeenAt
                                ? d.minutesSinceLastSeen !== null
                                  ? d.minutesSinceLastSeen < 60
                                    ? `قبل ${d.minutesSinceLastSeen} دقيقة`
                                    : `قبل ${Math.floor(d.minutesSinceLastSeen / 60)} ساعة`
                                  : '—'
                                : 'لم يتصل بعد'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <p className="text-xs font-mono">{d.firmwareVersion || '—'}</p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs tabular-nums">{(d.readingsCount ?? 0).toLocaleString()}</Badge>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={d.status} />
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Health overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-5 w-5" />
            صحة الأصول والأجهزة
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-muted/40">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Gauge className="h-3 w-3" /> أصول نشطة
            </div>
            <p className="text-xl font-bold tabular-nums">{activeAssets} / {totalAssets}</p>
          </div>
          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200">
            <div className="flex items-center gap-1.5 text-xs text-emerald-700 mb-1">
              <Wifi className="h-3 w-3" /> نسبة الاتصال
            </div>
            <p className="text-xl font-bold tabular-nums text-emerald-600">
              {totalDevices > 0 ? Math.round((connectedDevices / totalDevices) * 100) : 0}%
            </p>
          </div>
          <div className="p-3 rounded-lg bg-muted/40">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Zap className="h-3 w-3" /> إجمالي القدرة
            </div>
            <p className="text-xl font-bold tabular-nums">{(totalCapacityKwp ?? 0).toLocaleString()} <span className="text-xs font-normal text-muted-foreground">kWp</span></p>
          </div>
          <div className="p-3 rounded-lg bg-muted/40">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Activity className="h-3 w-3" /> إجمالي القراءات
            </div>
            <p className="text-xl font-bold tabular-nums">{(totalReadings ?? 0).toLocaleString()}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

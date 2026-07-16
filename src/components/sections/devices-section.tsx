'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/platform/status-badge'
import { Cpu, Wifi, WifiOff, AlertCircle, Clock, Settings } from 'lucide-react'

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

const PROTOCOL_LABELS: Record<string, string> = {
  modbus_tcp: 'Modbus TCP',
  mqtt: 'MQTT',
  http_api: 'HTTP API',
  sunspec: 'SunSpec',
}

export function DevicesSection() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/devices')
      .then((r) => r.json())
      .then((d) => setDevices(d.devices || []))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="h-48 animate-pulse bg-muted/40" />
        ))}
      </div>
    )
  }

  const connected = devices.filter((d) => d.status === 'connected').length
  const stale = devices.filter((d) => d.status === 'stale').length
  const offline = devices.filter((d) => d.status === 'offline' || d.status === 'registered').length

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Cpu className="h-3.5 w-3.5" /> إجمالي الأجهزة
          </div>
          <p className="text-2xl font-bold tabular-nums">{devices.length}</p>
        </Card>
        <Card className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200">
          <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 mb-1">
            <Wifi className="h-3.5 w-3.5" /> متصل
          </div>
          <p className="text-2xl font-bold tabular-nums text-emerald-600">{connected}</p>
        </Card>
        <Card className="p-4 bg-amber-50 dark:bg-amber-950/30 border-amber-200">
          <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 mb-1">
            <AlertCircle className="h-3.5 w-3.5" /> بيانات قديمة
          </div>
          <p className="text-2xl font-bold tabular-nums text-amber-600">{stale}</p>
        </Card>
        <Card className="p-4 bg-red-50 dark:bg-red-950/30 border-red-200">
          <div className="flex items-center gap-2 text-xs text-red-700 dark:text-red-400 mb-1">
            <WifiOff className="h-3.5 w-3.5" /> غير متصل
          </div>
          <p className="text-2xl font-bold tabular-nums text-red-600">{offline}</p>
        </Card>
      </div>

      {/* Device cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {devices.map((d) => {
          const isStale = d.status === 'stale'
          const isOffline = d.status === 'offline' || d.status === 'registered'
          return (
            <Card key={d.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl shrink-0 ${
                        isOffline
                          ? 'bg-red-100 dark:bg-red-900 text-red-600'
                          : isStale
                            ? 'bg-amber-100 dark:bg-amber-900 text-amber-600'
                            : 'bg-emerald-100 dark:bg-emerald-900 text-emerald-600'
                      }`}
                    >
                      <Cpu className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-sm truncate">{d.name}</CardTitle>
                      <p className="text-xs text-muted-foreground truncate">
                        {d.manufacturer} {d.model}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={d.status} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">الرقم التسلسلي</p>
                    <p className="font-mono truncate">{d.serialNumber}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">البروتوكول</p>
                    <p>{PROTOCOL_LABELS[d.protocol] || d.protocol}</p>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">المشروع</span>
                    <span className="font-medium truncate max-w-[60%] text-left">{d.project.nameAr || d.project.name}</span>
                  </div>
                  {d.site && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">الموقع</span>
                      <span className="truncate max-w-[60%] text-left">{d.site.nameAr || d.site.name}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t text-xs">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {d.lastSeenAt
                      ? d.minutesSinceLastSeen !== null
                        ? d.minutesSinceLastSeen < 60
                          ? `قبل ${d.minutesSinceLastSeen} دقيقة`
                          : `قبل ${Math.floor(d.minutesSinceLastSeen / 60)} ساعة`
                        : '—'
                      : 'لم يتصل بعد'}
                  </div>
                  <Badge variant="outline" className="text-xs tabular-nums">
                    {d.readingsCount.toLocaleString()} قراءة
                  </Badge>
                </div>

                {d.firmwareVersion && (
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Settings className="h-3 w-3" />
                    Firmware: {d.firmwareVersion}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

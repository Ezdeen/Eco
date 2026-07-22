'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Network, CloudSun, FileBarChart, Cpu, Bell, CreditCard,
  CheckCircle2, AlertCircle, AlertTriangle, Plug, ShieldAlert,
  Activity, Mail, Smartphone, MessageCircle, Settings,
} from 'lucide-react'
import { IntegrationConfigSection } from '@/components/sections/integration-config-section'

interface IntegrationData {
  hedera: any
  openMeteo: any
  reports: any
  devices: any
  notifications: any
  payments: any
  summary: any
}

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: any }> = {
  connected: { label: 'متصل', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 border-emerald-200', icon: CheckCircle2 },
  available: { label: 'متاح', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 border-emerald-200', icon: CheckCircle2 },
  active: { label: 'نشط', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 border-emerald-200', icon: CheckCircle2 },
  simulation: { label: 'محاكاة', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 border-amber-200', icon: AlertTriangle },
  needs_setup: { label: 'يحتاج إعداد', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 border-amber-200', icon: AlertCircle },
  internal: { label: 'داخلي', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 border-blue-200', icon: Activity },
  not_enabled: { label: 'غير مفعّل', className: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border-gray-200', icon: AlertCircle },
}

export function IntegrationsSection() {
  const [data, setData] = useState<IntegrationData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      setLoading(true)
      fetch('/api/integrations')
        .then((r) => { if (!r.ok) throw new Error(); return r.json() })
        .then((d) => { if (!cancelled && d && d.summary) setData(d) })
        .catch(() => { if (!cancelled) setData(null) })
        .finally(() => { if (!cancelled) setLoading(false) })
    })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        <Card className="h-32 animate-pulse bg-muted/40" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="h-64 animate-pulse bg-muted/40" />
          ))}
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">تعذر تحميل بيانات التكاملات</p>
        </CardContent>
      </Card>
    )
  }

  const { hedera, openMeteo, reports, devices, notifications, payments, summary } = data

  return (
    <div className="space-y-5">
      {/* Header */}
      <Card className="bg-gradient-to-br from-violet-500 to-purple-600 text-white border-0">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <Plug className="h-10 w-10" />
              <div>
                <h2 className="font-cairo text-2xl font-bold">التكاملات</h2>
                <p className="text-sm opacity-90">إدارة حالة الربط مع الخدمات الخارجية ومصادر البيانات</p>
              </div>
            </div>
            <div className="text-left">
              <p className="text-xs opacity-80">إجمالي التكاملات</p>
              <p className="font-cairo text-3xl font-bold tabular-nums">{summary.total}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="status" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="status" className="gap-1 text-xs">
            <Activity className="h-3.5 w-3.5" /> حالة التكاملات
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-1 text-xs">
            <Settings className="h-3.5 w-3.5" /> إدارة الإعدادات
          </TabsTrigger>
        </TabsList>

        <TabsContent value="status" className="space-y-5 mt-4">

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200">
          <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 mb-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> متصل / نشط
          </div>
          <p className="text-2xl font-bold tabular-nums text-emerald-600">{summary.connected}</p>
        </Card>
        <Card className="p-4 bg-amber-50 dark:bg-amber-950/30 border-amber-200">
          <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 mb-1">
            <AlertTriangle className="h-3.5 w-3.5" /> محاكاة
          </div>
          <p className="text-2xl font-bold tabular-nums text-amber-600">{summary.simulation}</p>
        </Card>
        <Card className="p-4 bg-amber-50 dark:bg-amber-950/30 border-amber-200">
          <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 mb-1">
            <AlertCircle className="h-3.5 w-3.5" /> يحتاج إعداد
          </div>
          <p className="text-2xl font-bold tabular-nums text-amber-600">{summary.needsSetup}</p>
        </Card>
        <Card className="p-4 bg-gray-50 dark:bg-gray-950/30 border-gray-200">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <AlertCircle className="h-3.5 w-3.5" /> غير مفعّل / داخلي
          </div>
          <p className="text-2xl font-bold tabular-nums text-gray-600">{summary.notEnabled}</p>
        </Card>
      </div>

      {/* Integration Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Hedera */}
        <IntegrationCard
          title="Hedera"
          titleAr="شبكة Hedera"
          icon={Network}
          status={hedera.status}
          description="توثيق حزم البيانات على شبكة Hedera mediante Transaction ID و Consensus Timestamp"
        >
          <div className="space-y-2 text-xs">
            <InfoRow label="الشبكة" value={
              <Badge variant="outline" className="text-[10px] font-mono">
                {hedera.network}
              </Badge>
            } />
            <InfoRow label="الوضع" value={
              <Badge variant="outline" className={`text-[10px] ${hedera.mode === 'live' ? 'bg-emerald-50 text-emerald-700' : hedera.mode === 'simulation' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                {hedera.mode === 'live' ? '🔴 مباشر' : hedera.mode === 'simulation' ? '🟡 محاكاة' : '🔴 غير مضبوط'}
              </Badge>
            } />
            <InfoRow label="Topic ID" value={hedera.topicId ? <code className="font-mono text-[10px]">{hedera.topicId}</code> : '—'} />
            <InfoRow label="Operator ID" value={hedera.maskedOperatorId ? <code className="font-mono text-[10px]">{hedera.maskedOperatorId}</code> : 'غير مضبوط'} />
            <InfoRow label="مفتاح التشغيل" value={hedera.operatorKeyConfigured ? '✓ مضبوط' : '✗ غير مضبوط'} />
            <Separator className="my-2" />
            <InfoRow label="آخر Transaction" value={hedera.lastTransactionId ? <code className="font-mono text-[9px] truncate max-w-[120px] block">{hedera.lastTransactionId}</code> : 'لا توجد بعد'} />
            <InfoRow label="آخر Consensus" value={hedera.lastConsensusTimestamp || '—'} />
            <InfoRow label="عدد التوثيقات" value={<span className="font-bold tabular-nums">{hedera.totalAttestations}</span>} />
          </div>
          {hedera.warning && (
            <div className="mt-3 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 text-[10px] text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
              <ShieldAlert className="h-3 w-3 shrink-0 mt-0.5" />
              <span>{hedera.warning}</span>
            </div>
          )}
        </IntegrationCard>

        {/* Open-Meteo */}
        <IntegrationCard
          title="Open-Meteo"
          titleAr="الطقس والإشعاع الشمسي"
          icon={CloudSun}
          status={openMeteo.status}
          description={openMeteo.description}
        >
          <div className="space-y-2 text-xs">
            <InfoRow label="يتطلب API Key" value={openMeteo.requiresApiKey ? 'نعم' : 'لا (مجاني)'} />
            <InfoRow label="آخر مزامنة" value={openMeteo.lastSyncAt ? new Date(openMeteo.lastSyncAt).toLocaleString('ar-SA') : 'لا توجد بعد'} />
            <InfoRow label="عدد القراءات" value={<span className="font-bold tabular-nums">{openMeteo.totalObservations}</span>} />
            <InfoRow label="الحالة" value={
              <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="h-2.5 w-2.5 ml-1" /> متاح
              </Badge>
            } />
          </div>
        </IntegrationCard>

        {/* Reports */}
        <IntegrationCard
          title="التقارير"
          titleAr="تصدير التقارير"
          icon={FileBarChart}
          status={reports.status}
          description={reports.description}
        >
          <div className="space-y-2 text-xs">
            <InfoRow label="الصيغ المدعومة" value={
              <div className="flex gap-1">
                {reports.formats.map((f: string) => (
                  <Badge key={f} variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700">{f}</Badge>
                ))}
              </div>
            } />
            <InfoRow label="تقارير منشورة" value={<span className="font-bold tabular-nums text-emerald-600">{reports.publishedCount}</span>} />
            <InfoRow label="تقارير معتمدة" value={<span className="font-bold tabular-nums">{reports.approvedCount}</span>} />
            <InfoRow label="مسودات" value={<span className="font-bold tabular-nums text-amber-600">{reports.draftCount}</span>} />
            <InfoRow label="آخر تقرير" value={reports.lastReportTitle ? <span className="truncate max-w-[140px] block">{reports.lastReportTitle}</span> : 'لا يوجد'} />
          </div>
        </IntegrationCard>

        {/* Devices / IoT */}
        <IntegrationCard
          title="الأجهزة و IoT"
          titleAr="ربط الأجهزة الميدانية"
          icon={Cpu}
          status={devices.status}
          description={devices.description}
        >
          <div className="space-y-2 text-xs">
            <InfoRow label="إجمالي الأجهزة" value={<span className="font-bold tabular-nums">{devices.totalDevices}</span>} />
            <InfoRow label="متصل" value={<span className="font-bold tabular-nums text-emerald-600">{devices.connectedDevices}</span>} />
            <InfoRow label="مسجّل" value={<span className="font-bold tabular-nums text-blue-600">{devices.registeredDevices}</span>} />
            <InfoRow label="غير متصل" value={<span className="font-bold tabular-nums text-red-600">{devices.offlineDevices}</span>} />
            <InfoRow label="البروتوكولات" value={
              <div className="flex flex-wrap gap-1">
                {(devices.supportedProtocols || []).map((p: string) => (
                  <Badge key={p} variant="outline" className="text-[9px]">{p}</Badge>
                ))}
              </div>
            } />
          </div>
        </IntegrationCard>

        {/* Notifications */}
        <IntegrationCard
          title="الإشعارات"
          titleAr="قنوات الإشعارات"
          icon={Bell}
          status={notifications.status}
          description={notifications.description}
        >
          <div className="space-y-2 text-xs">
            {Object.entries(notifications.channels).map(([key, ch]: [string, any]) => (
              <InfoRow
                key={key}
                label={
                  <span className="flex items-center gap-1">
                    {key === 'inApp' && <Bell className="h-3 w-3" />}
                    {key === 'email' && <Mail className="h-3 w-3" />}
                    {key === 'sms' && <Smartphone className="h-3 w-3" />}
                    {key === 'whatsapp' && <MessageCircle className="h-3 w-3" />}
                    {ch.label}
                  </span>
                }
                value={
                  <Badge variant="outline" className={`text-[10px] ${ch.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-400'}`}>
                    {ch.enabled ? 'مفعّل' : 'مستقبلي'}
                  </Badge>
                }
              />
            ))}
          </div>
        </IntegrationCard>

        {/* Payments */}
        <IntegrationCard
          title="الدفع والاشتراكات"
          titleAr="بوابة الدفع"
          icon={CreditCard}
          status={payments.status}
          description={payments.description}
        >
          <div className="space-y-2 text-xs">
            <InfoRow label="Stripe" value={
              <Badge variant="outline" className="text-[10px] bg-gray-50 text-gray-400">
                غير مفعّل
              </Badge>
            } />
            <InfoRow label="Checkout" value={
              <Badge variant="outline" className="text-[10px] bg-gray-50 text-gray-400">
                غير مفعّل
              </Badge>
            } />
            <div className="mt-3 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 text-[10px] text-amber-800 dark:text-amber-300">
              مطلوب لتحويل المنصة إلى SaaS تجاري. يحتاج تكامل Stripe أو بوابة دفع محلية.
            </div>
          </div>
        </IntegrationCard>
      </div>


        </TabsContent>

        {/* Config Management Tab */}
        <TabsContent value="config" className="mt-4">
          <IntegrationConfigSection />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Helper: Integration Card wrapper
function IntegrationCard({
  title, titleAr, icon: Icon, status, description, children,
}: {
  title: string
  titleAr: string
  icon: any
  status: string
  description: string
  children: React.ReactNode
}) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.not_enabled
  const StatusIcon = config.icon

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 bg-muted/30">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-sm">{title}</CardTitle>
              <p className="text-[10px] text-muted-foreground">{titleAr}</p>
            </div>
          </div>
          <Badge variant="outline" className={`text-[10px] shrink-0 ${config.className}`}>
            <StatusIcon className="h-2.5 w-2.5 ml-1" />
            {config.label}
          </Badge>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{description}</p>
      </CardHeader>
      <CardContent className="p-3">
        {children}
      </CardContent>
    </Card>
  )
}

// Helper: Info Row
function InfoRow({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-left truncate">{value || '—'}</span>
    </div>
  )
}

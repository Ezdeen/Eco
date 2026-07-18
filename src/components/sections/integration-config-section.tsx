'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Plug, Plus, Edit3, Trash2, TestTube, RefreshCw, CheckCircle2, XCircle,
  Loader2, Lock, Eye, EyeOff, Key, AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'

interface Config {
  id: string
  name: string
  displayName: string
  description: string | null
  category: string
  isActive: boolean
  config: any
  hasSecret: boolean
  maskedSecret: string | null
  secretKey: string | null
  lastTestedAt: string | null
  lastTestResult: string | null
  lastTestError: string | null
  createdBy: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

const INTEGRATION_TEMPLATES = [
  {
    name: 'hedera',
    displayName: 'Hedera Blockchain',
    description: 'توثيق البيانات على شبكة Hedera',
    category: 'integration',
    configFields: [
      { key: 'network', label: 'الشبكة', type: 'select', options: ['simulation', 'testnet', 'mainnet'] },
      { key: 'accountId', label: 'Account ID', type: 'text', placeholder: '0.0.xxxxxxx' },
      { key: 'evmAddress', label: 'EVM Address (اختياري)', type: 'text', placeholder: '0x...' },
      { key: 'derPublicKey', label: 'DER Encoded Public Key (اختياري)', type: 'text', placeholder: '302a300506032b6570...' },
      { key: 'topicId', label: 'Topic ID', type: 'text', placeholder: '0.0.xxxxxxx (أنشئه من Hedera Portal أو اتركه فارغاً وسننشئه تلقائياً عند أول اختبار)' },
    ],
    secretLabel: 'DER Encoded Private Key',
    secretPlaceholder: '302e020100300506032b657004220420xxxx',
  },
  {
    name: 'open-meteo',
    displayName: 'Open-Meteo Weather',
    description: 'بيانات الطقس والإشعاع الشمسي',
    category: 'integration',
    configFields: [],
    secretLabel: 'API Key (اختياري)',
    secretPlaceholder: 'اترك فارغًا للاستخدام المجاني',
  },
  {
    name: 'n8n',
    displayName: 'n8n Webhook',
    description: 'استقبال بيانات الأجهزة من n8n',
    category: 'integration',
    configFields: [
      { key: 'webhookUrl', label: 'Webhook URL', type: 'text', placeholder: 'https://n8n.example.com/webhook/xxx' },
    ],
    secretLabel: 'Webhook Secret (HMAC)',
    secretPlaceholder: 'مفتاح HMAC للتحقق من التوقيع',
  },
  {
    name: 'stripe',
    displayName: 'Stripe Payments',
    description: 'بوابة الدفع للاشتراكات',
    category: 'payment',
    configFields: [
      { key: 'mode', label: 'الوضع', type: 'select', options: ['test', 'live'] },
    ],
    secretLabel: 'Secret Key',
    secretPlaceholder: 'sk_test_xxxx أو sk_live_xxxx',
  },
  {
    name: 'email',
    displayName: 'Email (SMTP)',
    description: 'إرسال الإشعارات بالبريد',
    category: 'notification',
    configFields: [
      { key: 'host', label: 'SMTP Host', type: 'text', placeholder: 'smtp.gmail.com' },
      { key: 'port', label: 'SMTP Port', type: 'text', placeholder: '587' },
      { key: 'from', label: 'From Email', type: 'text', placeholder: 'noreply@example.com' },
    ],
    secretLabel: 'SMTP Password',
    secretPlaceholder: 'كلمة مرور SMTP',
  },
]

export function IntegrationConfigSection() {
  const [configs, setConfigs] = useState<Config[]>([])
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [editingConfig, setEditingConfig] = useState<Config | null>(null)
  const [deleteConfig, setDeleteConfig] = useState<Config | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formDisplayName, setFormDisplayName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formCategory, setFormCategory] = useState('integration')
  const [formIsActive, setFormIsActive] = useState(false)
  const [formConfig, setFormConfig] = useState<Record<string, string>>({})
  const [formSecret, setFormSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<string>('hedera')

  const fetchConfigs = useCallback(() => {
    setLoading(true)
    fetch('/api/integration-config')
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then((d) => { if (d && d.configs) setConfigs(d.configs) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchConfigs()
  }, [fetchConfigs])

  const openCreate = () => {
    setEditingConfig(null)
    applyTemplate('hedera')
    setEditOpen(true)
  }

  const openEdit = (config: Config) => {
    setEditingConfig(config)
    setFormName(config.name)
    setFormDisplayName(config.displayName)
    setFormDescription(config.description || '')
    setFormCategory(config.category)
    setFormIsActive(config.isActive)
    setFormConfig(config.config || {})
    setFormSecret('')
    setShowSecret(false)
    setSelectedTemplate(config.name)
    setEditOpen(true)
  }

  const applyTemplate = (templateName: string) => {
    const template = INTEGRATION_TEMPLATES.find((t) => t.name === templateName)
    if (template) {
      setFormName(template.name)
      setFormDisplayName(template.displayName)
      setFormDescription(template.description)
      setFormCategory(template.category)
      setFormConfig({})
      setFormSecret('')
      setSelectedTemplate(templateName)
    }
  }

  const handleSubmit = async () => {
    if (!formName || !formDisplayName) {
      toast.error('الاسم مطلوب')
      return
    }
    setSubmitting(true)
    try {
      const url = editingConfig
        ? `/api/integration-config/${editingConfig.id}`
        : '/api/integration-config'
      const method = editingConfig ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          displayName: formDisplayName,
          description: formDescription,
          category: formCategory,
          isActive: formIsActive,
          config: formConfig,
          secret: formSecret || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'فشل الحفظ')
        return
      }
      toast.success(editingConfig ? 'تم تحديث التكامل' : 'تم إضافة التكامل')
      setEditOpen(false)
      fetchConfigs()
    } catch {
      toast.error('حدث خطأ')
    } finally {
      setSubmitting(false)
    }
  }

  const handleTest = async (config: Config) => {
    setTestingId(config.id)
    try {
      const res = await fetch(`/api/integration-config/${config.id}/test`, { method: 'POST' })
      const data = await res.json()
      if (data.result === 'success') {
        toast.success(`اختبار ناجح: ${data.message}`)
      } else {
        toast.error(`اختبار فشل: ${data.message}`)
      }
      fetchConfigs()
    } catch {
      toast.error('فشل الاتصال')
    } finally {
      setTestingId(null)
    }
  }

  const handleRotateSecret = async (config: Config) => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/integration-config/${config.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rotateSecret: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'فشل تدوير المفتاح')
        return
      }
      toast.success('تم تدوير مفتاح التشفير')
      fetchConfigs()
    } catch {
      toast.error('حدث خطأ')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfig) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/integration-config/${deleteConfig.id}`, { method: 'DELETE' })
      if (!res.ok) {
        toast.error('فشل الحذف')
        return
      }
      toast.success('تم حذف التكامل')
      setDeleteOpen(false)
      setDeleteConfig(null)
      fetchConfigs()
    } catch {
      toast.error('حدث خطأ')
    } finally {
      setSubmitting(false)
    }
  }

  const currentTemplate = INTEGRATION_TEMPLATES.find((t) => t.name === selectedTemplate)

  if (loading) {
    return <Card className="h-96 animate-pulse bg-muted/40" />
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="bg-gradient-to-br from-violet-500 to-purple-600 text-white border-0">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <Plug className="h-10 w-10" />
              <div>
                <h2 className="font-cairo text-2xl font-bold">إدارة التكاملات</h2>
                <p className="text-sm opacity-90">{configs.length} تكامل مُعدّ — إدارة الأسرار والاتصالات</p>
              </div>
            </div>
            <Button variant="secondary" onClick={openCreate} className="bg-white text-violet-700 hover:bg-white/90">
              <Plus className="h-4 w-4 ml-1" />
              إضافة تكامل
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Configs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">التكاملات المُعدّة</CardTitle>
          <CardDescription className="text-xs">إدارة الأسرار المشفّرة، اختبار الاتصال، تدوير المفاتيح</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {configs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Plug className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground mb-4">لا توجد تكاملات مُعدّة بعد</p>
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4 ml-1" />
                إضافة أول تكامل
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>التكامل</TableHead>
                    <TableHead>الفئة</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>السر</TableHead>
                    <TableHead>آخر اختبار</TableHead>
                    <TableHead>إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {configs.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{c.displayName}</p>
                          <p className="text-[10px] text-muted-foreground">{c.name}</p>
                          {c.description && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">{c.description}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {c.category === 'payment' ? 'دفع' : c.category === 'notification' ? 'إشعارات' : 'تكامل'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${c.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-500'}`}>
                          {c.isActive ? 'نشط' : 'غير نشط'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {c.hasSecret ? (
                          <div className="flex items-center gap-1">
                            <Lock className="h-3 w-3 text-emerald-600" />
                            <code className="text-[10px] font-mono">{c.maskedSecret || '****'}</code>
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">لا يوجد</span>
                        )}
                        {c.secretKey && (
                          <p className="text-[9px] text-muted-foreground">{c.secretKey}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        {c.lastTestedAt ? (
                          <div>
                            <Badge variant="outline" className={`text-[9px] ${c.lastTestResult === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                              {c.lastTestResult === 'success' ? <CheckCircle2 className="h-2.5 w-2.5 ml-1" /> : <XCircle className="h-2.5 w-2.5 ml-1" />}
                              {c.lastTestResult === 'success' ? 'ناجح' : 'فشل'}
                            </Badge>
                            <p className="text-[9px] text-muted-foreground mt-0.5">
                              {new Date(c.lastTestedAt).toLocaleString('ar-SA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">لم يُختبر</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleTest(c)} disabled={testingId === c.id} title="اختبار الاتصال">
                            {testingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube className="h-3.5 w-3.5" />}
                          </Button>
                          {c.hasSecret && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRotateSecret(c)} disabled={submitting} title="تدوير المفتاح">
                              <Key className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)} title="تعديل">
                            <Edit3 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:bg-red-50" onClick={() => { setDeleteConfig(c); setDeleteOpen(true) }} title="حذف">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit/Create Dialog */}
      <Dialog open={editOpen} onOpenChange={(o) => { setEditOpen(o); if (!o) setEditingConfig(null) }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plug className="h-5 w-5 text-primary" />
              {editingConfig ? `تعديل: ${editingConfig.displayName}` : 'إضافة تكامل جديد'}
            </DialogTitle>
            <DialogDescription>إدارة إعدادات التكامل والأسرار المشفّرة</DialogDescription>
          </DialogHeader>

          {!editingConfig && (
            <div className="space-y-1.5">
              <Label className="text-xs">نوع التكامل</Label>
              <Select value={selectedTemplate} onValueChange={(v) => applyTemplate(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTEGRATION_TEMPLATES.map((t) => (
                    <SelectItem key={t.name} value={t.name}>{t.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">الاسم المعروض *</Label>
              <Input value={formDisplayName} onChange={(e) => setFormDisplayName(e.target.value)} placeholder="Hedera Testnet" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">الوصف</Label>
              <Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="وصف مختصر للتكامل" rows={2} />
            </div>

            {/* Config fields based on template */}
            {currentTemplate && currentTemplate.configFields.length > 0 && (
              <>
                <Separator />
                <p className="text-xs font-semibold text-muted-foreground">إعدادات التكوين</p>
                {currentTemplate.configFields.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Label className="text-xs">{field.label}</Label>
                    {field.type === 'select' ? (
                      <Select
                        value={formConfig[field.key] || ''}
                        onValueChange={(v) => setFormConfig({ ...formConfig, [field.key]: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={`اختر ${field.label}`} />
                        </SelectTrigger>
                        <SelectContent>
                          {field.options?.map((opt) => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={formConfig[field.key] || ''}
                        onChange={(e) => setFormConfig({ ...formConfig, [field.key]: e.target.value })}
                        placeholder={field.placeholder}
                        dir="ltr"
                      />
                    )}
                  </div>
                ))}
              </>
            )}

            {/* Secret field */}
            {currentTemplate && (
              <>
                <Separator />
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1">
                    <Lock className="h-3 w-3" />
                    {currentTemplate.secretLabel}
                    {editingConfig?.hasSecret && !formSecret && (
                      <span className="text-[10px] text-amber-600 mr-1">(اترك فارغًا للاحتفاظ بالسر الحالي)</span>
                    )}
                  </Label>
                  <div className="relative">
                    <Input
                      type={showSecret ? 'text' : 'password'}
                      value={formSecret}
                      onChange={(e) => setFormSecret(e.target.value)}
                      placeholder={currentTemplate.secretPlaceholder}
                      className="pr-9 pl-9"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {editingConfig?.maskedSecret && (
                    <p className="text-[10px] text-muted-foreground">السر الحالي: <code className="font-mono">{editingConfig.maskedSecret}</code></p>
                  )}
                </div>
              </>
            )}

            <Separator />

            {/* Active toggle */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
              <div>
                <p className="text-sm font-medium">تفعيل التكامل</p>
                <p className="text-[10px] text-muted-foreground">عند التفعيل، سيستخدم النظام هذا التكامل</p>
              </div>
              <Switch checked={formIsActive} onCheckedChange={setFormIsActive} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={submitting}>إلغاء</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 ml-1 animate-spin" /> : <Plus className="h-4 w-4 ml-1" />}
              {editingConfig ? 'حفظ التعديلات' : 'إضافة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={(o) => { setDeleteOpen(o); if (!o) setDeleteConfig(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              تأكيد حذف التكامل
            </AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف <strong>{deleteConfig?.displayName}</strong> وجميع إعداداته وأسراره نهائيًا.
              لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={submitting} className="bg-red-600 hover:bg-red-700">
              {submitting ? <Loader2 className="h-4 w-4 ml-1 animate-spin" /> : <Trash2 className="h-4 w-4 ml-1" />}
              نعم، احذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Security notice */}
      <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200">
        <CardContent className="p-3">
          <div className="flex items-start gap-2 text-xs">
            <AlertCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-blue-800 dark:text-blue-300">
              <strong>تنبيه أمني:</strong> جميع الأسرار مشفّرة بـ AES-256-GCM ولا تُعرض في الواجهة.
              كل عملية (إنشاء/تعديل/حذف/اختبار/تدوير) مُسجّلة في سجل التدقيق.
              تدوير المفاتيح يُعيد تشفير السر بمفتاح جديد دون كشف القيمة الأصلية.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

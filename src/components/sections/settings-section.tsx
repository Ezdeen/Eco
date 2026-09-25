'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Users, Building2, Globe, Clock, Bell, Shield, Key, Database, Webhook, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'

interface OrganizationForm {
  name: string
  nameAr: string
  code: string
  country: string
  currency: string
  timezone: string
  language: string
}

const EMPTY_ORG: OrganizationForm = {
  name: '', nameAr: '', code: '', country: '', currency: 'SAR', timezone: 'Asia/Riyadh', language: 'ar',
}

function OrganizationSettingsCard() {
  const [form, setForm] = useState<OrganizationForm>(EMPTY_ORG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchOrganization = useCallback(() => {
    setLoading(true)
    fetch('/api/organization')
      .then(async (r) => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'فشل تحميل بيانات المؤسسة')
        return data
      })
      .then((d) => {
        if (d?.organization) {
          const org = d.organization
          setForm({
            name: org.name ?? '',
            nameAr: org.nameAr ?? '',
            code: org.code ?? '',
            country: org.country ?? '',
            currency: org.currency ?? 'SAR',
            timezone: org.timezone ?? 'Asia/Riyadh',
            language: org.language ?? 'ar',
          })
        }
      })
      .catch((err) => toast.error(err.message || 'حدث خطأ في الاتصال'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchOrganization()
  }, [fetchOrganization])

  const update = (field: keyof OrganizationForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('اسم المؤسسة مطلوب')
      return
    }
    if (!form.code.trim()) {
      toast.error('رمز المؤسسة مطلوب')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/organization', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'فشل حفظ إعدادات المؤسسة')
        return
      }
      toast.success('تم حفظ إعدادات المؤسسة بنجاح')
      if (data.organization) {
        setForm((prev) => ({
          ...prev,
          name: data.organization.name ?? prev.name,
          nameAr: data.organization.nameAr ?? prev.nameAr,
          code: data.organization.code ?? prev.code,
        }))
      }
    } catch {
      toast.error('حدث خطأ في الاتصال')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          معلومات المؤسسة
        </CardTitle>
        <CardDescription className="text-xs">إعدادات المؤسسة والعملة والمنطقة الزمنية</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {loading ? (
          <div className="col-span-full flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin ml-2" />
            جارٍ التحميل...
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">اسم المؤسسة</Label>
              <Input
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">الرمز</Label>
              <Input
                value={form.code}
                onChange={(e) => update('code', e.target.value.toUpperCase())}
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">الاسم بالعربية (اختياري)</Label>
              <Input
                value={form.nameAr}
                onChange={(e) => update('nameAr', e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">البلد</Label>
              <Select value={form.country} onValueChange={(v) => update('country', v)} disabled={saving}>
                <SelectTrigger><SelectValue placeholder="اختر البلد" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PS">فلسطين</SelectItem>
                  <SelectItem value="SA">السعودية</SelectItem>
                  <SelectItem value="AE">الإمارات</SelectItem>
                  <SelectItem value="QA">قطر</SelectItem>
                  <SelectItem value="KW">الكويت</SelectItem>
                  <SelectItem value="BH">البحرين</SelectItem>
                  <SelectItem value="OM">عمان</SelectItem>
                  <SelectItem value="EG">مصر</SelectItem>
                  <SelectItem value="JO">الأردن</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">العملة</Label>
              <Select value={form.currency} onValueChange={(v) => update('currency', v)} disabled={saving}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ILS">شيكل جديد (ILS)</SelectItem>
                  <SelectItem value="JOD">دينار أردني (JOD)</SelectItem>
                  <SelectItem value="USD">دولار أمريكي (USD)</SelectItem>
                  <SelectItem value="SAR">ريال سعودي (SAR)</SelectItem>
                  <SelectItem value="AED">درهم إماراتي (AED)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">المنطقة الزمنية</Label>
              <Select value={form.timezone} onValueChange={(v) => update('timezone', v)} disabled={saving}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Asia/Gaza">آسيا/غزة (UTC+2)</SelectItem>
                  <SelectItem value="Asia/Hebron">آسيا/الخليل (UTC+2)</SelectItem>
                  <SelectItem value="Asia/Amman">آسيا/عمّان (UTC+3)</SelectItem>
                  <SelectItem value="Asia/Riyadh">آسيا/الرياض (UTC+3)</SelectItem>
                  <SelectItem value="Asia/Dubai">آسيا/دبي (UTC+4)</SelectItem>
                  <SelectItem value="Asia/Qatar">آسيا/الدوحة (UTC+3)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">اللغة الافتراضية</Label>
              <Select value={form.language} onValueChange={(v) => update('language', v)} disabled={saving}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ar">العربية</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </CardContent>
      <CardFooter className="justify-end border-t pt-4">
        <Button onClick={handleSave} disabled={loading || saving}>
          {saving ? (
            <><Loader2 className="h-4 w-4 animate-spin ml-2" /> جارٍ الحفظ...</>
          ) : (
            <><Save className="h-4 w-4 ml-2" /> حفظ التغييرات</>
          )}
        </Button>
      </CardFooter>
    </Card>
  )
}

export function SettingsSection() {
  return (
    <div className="space-y-4">
      <OrganizationSettingsCard />

      {/* Members & Roles */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-5 w-5" />
            الأعضاء والأدوار
          </CardTitle>
          <CardDescription className="text-xs">RBAC بنطاق المؤسسة والمشروع - 3 أدوار رئيسية</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {[
              { role: 'org_admin', ar: 'مدير المؤسسة', desc: 'صلاحية كاملة: إدارة المستخدمين والمشاريع والتقارير والإعدادات، دون قيود' },
              { role: 'project_manager', ar: 'مدير المشروع', desc: 'محصور بالمشاريع المسندة إليه فقط: قراءة، تدقيق القراءات، تشغيل الحسابات، تنزيل التقارير' },
              { role: 'data_entry', ar: 'مدخل بيانات', desc: 'إنشاء مشاريع جديدة فقط، بلا وصول لأي بيانات أو تقارير أخرى' },
            ].map((r) => (
              <div key={r.role} className="p-3 rounded-lg bg-muted/40 hover:bg-muted transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold">{r.ar}</p>
                  <Badge variant="outline" className="text-[10px]">{r.role}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{r.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 text-xs text-blue-800 dark:text-blue-300">
            <Shield className="h-3 w-3 inline ml-1" />
            عزل البيانات: مدير المشروع لا يرى إلا المشاريع المسندة إليه تحديداً (managerId)؛ لا يعتمد المستخدم تقريراً أنشأه بنفسه.
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-5 w-5" />
            الأمن والخصوصية
          </CardTitle>
          <CardDescription className="text-xs">إعدادات الأمن والمصادقة والتشفير</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: 'المصادقة الثنائية (MFA)', desc: 'إلزامية للحسابات الحساسة', enabled: true },
            { label: 'OIDC/OAuth2', desc: 'مزود هوية خارجي', enabled: true },
            { label: 'Row-Level Security', desc: 'عزل بيانات المؤسسات على مستوى الصفوف', enabled: true },
            { label: 'تشفير التخزين', desc: 'AES-256 للبيانات الحساسة', enabled: true },
            { label: 'تشفير النقل', desc: 'TLS 1.3 لجميع الاتصالات', enabled: true },
            { label: 'Webhook Signatures', desc: 'توقيع ومنع replay', enabled: true },
            { label: 'Rate Limiting', desc: 'حد المعدل لكل IP ومستخدم', enabled: true },
            { label: 'WAF', desc: 'جدار حماية تطبيقات الويب', enabled: true },
          ].map((s) => (
            <div key={s.label} className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
              <div>
                <p className="text-sm font-medium">{s.label}</p>
                <p className="text-xs text-muted-foreground">{s.desc}</p>
              </div>
              <Switch defaultChecked={s.enabled} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Integrations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            التكاملات
          </CardTitle>
          <CardDescription className="text-xs">موصلات قابلة للفشل وإعادة المحاولة مع Circuit Breaker</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {[
            { name: 'Hedera', desc: 'توثيق على testnet/mainnet', status: 'connected' },
            { name: 'Open-Meteo', desc: 'بيانات الطقس', status: 'connected' },
            { name: 'NASA POWER', desc: 'الإشعاع الشمسي التاريخي', status: 'connected' },
            { name: 'Huawei FusionSolar', desc: 'API الإنفرترات', status: 'connected' },
            { name: 'SE Email', desc: 'بريد إلكتروني', status: 'connected' },
            { name: 'Webhook Out', desc: 'Webhooks للعملاء', status: 'connected' },
          ].map((i) => (
            <div key={i.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
              <div>
                <p className="text-sm font-semibold">{i.name}</p>
                <p className="text-xs text-muted-foreground">{i.desc}</p>
              </div>
              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900 dark:text-emerald-300">
                متصل
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Data retention */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-5 w-5" />
            الاحتفاظ والنسخ الاحتياطي
          </CardTitle>
          <CardDescription className="text-xs">سياسات احتفظ وحذف وتصدير - RPO/RTO</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-muted/40">
            <p className="text-xs text-muted-foreground mb-1">القراءات الخام</p>
            <p className="font-semibold">7 سنوات</p>
            <p className="text-[10px] text-muted-foreground">Raw payloads</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/40">
            <p className="text-xs text-muted-foreground mb-1">السجلات المطبّعة</p>
            <p className="font-semibold">10 سنوات</p>
            <p className="text-[10px] text-muted-foreground">Normalized readings</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/40">
            <p className="text-xs text-muted-foreground mb-1">سجل التدقيق</p>
            <p className="font-semibold">غير محدود</p>
            <p className="text-[10px] text-muted-foreground">Append-only audit log</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/40">
            <p className="text-xs text-muted-foreground mb-1">RPO</p>
            <p className="font-semibold">15 دقيقة</p>
            <p className="text-[10px] text-muted-foreground">Recovery Point Objective</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/40">
            <p className="text-xs text-muted-foreground mb-1">RTO</p>
            <p className="font-semibold">4 ساعات</p>
            <p className="text-[10px] text-muted-foreground">Recovery Time Objective</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/40">
            <p className="text-xs text-muted-foreground mb-1">النسخ الاحتياطي</p>
            <p className="font-semibold">يومي + أسبوعي</p>
            <p className="text-[10px] text-muted-foreground">مع اختبار استعادة دوري</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

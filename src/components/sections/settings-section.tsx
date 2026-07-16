'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Users, Building2, Globe, Clock, Bell, Shield, Key, Database, Webhook } from 'lucide-react'

export function SettingsSection() {
  return (
    <div className="space-y-4">
      {/* Organization */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            معلومات المؤسسة
          </CardTitle>
          <CardDescription className="text-xs">إعدادات المؤسسة والعملة والمنطقة الزمنية</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">اسم المؤسسة</Label>
            <Input defaultValue="شركة مستقبل مشرق للطاقة" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">الرمز</Label>
            <Input defaultValue="BFEC" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">البلد</Label>
            <Select defaultValue="SA">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SA">السعودية</SelectItem>
                <SelectItem value="AE">الإمارات</SelectItem>
                <SelectItem value="QA">قطر</SelectItem>
                <SelectItem value="KW">الكويت</SelectItem>
                <SelectItem value="BH">البحرين</SelectItem>
                <SelectItem value="OM">عمان</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">العملة</Label>
            <Select defaultValue="SAR">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SAR">ريال سعودي (SAR)</SelectItem>
                <SelectItem value="AED">درهم إماراتي (AED)</SelectItem>
                <SelectItem value="USD">دولار أمريكي (USD)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">المنطقة الزمنية</Label>
            <Select defaultValue="Asia/Riyadh">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Asia/Riyadh">آسيا/الرياض (UTC+3)</SelectItem>
                <SelectItem value="Asia/Dubai">آسيا/دبي (UTC+4)</SelectItem>
                <SelectItem value="Asia/Qatar">آسيا/الدوحة (UTC+3)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">اللغة الافتراضية</Label>
            <Select defaultValue="ar">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ar">العربية</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Members & Roles */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-5 w-5" />
            الأعضاء والأدوار
          </CardTitle>
          <CardDescription className="text-xs">RBAC/ABAC بنطاق المؤسسة والمشروع والأصل - 9 أدوار رئيسية</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {[
              { role: 'Platform Super Admin', ar: 'مدير المنصة الأعلى', desc: 'صلاحية كاملة على جميع المؤسسات' },
              { role: 'Organization Admin', ar: 'مدير المؤسسة', desc: 'إدارة كاملة داخل المؤسسة' },
              { role: 'ESG Manager', ar: 'مدير ESG', desc: 'إدارة الحسابات والتقارير والمنهجيات' },
              { role: 'Project Manager', ar: 'مدير المشروع', desc: 'إدارة مشاريع ومواقع وأصول' },
              { role: 'Monitor/Operator', ar: 'مراقب/مشغّل', desc: 'مراقبة القراءات والأجهزة' },
              { role: 'Auditor/Verifier', ar: 'مدقق/متحقق', desc: 'قراءة فقط + تصديق التقارير' },
              { role: 'Technician', ar: 'فني', desc: 'إدارة الأجهزة الميدانية' },
              { role: 'Viewer', ar: 'مشاهد', desc: 'قراءة فقط للوحات' },
              { role: 'Service Account', ar: 'حساب خدمة', desc: 'تكاملات API وWebhooks' },
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
            فصل الواجبات: لا يعتمد المستخدم تقريراً أو نتيجة حساسة أنشأها بنفسه. وصول الدعم إلى بيانات العملاء مؤقت ومبرر ومسجل.
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

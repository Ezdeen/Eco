'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Loader2, MapPin, Cpu, User, Phone, DollarSign, Building2 } from 'lucide-react'
import { toast } from 'sonner'

interface ProjectFormData {
  name: string
  nameAr: string
  code: string
  inverterSerial: string
  country: string
  city: string
  latitude: string
  longitude: string
  sponsorName: string
  sponsorPhone: string
  currency: string
  capacityKwp: string
  projectType: string
  timezone: string
  tariffRetail: string
  tariffFeedIn: string
}

interface ProjectFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  initialData?: any | null
}

const COUNTRIES = [
  { code: 'SA', name: 'السعودية', cities: ['الرياض', 'جدة', 'الدمام', 'مكة المكرمة', 'المدينة المنورة', 'أبها', 'تبوك', 'بريدة', 'خميس مشيط'] },
  { code: 'AE', name: 'الإمارات', cities: ['دبي', 'أبوظبي', 'الشارقة', 'العين', 'رأس الخيمة'] },
  { code: 'QA', name: 'قطر', cities: ['الدوحة', 'الريان', 'أم صلال'] },
  { code: 'KW', name: 'الكويت', cities: ['الكويت', 'الجهراء', 'حولي'] },
  { code: 'BH', name: 'البحرين', cities: ['المنامة', 'المحرق', 'الرفاع'] },
  { code: 'OM', name: 'عُمان', cities: ['مسقط', 'صلالة', 'نزوى'] },
  { code: 'EG', name: 'مصر', cities: ['القاهرة', 'الإسكندرية', 'أسوان', 'الأقصر'] },
  { code: 'JO', name: 'الأردن', cities: ['عمّان', 'الزرقاء', 'العقبة'] },
]

const CURRENCIES = [
  { code: 'SAR', name: 'ريال سعودي' },
  { code: 'AED', name: 'درهم إماراتي' },
  { code: 'QAR', name: 'ريال قطري' },
  { code: 'KWD', name: 'دينار كويتي' },
  { code: 'BHD', name: 'دينار بحريني' },
  { code: 'OMR', name: 'ريال عماني' },
  { code: 'EGP', name: 'جنيه مصري' },
  { code: 'JOD', name: 'دينار أردني' },
  { code: 'USD', name: 'دولار أمريكي' },
]

const EMPTY_FORM: ProjectFormData = {
  name: '',
  nameAr: '',
  code: '',
  inverterSerial: '',
  country: 'SA',
  city: '',
  latitude: '',
  longitude: '',
  sponsorName: '',
  sponsorPhone: '',
  currency: 'SAR',
  capacityKwp: '',
  projectType: 'solar_pv',
  timezone: 'Asia/Riyadh',
  tariffRetail: '',
  tariffFeedIn: '',
}

export function ProjectFormModal({ open, onOpenChange, onSaved, initialData }: ProjectFormModalProps) {
  const [form, setForm] = useState<ProjectFormData>(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const isEditMode = !!initialData

  useEffect(() => {
    if (initialData) {
      setForm({
        name: initialData.name || '',
        nameAr: initialData.nameAr || '',
        code: initialData.code || '',
        inverterSerial: initialData.inverterSerial || '',
        country: initialData.country || 'SA',
        city: initialData.city || '',
        latitude: initialData.latitude?.toString() || '',
        longitude: initialData.longitude?.toString() || '',
        sponsorName: initialData.sponsorName || '',
        sponsorPhone: initialData.sponsorPhone || '',
        currency: initialData.currency || 'SAR',
        capacityKwp: initialData.capacityKwp?.toString() || '',
        projectType: initialData.projectType || 'solar_pv',
        timezone: initialData.timezone || 'Asia/Riyadh',
        tariffRetail: initialData.tariffRetail?.toString() || '',
        tariffFeedIn: initialData.tariffFeedIn?.toString() || '',
      })
    } else {
      setForm(EMPTY_FORM)
    }
    setErrors({})
  }, [initialData, open])

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!form.name.trim()) newErrors.name = 'اسم المشروع مطلوب'
    if (!form.code.trim()) newErrors.code = 'رمز المشروع مطلوب'
    if (!form.inverterSerial.trim()) newErrors.inverterSerial = 'سيريال نمبر الإنفرتر مطلوب'
    if (!form.country) newErrors.country = 'الدولة مطلوبة'
    if (!form.city.trim()) newErrors.city = 'المدينة مطلوبة'

    if (!form.latitude.trim()) {
      newErrors.latitude = 'عرض الموقع مطلوب'
    } else {
      const lat = parseFloat(form.latitude)
      if (isNaN(lat) || lat < -90 || lat > 90) {
        newErrors.latitude = 'العرض يجب أن يكون بين -90 و 90'
      }
    }

    if (!form.longitude.trim()) {
      newErrors.longitude = 'طول الموقع مطلوب'
    } else {
      const lng = parseFloat(form.longitude)
      if (isNaN(lng) || lng < -180 || lng > 180) {
        newErrors.longitude = 'الطول يجب أن يكون بين -180 و 180'
      }
    }

    if (form.capacityKwp && (isNaN(parseFloat(form.capacityKwp)) || parseFloat(form.capacityKwp) <= 0)) {
      newErrors.capacityKwp = 'القدرة يجب أن تكون رقمًا موجبًا'
    }

    if (form.sponsorPhone && form.sponsorPhone.length < 6) {
      newErrors.sponsorPhone = 'رقم الهاتف غير صحيح'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validate()) {
      toast.error('يرجى تصحيح الأخطاء في النموذج')
      return
    }

    setLoading(true)

    try {
      const url = isEditMode ? `/api/projects/${initialData.id}` : '/api/projects'
      const method = isEditMode ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'فشل حفظ المشروع')
        return
      }

      toast.success(isEditMode ? 'تم تحديث المشروع بنجاح' : 'تم إنشاء المشروع بنجاح')
      onOpenChange(false)
      onSaved()
    } catch (err) {
      toast.error('حدث خطأ في الاتصال')
    } finally {
      setLoading(false)
    }
  }

  const updateField = (field: keyof ProjectFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const availableCities = COUNTRIES.find((c) => c.code === form.country)?.cities || []

  const handleCountryChange = (code: string) => {
    updateField('country', code)
    const tzMap: Record<string, string> = {
      SA: 'Asia/Riyadh',
      AE: 'Asia/Dubai',
      QA: 'Asia/Qatar',
      KW: 'Asia/Kuwait',
      BH: 'Asia/Bahrain',
      OM: 'Asia/Muscat',
      EG: 'Africa/Cairo',
      JO: 'Asia/Amman',
    }
    if (tzMap[code]) updateField('timezone', tzMap[code])
    updateField('city', '')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            {isEditMode ? 'تعديل المشروع' : 'إنشاء مشروع جديد'}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'عدّل بيانات المشروع ثم اضغط حفظ'
              : 'أدخل بيانات المشروع الجديد. الحقول المؤشّرة بـ * مطلوبة.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Project Identification */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">معلومات المشروع</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs">
                  اسم المشروع <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  placeholder="Riyadh Solar Park Phase 1"
                  className={errors.name ? 'border-red-500' : ''}
                  required
                />
                {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nameAr" className="text-xs">الاسم بالعربية</Label>
                <Input
                  id="nameAr"
                  value={form.nameAr}
                  onChange={(e) => updateField('nameAr', e.target.value)}
                  placeholder="مجمعة الرياض الشمسية - المرحلة 1"
                  dir="rtl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="code" className="text-xs">
                  رمز المشروع <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="code"
                  value={form.code}
                  onChange={(e) => updateField('code', e.target.value.toUpperCase())}
                  placeholder="RYD-P1"
                  className={`font-mono ${errors.code ? 'border-red-500' : ''}`}
                  required
                />
                {errors.code && <p className="text-xs text-red-500">{errors.code}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="projectType" className="text-xs">نوع المشروع</Label>
                <Select value={form.projectType} onValueChange={(v) => updateField('projectType', v)}>
                  <SelectTrigger id="projectType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="solar_pv">طاقة شمسية كهروضوئية (PV)</SelectItem>
                    <SelectItem value="solar_thermal">طاقة شمسية حرارية</SelectItem>
                    <SelectItem value="bess">تخزين بالبطاريات (BESS)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Separator />

          {/* Inverter */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">جهاز الإنفرتر</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="inverterSerial" className="text-xs">
                  سيريال نمبر الإنفرتر <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="inverterSerial"
                  value={form.inverterSerial}
                  onChange={(e) => updateField('inverterSerial', e.target.value)}
                  placeholder="SN-INV-XXXXXXX"
                  className={`font-mono ${errors.inverterSerial ? 'border-red-500' : ''}`}
                  required
                  dir="ltr"
                />
                {errors.inverterSerial && <p className="text-xs text-red-500">{errors.inverterSerial}</p>}
                <p className="text-[10px] text-muted-foreground">
                  سيريال نمبر فريد لكل إنفرتر - يُستخدم لمنع التكرار
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="capacityKwp" className="text-xs">القدرة المنصوبة (kWp)</Label>
                <Input
                  id="capacityKwp"
                  type="number"
                  step="0.1"
                  value={form.capacityKwp}
                  onChange={(e) => updateField('capacityKwp', e.target.value)}
                  placeholder="5000"
                  className={errors.capacityKwp ? 'border-red-500' : ''}
                />
                {errors.capacityKwp && <p className="text-xs text-red-500">{errors.capacityKwp}</p>}
              </div>
            </div>
          </div>

          <Separator />

          {/* Location */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">الموقع الجغرافي</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="country" className="text-xs">
                  الدولة <span className="text-red-500">*</span>
                </Label>
                <Select value={form.country} onValueChange={handleCountryChange}>
                  <SelectTrigger id="country" className={errors.country ? 'border-red-500' : ''}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="city" className="text-xs">
                  المدينة <span className="text-red-500">*</span>
                </Label>
                <Select value={form.city} onValueChange={(v) => updateField('city', v)}>
                  <SelectTrigger id="city" className={errors.city ? 'border-red-500' : ''}>
                    <SelectValue placeholder="اختر المدينة" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCities.map((city) => (
                      <SelectItem key={city} value={city}>
                        {city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.city && <p className="text-xs text-red-500">{errors.city}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="latitude" className="text-xs">
                  إحداثي العرض (Latitude) <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="latitude"
                  type="number"
                  step="any"
                  value={form.latitude}
                  onChange={(e) => updateField('latitude', e.target.value)}
                  placeholder="24.7136"
                  className={`font-mono ${errors.latitude ? 'border-red-500' : ''}`}
                  required
                  dir="ltr"
                />
                {errors.latitude && <p className="text-xs text-red-500">{errors.latitude}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="longitude" className="text-xs">
                  إحداثي الطول (Longitude) <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="longitude"
                  type="number"
                  step="any"
                  value={form.longitude}
                  onChange={(e) => updateField('longitude', e.target.value)}
                  placeholder="46.6753"
                  className={`font-mono ${errors.longitude ? 'border-red-500' : ''}`}
                  required
                  dir="ltr"
                />
                {errors.longitude && <p className="text-xs text-red-500">{errors.longitude}</p>}
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              الإحداثيات تُستخدم لتحديد منطقة الطقس والإشعاع الشمسي وحساب الإنتاج المتوقع
            </p>
          </div>

          <Separator />

          {/* Sponsor / Observer */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">المراقب / الممول</h3>
              <Badge variant="outline" className="text-[10px]">جهة إقراض أو بنك</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              الجهة الممولة للمشروع (بنك، جهة إقراض، مستثمر مؤسسي) التي تراقب الأداء المالي والبيئي
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sponsorName" className="text-xs">اسم المراقب / الممول</Label>
                <Input
                  id="sponsorName"
                  value={form.sponsorName}
                  onChange={(e) => updateField('sponsorName', e.target.value)}
                  placeholder="بنك التنمية الصناعية السعودية"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sponsorPhone" className="text-xs">رقم المراقب / الممول</Label>
                <div className="relative">
                  <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="sponsorPhone"
                    type="tel"
                    value={form.sponsorPhone}
                    onChange={(e) => updateField('sponsorPhone', e.target.value)}
                    placeholder="+966 11 555 1234"
                    className={`pr-9 ${errors.sponsorPhone ? 'border-red-500' : ''}`}
                    dir="ltr"
                  />
                </div>
                {errors.sponsorPhone && <p className="text-xs text-red-500">{errors.sponsorPhone}</p>}
              </div>
            </div>
          </div>

          <Separator />

          {/* Financial */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">المالية</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="currency" className="text-xs">العملة</Label>
                <Select value={form.currency} onValueChange={(v) => updateField('currency', v)}>
                  <SelectTrigger id="currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.name} ({c.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tariffRetail" className="text-xs">تعرفة البيع (لكل kWh)</Label>
                <Input
                  id="tariffRetail"
                  type="number"
                  step="0.01"
                  value={form.tariffRetail}
                  onChange={(e) => updateField('tariffRetail', e.target.value)}
                  placeholder="0.18"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tariffFeedIn" className="text-xs">تعرفة Feed-in (لكل kWh)</Label>
                <Input
                  id="tariffFeedIn"
                  type="number"
                  step="0.01"
                  value={form.tariffFeedIn}
                  onChange={(e) => updateField('tariffFeedIn', e.target.value)}
                  placeholder="0.10"
                  dir="ltr"
                />
              </div>
            </div>
          </div>
        </form>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            إلغاء
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="bg-primary"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 ml-1 animate-spin" />
                {isEditMode ? 'جاري التحديث...' : 'جاري الإنشاء...'}
              </>
            ) : (
              <>{isEditMode ? 'حفظ التعديلات' : 'إنشاء المشروع'}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

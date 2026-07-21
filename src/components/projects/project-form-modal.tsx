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
import { Loader2, MapPin, Cpu, User, Phone, DollarSign, Building2, TreePine, Radio, Wifi } from 'lucide-react'
import { toast } from 'sonner'

interface ProjectFormData {
  name: string
  nameAr: string
  code: string
  inverterSerial: string
  inverterType: string
  country: string
  city: string
  cityOther: string
  latitude: string
  longitude: string
  sponsorName: string
  sponsorPhone: string
  managerId: string
  currency: string
  capacityKwp: string
  projectType: string
  timezone: string
  tariffRetail: string
  tariffFeedIn: string
  // Afforestation fields
  treeSpecies: string
  treeCount: string
  plantedAreaM2: string
  plantingDate: string
  survivalRateTarget: string
  // IoT fields
  iotSensorType: string
  iotSensorModel: string
  iotSensorSerial: string
  iotGatewayId: string
  iotProtocol: string
  iotDataFrequency: string
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
  { code: 'PS', name: 'فلسطين', cities: ['رام الله', 'غزة', 'الخليل', 'نابلس', 'بيت لحم', 'جنين', 'أريحا', 'طولكرم', 'قلقيلية'] },
]

const PROJECT_TYPES = [
  { code: 'grid_tied', name: 'نظام طاقة شمسية مرتبط بالشبكة', desc: 'Grid-Tied - يصدّر الفائض للشبكة', icon: '🔌', needsInverter: true, needsBattery: false, isAfforestation: false },
  { code: 'hybrid', name: 'نظام طاقة شمسية هجين', desc: 'Hybrid - مرتبط بالشبكة + بطاريات تخزين', icon: '⚡', needsInverter: true, needsBattery: true, isAfforestation: false },
  { code: 'off_grid', name: 'نظام طاقة شمسية مستقل (بطاريات)', desc: 'Off-Grid - منفصل عن الشبكة، يعتمد على البطاريات', icon: '🔋', needsInverter: true, needsBattery: true, isAfforestation: false },
  { code: 'afforestation', name: 'مشروع تشجير', desc: 'Afforestation - زراعة الأشجار مع مستشعرات IoT', icon: '🌳', needsInverter: false, needsBattery: false, isAfforestation: true },
]

const INVERTER_TYPES = [
  { code: 'string', name: 'String Inverter - إنفرتر سلسلة', desc: 'مناسب للمشاريع الصغيرة والمتوسطة' },
  { code: 'central', name: 'Central Inverter - إنفرتر مركزي', desc: 'مناسب لمحطات الطاقة الكبيرة' },
  { code: 'micro', name: 'Microinverter - إنفرتر مصغّر', desc: 'إنفرتر لكل لوح، مناسب للأسطح' },
  { code: 'hybrid', name: 'Hybrid Inverter - إنفرتر هجين', desc: 'يدعم تخزين البطاريات' },
  { code: 'battery', name: 'Battery Inverter - إنفرتر بطاريات', desc: 'مخصص لأنظمة التخزين' },
]

const IOT_SENSOR_TYPES = [
  { code: 'soil_moisture', name: 'رطوبة التربة - Soil Moisture', desc: 'قياس نسبة الرطوبة في التربة' },
  { code: 'temperature', name: 'درجة الحرارة - Temperature', desc: 'قياس حرارة التربة والهواء' },
  { code: 'humidity', name: 'الرطوبة الجوية - Humidity', desc: 'قياس رطوبة الهواء المحيط' },
  { code: 'co2', name: 'ثاني أكسيد الكربون - CO₂', desc: 'قياس امتصاص CO₂ من الأشجار' },
  { code: 'growth', name: 'معدل النمو - Growth', desc: 'قياس نمو الأشجار والقطر' },
  { code: 'leaf_wetness', name: 'رطوبة الأوراق - Leaf Wetness', desc: 'كشف الأمراض النباتية' },
  { code: 'ph', name: 'حموضة التربة - pH', desc: 'قياس درجة حموضة التربة' },
  { code: 'ec', name: 'التوصيل الكهربائي - EC', desc: 'قياس ملوحة التربة' },
]

const IOT_PROTOCOLS = [
  { code: 'lora', name: 'LoRaWAN - مسافات طويلة، استهلاك منخفض' },
  { code: 'wifi', name: 'WiFi - شبكة محلية' },
  { code: 'gsm', name: 'GSM/4G - شبكة خلوية' },
  { code: 'nb_iot', name: 'NB-IoT - إنترنت الأشياء بشبكة خلوية' },
  { code: 'sigfox', name: 'Sigfox - شبكة LPWAN' },
  { code: 'zigbee', name: 'Zigbee - شبكة شبكية قصيرة المدى' },
]

const IOT_DATA_FREQUENCIES = [
  { code: 'realtime', name: 'كل 5 دقائق (وقت حقيقي)' },
  { code: 'hourly', name: 'كل ساعة' },
  { code: 'daily', name: 'يوميًا' },
  { code: 'weekly', name: 'أسبوعيًا' },
]

const TREE_SPECIES_EXAMPLES = [
  'السدر (Ziziphus spina-christi)',
  'الغاف (Prosopis cineraria)',
  'الأثل (Tamarix)',
  'السمر (Acacia tortilis)',
  'العرعر (Juniperus)',
  'الزيتون (Olea europaea)',
  'النخيل (Phoenix dactylifera)',
  'اللوز (Prunus dulcis)',
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
  { code: 'ILS', name: 'شيكل إسرائيلي' },
  { code: 'USD', name: 'دولار أمريكي' },
]

const EMPTY_FORM: ProjectFormData = {
  name: '',
  nameAr: '',
  code: '',
  inverterSerial: '',
  inverterType: 'string',
  country: 'SA',
  city: '',
  cityOther: '',
  latitude: '',
  longitude: '',
  sponsorName: '',
  sponsorPhone: '',
  managerId: '',
  currency: 'SAR',
  capacityKwp: '',
  projectType: 'grid_tied',
  timezone: 'Asia/Riyadh',
  tariffRetail: '',
  tariffFeedIn: '',
  // Afforestation fields
  treeSpecies: '',
  treeCount: '',
  plantedAreaM2: '',
  plantingDate: '',
  survivalRateTarget: '85',
  // IoT fields
  iotSensorType: 'soil_moisture',
  iotSensorModel: '',
  iotSensorSerial: '',
  iotGatewayId: '',
  iotProtocol: 'lora',
  iotDataFrequency: 'daily',
}

export function ProjectFormModal({ open, onOpenChange, onSaved, initialData }: ProjectFormModalProps) {
  const [form, setForm] = useState<ProjectFormData>(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [managers, setManagers] = useState<{ id: string; name: string; email: string }[]>([])
  const isEditMode = !!initialData

  useEffect(() => {
    if (open) {
      fetch('/api/users/project-managers')
        .then((r) => { if (!r.ok) throw new Error(); return r.json() })
        .then((d) => setManagers(d?.managers || []))
        .catch(() => setManagers([]))
    }
  }, [open])

  useEffect(() => {
    if (initialData) {
      // Check if city is in the country's predefined list; if not, mark as "other"
      const countryCities = COUNTRIES.find((c) => c.code === initialData.country)?.cities || []
      const isCustomCity = initialData.city && !countryCities.includes(initialData.city)

      setForm({
        name: initialData.name || '',
        nameAr: initialData.nameAr || '',
        code: initialData.code || '',
        inverterSerial: initialData.inverterSerial || '',
        inverterType: initialData.inverterType || 'string',
        country: initialData.country || 'SA',
        city: isCustomCity ? '__other__' : initialData.city || '',
        cityOther: isCustomCity ? initialData.city : '',
        latitude: initialData.latitude?.toString() || '',
        longitude: initialData.longitude?.toString() || '',
        sponsorName: initialData.sponsorName || '',
        sponsorPhone: initialData.sponsorPhone || '',
        managerId: initialData.managerId || '',
        currency: initialData.currency || 'SAR',
        capacityKwp: initialData.capacityKwp?.toString() || '',
        projectType: initialData.projectType || 'grid_tied',
        timezone: initialData.timezone || 'Asia/Riyadh',
        tariffRetail: initialData.tariffRetail?.toString() || '',
        tariffFeedIn: initialData.tariffFeedIn?.toString() || '',
        // Afforestation
        treeSpecies: initialData.treeSpecies || '',
        treeCount: initialData.treeCount?.toString() || '',
        plantedAreaM2: initialData.plantedAreaM2?.toString() || '',
        plantingDate: initialData.plantingDate ? initialData.plantingDate.slice(0, 10) : '',
        survivalRateTarget: initialData.survivalRateTarget ? (initialData.survivalRateTarget * 100).toString() : '85',
        // IoT
        iotSensorType: initialData.iotSensorType || 'soil_moisture',
        iotSensorModel: initialData.iotSensorModel || '',
        iotSensorSerial: initialData.iotSensorSerial || '',
        iotGatewayId: initialData.iotGatewayId || '',
        iotProtocol: initialData.iotProtocol || 'lora',
        iotDataFrequency: initialData.iotDataFrequency || 'daily',
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
    if (!form.country) newErrors.country = 'الدولة مطلوبة'

    // City validation
    if (!form.city) {
      newErrors.city = 'المدينة مطلوبة'
    } else if (form.city === '__other__' && !form.cityOther.trim()) {
      newErrors.cityOther = 'يرجى إدخال اسم المدينة'
    }

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

    // Type-specific validation
    const projectType = PROJECT_TYPES.find((t) => t.code === form.projectType)
    if (projectType?.needsInverter) {
      if (!form.inverterSerial.trim()) newErrors.inverterSerial = 'سيريال نمبر الإنفرتر مطلوب لمشاريع الطاقة الشمسية'
      if (!form.inverterType) newErrors.inverterType = 'نوع الإنفرتر مطلوب'
      if (form.capacityKwp && (isNaN(parseFloat(form.capacityKwp)) || parseFloat(form.capacityKwp) <= 0)) {
        newErrors.capacityKwp = 'القدرة يجب أن تكون رقمًا موجبًا'
      }
    }

    if (projectType?.isAfforestation) {
      if (!form.treeSpecies.trim()) newErrors.treeSpecies = 'نوع الأشجار مطلوب لمشاريع التشجير'
      if (!form.treeCount || parseInt(form.treeCount) <= 0) {
        newErrors.treeCount = 'عدد الأشجار يجب أن يكون رقمًا موجبًا'
      }
      if (!form.plantedAreaM2 || parseFloat(form.plantedAreaM2) <= 0) {
        newErrors.plantedAreaM2 = 'المساحة المزروعة يجب أن تكون رقمًا موجبًا'
      }
      if (!form.plantingDate) newErrors.plantingDate = 'تاريخ الزراعة مطلوب'
      // IoT sensor is optional but if serial provided, type is required
      if (form.iotSensorSerial && !form.iotSensorType) {
        newErrors.iotSensorType = 'نوع المستشعر مطلوب عند إدخال سيريال'
      }
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

      // Resolve final city value
      const finalCity = form.city === '__other__' ? form.cityOther.trim() : form.city

      const payload: any = {
        ...form,
        city: finalCity,
        cityOther: undefined,
        // Convert survivalRateTarget from percentage to decimal
        survivalRateTarget: form.survivalRateTarget ? parseFloat(form.survivalRateTarget) / 100 : null,
        // Convert numbers
        treeCount: form.treeCount ? parseInt(form.treeCount) : null,
        plantedAreaM2: form.plantedAreaM2 ? parseFloat(form.plantedAreaM2) : null,
        plantingDate: form.plantingDate || null,
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
      PS: 'Asia/Hebron',
    }
    if (tzMap[code]) updateField('timezone', tzMap[code])
    updateField('city', '')
    updateField('cityOther', '')
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
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="projectType" className="text-xs">
                  نوع المشروع <span className="text-red-500">*</span>
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {PROJECT_TYPES.map((t) => (
                    <button
                      key={t.code}
                      type="button"
                      onClick={() => updateField('projectType', t.code)}
                      className={`p-3 rounded-lg border-2 text-right transition-all ${
                        form.projectType === t.code
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-2xl">{t.icon}</span>
                        <span className="text-sm font-semibold">{t.name}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Inverter section - only for solar projects */}
          {PROJECT_TYPES.find((t) => t.code === form.projectType)?.needsInverter && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">جهاز الإنفرتر</h3>
                </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="inverterType" className="text-xs">
                  نوع الإنفرتر <span className="text-red-500">*</span>
                </Label>
                <Select value={form.inverterType} onValueChange={(v) => updateField('inverterType', v)}>
                  <SelectTrigger id="inverterType" className={errors.inverterType ? 'border-red-500' : ''}>
                    <SelectValue placeholder="اختر نوع الإنفرتر" />
                  </SelectTrigger>
                  <SelectContent>
                    {INVERTER_TYPES.map((t) => (
                      <SelectItem key={t.code} value={t.code}>
                        <div className="flex flex-col">
                          <span>{t.name}</span>
                          <span className="text-[10px] text-muted-foreground">{t.desc}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.inverterType && <p className="text-xs text-red-500">{errors.inverterType}</p>}
              </div>
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
              <div className="space-y-1.5 md:col-span-2">
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
            </>
          )}

          {/* Afforestation section - only for afforestation projects */}
          {PROJECT_TYPES.find((t) => t.code === form.projectType)?.isAfforestation && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <TreePine className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">معلومات التشجير</h3>
                  <Badge variant="outline" className="text-[10px] bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300">
                    مشروع تشجير
                  </Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="treeSpecies" className="text-xs">
                      نوع الأشجار <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="treeSpecies"
                      value={form.treeSpecies}
                      onChange={(e) => updateField('treeSpecies', e.target.value)}
                      placeholder="مثال: السدر (Ziziphus spina-christi)"
                      list="treeSpeciesList"
                      className={errors.treeSpecies ? 'border-red-500' : ''}
                      required
                    />
                    <datalist id="treeSpeciesList">
                      {TREE_SPECIES_EXAMPLES.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                    {errors.treeSpecies && <p className="text-xs text-red-500">{errors.treeSpecies}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="treeCount" className="text-xs">
                      عدد الأشجار <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="treeCount"
                      type="number"
                      min="1"
                      value={form.treeCount}
                      onChange={(e) => updateField('treeCount', e.target.value)}
                      placeholder="1000"
                      className={errors.treeCount ? 'border-red-500' : ''}
                      required
                    />
                    {errors.treeCount && <p className="text-xs text-red-500">{errors.treeCount}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="plantedAreaM2" className="text-xs">
                      المساحة المزروعة (م²) <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="plantedAreaM2"
                      type="number"
                      step="0.1"
                      min="0"
                      value={form.plantedAreaM2}
                      onChange={(e) => updateField('plantedAreaM2', e.target.value)}
                      placeholder="5000"
                      className={errors.plantedAreaM2 ? 'border-red-500' : ''}
                      required
                    />
                    {errors.plantedAreaM2 && <p className="text-xs text-red-500">{errors.plantedAreaM2}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="plantingDate" className="text-xs">
                      تاريخ الزراعة <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="plantingDate"
                      type="date"
                      value={form.plantingDate}
                      onChange={(e) => updateField('plantingDate', e.target.value)}
                      className={errors.plantingDate ? 'border-red-500' : ''}
                      required
                    />
                    {errors.plantingDate && <p className="text-xs text-red-500">{errors.plantingDate}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="survivalRateTarget" className="text-xs">
                      النسبة المستهدفة لمعدل البقاء (%)
                    </Label>
                    <Input
                      id="survivalRateTarget"
                      type="number"
                      min="0"
                      max="100"
                      value={form.survivalRateTarget}
                      onChange={(e) => updateField('survivalRateTarget', e.target.value)}
                      placeholder="85"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      النسبة المئوية المتوقعة لبقاء الأشجار حية بعد السنة الأولى
                    </p>
                  </div>
                </div>
              </div>

              {/* IoT Sensors section - for afforestation */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Radio className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">مستشعرات إنترنت الأشياء (IoT)</h3>
                  <Badge variant="outline" className="text-[10px] bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300">
                    اختياري - لمراقبة الأشجار
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  مستشعرات IoT ترسل بيانات دورية (رطوبة التربة، درجة الحرارة، نمو الأشجار، امتصاص CO₂) لمراقبة صحة الأشجار ومعدل بقائها
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="iotSensorType" className="text-xs">نوع المستشعر</Label>
                    <Select value={form.iotSensorType} onValueChange={(v) => updateField('iotSensorType', v)}>
                      <SelectTrigger id="iotSensorType" className={errors.iotSensorType ? 'border-red-500' : ''}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {IOT_SENSOR_TYPES.map((s) => (
                          <SelectItem key={s.code} value={s.code}>
                            <div className="flex flex-col">
                              <span>{s.name}</span>
                              <span className="text-[10px] text-muted-foreground">{s.desc}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.iotSensorType && <p className="text-xs text-red-500">{errors.iotSensorType}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="iotSensorModel" className="text-xs">موديل المستشعر</Label>
                    <Input
                      id="iotSensorModel"
                      value={form.iotSensorModel}
                      onChange={(e) => updateField('iotSensorModel', e.target.value)}
                      placeholder="مثال: Decagon EC-5, Davis 6440"
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="iotSensorSerial" className="text-xs">سيريال نمبر المستشعر</Label>
                    <Input
                      id="iotSensorSerial"
                      value={form.iotSensorSerial}
                      onChange={(e) => updateField('iotSensorSerial', e.target.value)}
                      placeholder="SN-SENSOR-XXXXX"
                      className="font-mono"
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="iotGatewayId" className="text-xs">معرّف بوابة IoT</Label>
                    <Input
                      id="iotGatewayId"
                      value={form.iotGatewayId}
                      onChange={(e) => updateField('iotGatewayId', e.target.value)}
                      placeholder="GW-001 أو MAC address"
                      className="font-mono"
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="iotProtocol" className="text-xs">بروتوكول الاتصال</Label>
                    <Select value={form.iotProtocol} onValueChange={(v) => updateField('iotProtocol', v)}>
                      <SelectTrigger id="iotProtocol">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {IOT_PROTOCOLS.map((p) => (
                          <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="iotDataFrequency" className="text-xs">تردد إرسال البيانات</Label>
                    <Select value={form.iotDataFrequency} onValueChange={(v) => updateField('iotDataFrequency', v)}>
                      <SelectTrigger id="iotDataFrequency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {IOT_DATA_FREQUENCIES.map((f) => (
                          <SelectItem key={f.code} value={f.code}>{f.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 text-xs text-blue-800 dark:text-blue-300">
                  <Wifi className="h-3 w-3 inline ml-1" />
                  <strong>ملاحظة:</strong> سيتم إنشاء جهاز IoT تلقائيًا عند حفظ المشروع إذا أدخلت سيريال نمبر المستشعر.
                  البيانات المستلمة من المستشعر تُخزَّن كقراءات في النظام وتُعرض في مركز البيانات.
                </div>
              </div>
            </>
          )}

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
                    <SelectItem value="__other__">+ مدينة أخرى (إدخال يدوي)</SelectItem>
                  </SelectContent>
                </Select>
                {errors.city && <p className="text-xs text-red-500">{errors.city}</p>}
                {form.city === '__other__' && (
                  <Input
                    type="text"
                    value={form.cityOther}
                    onChange={(e) => updateField('cityOther', e.target.value)}
                    placeholder="أدخل اسم المدينة"
                    className={`mt-2 ${errors.cityOther ? 'border-red-500' : ''}`}
                  />
                )}
                {errors.cityOther && <p className="text-xs text-red-500">{errors.cityOther}</p>}
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
            <div className="space-y-1.5">
              <Label htmlFor="managerId" className="text-xs">مدير المشروع المسؤول</Label>
              <Select value={form.managerId} onValueChange={(v) => updateField('managerId', v)}>
                <SelectTrigger id="managerId">
                  <SelectValue placeholder="اختر مدير المشروع" />
                </SelectTrigger>
                <SelectContent>
                  {managers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} ({m.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                ربط المشروع بمدير مشروع محدد يحصر وصوله على بيانات هذا المشروع فقط (عزل البيانات)
              </p>
            </div>
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

'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calculator, Zap, Droplet, Loader2, Leaf, History } from 'lucide-react'
import { toast } from 'sonner'

const COUNTRIES = [
  { code: 'SA', name: 'السعودية' },
  { code: 'AE', name: 'الإمارات' },
  { code: 'QA', name: 'قطر' },
  { code: 'KW', name: 'الكويت' },
  { code: 'BH', name: 'البحرين' },
  { code: 'OM', name: 'عُمان' },
  { code: 'EG', name: 'مصر' },
  { code: 'JO', name: 'الأردن' },
  { code: 'PS', name: 'فلسطين' },
]

interface BaselineRecord {
  id: string
  category: 'RENEWABLE_ENERGY' | 'WATER_SUSTAINABILITY'
  status: string
  baselinePeriodMonths: number
  totalEnergyKwh: number | null
  totalWaterLiters: number | null
  baselineCo2eTons: number
  waterIntensityPerSqm: number | null
  emissionFactorSource: string | null
  createdAt: string
}

interface FormState {
  category: 'RENEWABLE_ENERGY' | 'WATER_SUSTAINABILITY'
  baselinePeriodMonths: string
  gridRegionOrCountry: string
  // energy
  monthlyElectricityBill: string
  electricityRate: string
  // water
  waterBill: string
  waterRatePerLiter: string
  pumpOperatingHoursPerDay: string
  pumpPowerCapacityKw: string
  pumpEnergyKwhPerM3: string
  landAreaValue: string
  landAreaUnit: 'sqm' | 'hectares'
  cropType: string
}

const EMPTY_FORM: FormState = {
  category: 'RENEWABLE_ENERGY',
  baselinePeriodMonths: '12',
  gridRegionOrCountry: 'SA',
  monthlyElectricityBill: '',
  electricityRate: '',
  waterBill: '',
  waterRatePerLiter: '',
  pumpOperatingHoursPerDay: '',
  pumpPowerCapacityKw: '',
  pumpEnergyKwhPerM3: '',
  landAreaValue: '',
  landAreaUnit: 'sqm',
  cropType: '',
}

/**
 * حاسبة خط الأساس البيئي (dMRV Baseline Impact Calculator) لمشروع قائم مسبقًا (Legacy)
 * ينتقل إلى حل أخضر. تُدخِل المنشأة بياناتها التاريخية الموجودة أصلاً (فاتورة كهرباء/مياه)
 * دون أي كلفة إضافية، فتُحسب "الحالة قبل" التي تُقارَن بها كل قراءات ما بعد التركيب
 * الفعلية (Before vs. After) في التقارير والتحقق من خفض الكربون.
 */
export function ProjectBaselineCalculator({ projectId, projectType }: { projectId: string; projectType?: string }) {
  const [current, setCurrent] = useState<BaselineRecord | null>(null)
  const [history, setHistory] = useState<BaselineRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const fetchBaseline = () => {
    setLoading(true)
    fetch(`/api/projects/${projectId}/baseline`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then((d) => {
        setCurrent(d.current || null)
        setHistory(d.history || [])
      })
      .catch(() => toast.error('تعذّر جلب خط الأساس البيئي'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (projectId) fetchBaseline()
    // اختيار فئة افتراضية منطقية بحسب نوع المشروع
    if (projectType === 'smart_irrigation') {
      setForm((f) => ({ ...f, category: 'WATER_SUSTAINABILITY' }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, projectType])

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const handleCalculate = async () => {
    const body: Record<string, unknown> = {
      category: form.category,
      baselinePeriodMonths: Number(form.baselinePeriodMonths) || undefined,
      gridRegionOrCountry: form.gridRegionOrCountry,
    }

    if (form.category === 'RENEWABLE_ENERGY') {
      if (!form.monthlyElectricityBill || !form.electricityRate) {
        toast.error('أدخل فاتورة الكهرباء الشهرية وتعرفة الكيلوواط/ساعة')
        return
      }
      body.monthlyElectricityBill = Number(form.monthlyElectricityBill)
      body.electricityRate = Number(form.electricityRate)
    } else {
      const hasWaterBill = form.waterBill && form.waterRatePerLiter
      const hasPumpData = form.pumpPowerCapacityKw && form.pumpOperatingHoursPerDay
      if (!hasWaterBill && !hasPumpData) {
        toast.error('أدخل إما فاتورة المياه وتعرفة اللتر، أو قدرة المضخة وساعات التشغيل اليومية')
        return
      }
      if (!form.landAreaValue) {
        toast.error('أدخل مساحة الأرض المروية')
        return
      }
      if (hasWaterBill) {
        body.waterBill = Number(form.waterBill)
        body.waterRatePerLiter = Number(form.waterRatePerLiter)
      }
      if (hasPumpData) {
        body.pumpPowerCapacityKw = Number(form.pumpPowerCapacityKw)
        body.pumpOperatingHoursPerDay = Number(form.pumpOperatingHoursPerDay)
        if (form.pumpEnergyKwhPerM3) body.pumpEnergyKwhPerM3 = Number(form.pumpEnergyKwhPerM3)
      }
      body.landAreaValue = Number(form.landAreaValue)
      body.landAreaUnit = form.landAreaUnit
      if (form.cropType) body.cropType = form.cropType
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/baseline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'فشل احتساب خط الأساس')
        return
      }
      toast.success('تم احتساب خط الأساس البيئي وحفظه')
      if (data.warnings?.length) {
        data.warnings.forEach((w: string) => toast.warning(w))
      }
      setShowForm(false)
      fetchBaseline()
    } catch {
      toast.error('خطأ في الاتصال')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Calculator className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">خط الأساس البيئي (Before State)</h3>
        <Badge variant="outline" className="text-[10px]">dMRV Baseline</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        احتسب الأثر البيئي "قبل" اعتماد الحل الأخضر من بيانات تاريخية موجودة لديك أصلاً (فاتورة كهرباء أو مياه)
        دون أي كلفة إضافية — ليصبح مرجع المقارنة الرسمي مع قراءات العدادات الفعلية بعد التركيب (Before vs. After)
        في تقارير ESG والتحقق من خفض الكربون.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin ml-2" /> جاري التحميل...
        </div>
      ) : current ? (
        <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium">
              {current.category === 'RENEWABLE_ENERGY' ? (
                <Zap className="h-3.5 w-3.5 text-amber-500" />
              ) : (
                <Droplet className="h-3.5 w-3.5 text-sky-500" />
              )}
              {current.category === 'RENEWABLE_ENERGY' ? 'أساس الطاقة المتجددة' : 'أساس استدامة المياه'}
            </div>
            <Badge variant="outline" className="text-[10px]">
              فترة الرصد: {current.baselinePeriodMonths} شهرًا
            </Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
            {current.totalEnergyKwh != null && (
              <div className="rounded border bg-background p-2">
                <p className="text-[10px] text-muted-foreground">الطاقة المستهلكة</p>
                <p className="font-bold tabular-nums">{current.totalEnergyKwh.toLocaleString('en-US')} kWh</p>
              </div>
            )}
            {current.totalWaterLiters != null && (
              <div className="rounded border bg-background p-2">
                <p className="text-[10px] text-muted-foreground">حجم المياه</p>
                <p className="font-bold tabular-nums">{current.totalWaterLiters.toLocaleString('en-US')} لتر</p>
              </div>
            )}
            <div className="rounded border bg-background p-2">
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Leaf className="h-3 w-3 text-green-600" /> الأثر الكربوني
              </p>
              <p className="font-bold tabular-nums">{current.baselineCo2eTons.toLocaleString('en-US')} tCO2e</p>
            </div>
            {current.waterIntensityPerSqm != null && (
              <div className="rounded border bg-background p-2">
                <p className="text-[10px] text-muted-foreground">كثافة المياه</p>
                <p className="font-bold tabular-nums">{current.waterIntensityPerSqm.toLocaleString('en-US')} لتر/م²</p>
              </div>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            معامل الانبعاثات: {current.emissionFactorSource || '—'}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground py-2">لم يُحتسَب خط أساس بعد لهذا المشروع.</p>
      )}

      {history.length > 1 && (
        <button
          type="button"
          onClick={() => setShowHistory((s) => !s)}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <History className="h-3 w-3" />
          {showHistory ? 'إخفاء السجل السابق' : `عرض السجل السابق (${history.length - 1})`}
        </button>
      )}
      {showHistory && (
        <div className="space-y-1.5">
          {history.filter((h) => h.id !== current?.id).map((h) => (
            <div key={h.id} className="flex items-center justify-between rounded border p-2 text-[11px] text-muted-foreground">
              <span>{new Date(h.createdAt).toLocaleDateString('ar')} — {h.category === 'RENEWABLE_ENERGY' ? 'طاقة' : 'مياه'}</span>
              <span className="tabular-nums">{h.baselineCo2eTons.toLocaleString('en-US')} tCO2e</span>
            </div>
          ))}
        </div>
      )}

      {showForm ? (
        <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">فئة خط الأساس</Label>
              <Select value={form.category} onValueChange={(v: FormState['category']) => updateField('category', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="RENEWABLE_ENERGY">طاقة متجددة / كفاءة طاقة (تحويل شمسي)</SelectItem>
                  <SelectItem value="WATER_SUSTAINABILITY">استدامة المياه / الري الذكي</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">عدد أشهر البيانات التاريخية المتوفرة</Label>
              <Input
                type="number" min="1" max="60" dir="ltr"
                value={form.baselinePeriodMonths}
                onChange={(e) => updateField('baselinePeriodMonths', e.target.value)}
                placeholder="12"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">الدولة/المنطقة (لتحديد معامل انبعاثات الشبكة)</Label>
            <Select value={form.gridRegionOrCountry} onValueChange={(v) => updateField('gridRegionOrCountry', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {form.category === 'RENEWABLE_ENERGY' ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">متوسط فاتورة الكهرباء الشهرية</Label>
                <Input
                  type="number" min="0" dir="ltr"
                  value={form.monthlyElectricityBill}
                  onChange={(e) => updateField('monthlyElectricityBill', e.target.value)}
                  placeholder="1500"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">تعرفة الكهرباء لكل kWh</Label>
                <Input
                  type="number" min="0" step="0.01" dir="ltr"
                  value={form.electricityRate}
                  onChange={(e) => updateField('electricityRate', e.target.value)}
                  placeholder="0.18"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[11px] text-muted-foreground">
                أدخل إما فاتورة المياه (الأبسط)، أو قدرة المضخة وساعات تشغيلها اليومية إن لم تتوفر فاتورة منفصلة.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">متوسط فاتورة المياه الشهرية</Label>
                  <Input
                    type="number" min="0" dir="ltr"
                    value={form.waterBill}
                    onChange={(e) => updateField('waterBill', e.target.value)}
                    placeholder="800"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">تعرفة المياه لكل لتر</Label>
                  <Input
                    type="number" min="0" step="0.0001" dir="ltr"
                    value={form.waterRatePerLiter}
                    onChange={(e) => updateField('waterRatePerLiter', e.target.value)}
                    placeholder="0.002"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">قدرة المضخة (kW)</Label>
                  <Input
                    type="number" min="0" dir="ltr"
                    value={form.pumpPowerCapacityKw}
                    onChange={(e) => updateField('pumpPowerCapacityKw', e.target.value)}
                    placeholder="7.5"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">ساعات تشغيل المضخة يوميًا</Label>
                  <Input
                    type="number" min="0" max="24" dir="ltr"
                    value={form.pumpOperatingHoursPerDay}
                    onChange={(e) => updateField('pumpOperatingHoursPerDay', e.target.value)}
                    placeholder="4"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">كثافة طاقة الضخ (kWh لكل م³) — اختياري، لاشتقاق حجم المياه من قدرة المضخة</Label>
                <Input
                  type="number" min="0" step="0.01" dir="ltr"
                  value={form.pumpEnergyKwhPerM3}
                  onChange={(e) => updateField('pumpEnergyKwhPerM3', e.target.value)}
                  placeholder="0.35"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">مساحة الأرض المروية</Label>
                  <Input
                    type="number" min="0" dir="ltr"
                    value={form.landAreaValue}
                    onChange={(e) => updateField('landAreaValue', e.target.value)}
                    placeholder="5000"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">وحدة المساحة</Label>
                  <Select value={form.landAreaUnit} onValueChange={(v: 'sqm' | 'hectares') => updateField('landAreaUnit', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sqm">متر مربع (م²)</SelectItem>
                      <SelectItem value="hectares">هكتار</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Button type="button" size="sm" onClick={handleCalculate} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" /> : <Calculator className="h-3.5 w-3.5 ml-1" />}
              احتساب وحفظ خط الأساس
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)} disabled={saving}>
              إلغاء
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(true)}>
          <Calculator className="h-3.5 w-3.5 ml-1" />
          {current ? 'إعادة احتساب خط الأساس' : 'احتساب خط الأساس'}
        </Button>
      )}
    </div>
  )
}

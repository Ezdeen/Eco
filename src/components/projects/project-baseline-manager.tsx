'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Zap, Droplet, Loader2, Leaf, History, Info, Pencil, Trash2, X, Check, Receipt } from 'lucide-react'
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

const MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

const MAX_INVOICES = 24

type BaselineCategory = 'RENEWABLE_ENERGY' | 'WATER_SUSTAINABILITY'

// نوع المشروع يحدّد فئة خط الأساس تلقائيًا - لا يختارها المستخدم يدويًا
function categoryForProjectType(projectType: string): BaselineCategory | null {
  if (projectType === 'smart_irrigation') return 'WATER_SUSTAINABILITY'
  if (['grid_tied', 'hybrid', 'off_grid'].includes(projectType)) return 'RENEWABLE_ENERGY'
  return null
}

export interface BaselineProject {
  id: string
  name: string
  nameAr?: string | null
  code: string
  projectType: string
  country?: string | null
}

interface BaselineRecord {
  id: string
  category: BaselineCategory
  status: string
  baselinePeriodMonths: number
  totalEnergyKwh: number | null
  totalWaterLiters: number | null
  baselineCo2eTons: number
  waterIntensityPerSqm: number | null
  emissionFactorSource: string | null
  createdAt: string
}

interface Invoice {
  id: string
  category: BaselineCategory
  month: number
  year: number
  amount: number
}

interface InvoiceFormState {
  month: string
  year: string
  amount: string
}

const emptyInvoiceForm = (): InvoiceFormState => ({
  month: String(new Date().getMonth() + 1),
  year: String(new Date().getFullYear()),
  amount: '',
})

interface RateFormState {
  gridRegionOrCountry: string
  electricityRate: string
  waterRatePerLiter: string
  pumpOperatingHoursPerDay: string
  pumpPowerCapacityKw: string
  pumpEnergyKwhPerM3: string
  landAreaValue: string
  landAreaUnit: 'sqm' | 'hectares'
  cropType: string
  baselinePeriodMonths: string // يُستخدم فقط لمسار قدرة المضخة (بلا فواتير)
}

const emptyRateForm = (defaultCountry: string): RateFormState => ({
  gridRegionOrCountry: defaultCountry || 'SA',
  electricityRate: '',
  waterRatePerLiter: '',
  pumpOperatingHoursPerDay: '',
  pumpPowerCapacityKw: '',
  pumpEnergyKwhPerM3: '',
  landAreaValue: '',
  landAreaUnit: 'sqm',
  cropType: '',
  baselinePeriodMonths: '12',
})

/**
 * إدارة خط الأساس البيئي (dMRV Baseline) لمشروع مُختار مسبقًا. تُستخدم داخل قسم
 * "خط الأساس" المستقل (src/components/sections/baseline-section.tsx).
 *
 * آلية إدخال البيانات التاريخية: جدول فواتير فعلية (الشهر، السنة، المبلغ) بإضافة/تعديل/
 * حذف - حتى 24 فاتورة تقريبًا لكل مشروع - بدل متوسط شهري تقديري، ثم يُحتسَب خط الأساس
 * من مجموع هذه الفواتير وتعرفة الكهرباء/المياه، بنفس المعادلات المبرمجة مسبقًا
 * (src/lib/baseline.ts). فئة خط الأساس (طاقة/مياه) تُحدَّد تلقائيًا من نوع المشروع.
 */
export function ProjectBaselineManager({ project }: { project: BaselineProject }) {
  const category = categoryForProjectType(project.projectType)

  const [current, setCurrent] = useState<BaselineRecord | null>(null)
  const [history, setHistory] = useState<BaselineRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showHistory, setShowHistory] = useState(false)

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [invoicesLoading, setInvoicesLoading] = useState(true)
  const [showInvoiceForm, setShowInvoiceForm] = useState(false)
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null)
  const [invoiceForm, setInvoiceForm] = useState<InvoiceFormState>(emptyInvoiceForm())
  const [savingInvoice, setSavingInvoice] = useState(false)

  const [rateForm, setRateForm] = useState<RateFormState>(emptyRateForm(project.country || 'SA'))
  const [calculating, setCalculating] = useState(false)

  const fetchBaseline = () => {
    setLoading(true)
    fetch(`/api/projects/${project.id}/baseline`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then((d) => {
        setCurrent(d.current || null)
        setHistory(d.history || [])
      })
      .catch(() => toast.error('تعذّر جلب خط الأساس البيئي'))
      .finally(() => setLoading(false))
  }

  const fetchInvoices = () => {
    if (!category) return
    setInvoicesLoading(true)
    fetch(`/api/projects/${project.id}/baseline/invoices?category=${category}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then((d) => setInvoices(d.invoices || []))
      .catch(() => toast.error('تعذّر جلب الفواتير التاريخية'))
      .finally(() => setInvoicesLoading(false))
  }

  useEffect(() => {
    setRateForm(emptyRateForm(project.country || 'SA'))
    setShowHistory(false)
    setShowInvoiceForm(false)
    setEditingInvoiceId(null)
    if (project.id) {
      fetchBaseline()
      fetchInvoices()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id])

  if (!category) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-300">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          حاسبة خط الأساس البيئي تدعم حاليًا مشاريع الطاقة الشمسية (Grid-Tied / Hybrid / Off-Grid) ومشاريع
          الري الذكي فقط. مشاريع التشجير لها منهجية أثر خاصة بها (عدد الأشجار × معامل امتصاص CO₂) لا تحتاج
          خط أساس تاريخيًا بنفس هذا الأسلوب.
        </span>
      </div>
    )
  }

  // ---- إدارة جدول الفواتير (إضافة / تعديل / حذف) ----

  const openAddInvoice = () => {
    setEditingInvoiceId(null)
    setInvoiceForm(emptyInvoiceForm())
    setShowInvoiceForm(true)
  }

  const openEditInvoice = (inv: Invoice) => {
    setEditingInvoiceId(inv.id)
    setInvoiceForm({ month: String(inv.month), year: String(inv.year), amount: String(inv.amount) })
    setShowInvoiceForm(true)
  }

  const closeInvoiceForm = () => {
    setShowInvoiceForm(false)
    setEditingInvoiceId(null)
    setInvoiceForm(emptyInvoiceForm())
  }

  const handleSaveInvoice = async () => {
    const month = Number(invoiceForm.month)
    const year = Number(invoiceForm.year)
    const amount = Number(invoiceForm.amount)
    if (!month || month < 1 || month > 12) {
      toast.error('اختر شهرًا صحيحًا')
      return
    }
    if (!year || year < 2000 || year > 2100) {
      toast.error('أدخل سنة صحيحة')
      return
    }
    if (!amount || amount <= 0) {
      toast.error('أدخل مبلغ الفاتورة (أكبر من صفر)')
      return
    }

    setSavingInvoice(true)
    try {
      const url = editingInvoiceId
        ? `/api/projects/${project.id}/baseline/invoices/${editingInvoiceId}`
        : `/api/projects/${project.id}/baseline/invoices`
      const res = await fetch(url, {
        method: editingInvoiceId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingInvoiceId ? { month, year, amount } : { category, month, year, amount }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'فشل حفظ الفاتورة')
        return
      }
      toast.success(editingInvoiceId ? 'تم تعديل الفاتورة' : 'تمت إضافة الفاتورة')
      closeInvoiceForm()
      fetchInvoices()
    } catch {
      toast.error('خطأ في الاتصال')
    } finally {
      setSavingInvoice(false)
    }
  }

  const handleDeleteInvoice = async (invoiceId: string) => {
    if (!confirm('حذف هذه الفاتورة من خط الأساس التاريخي؟')) return
    try {
      const res = await fetch(`/api/projects/${project.id}/baseline/invoices/${invoiceId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('تم حذف الفاتورة')
      fetchInvoices()
    } catch {
      toast.error('فشل حذف الفاتورة')
    }
  }

  // ---- احتساب خط الأساس من مجموع الفواتير + التعرفة/البيانات الفنية ----

  const handleCalculate = async () => {
    const body: Record<string, unknown> = {
      category,
      gridRegionOrCountry: rateForm.gridRegionOrCountry,
    }

    if (category === 'RENEWABLE_ENERGY') {
      if (invoices.length === 0) {
        toast.error('أضف فاتورة كهرباء واحدة على الأقل من الجدول أولاً')
        return
      }
      if (!rateForm.electricityRate) {
        toast.error('أدخل تعرفة الكهرباء لكل kWh')
        return
      }
      body.electricityRate = Number(rateForm.electricityRate)
    } else {
      const hasPumpData = rateForm.pumpPowerCapacityKw && rateForm.pumpOperatingHoursPerDay
      if (invoices.length === 0 && !hasPumpData) {
        toast.error('أضف فاتورة مياه واحدة على الأقل من الجدول، أو أدخل قدرة المضخة وساعات التشغيل')
        return
      }
      if (invoices.length > 0 && !rateForm.waterRatePerLiter) {
        toast.error('أدخل تعرفة المياه لكل لتر لاستخدام الفواتير المُدخلة')
        return
      }
      if (!rateForm.landAreaValue) {
        toast.error('أدخل مساحة الأرض المروية')
        return
      }
      if (rateForm.waterRatePerLiter) body.waterRatePerLiter = Number(rateForm.waterRatePerLiter)
      if (hasPumpData) {
        body.pumpPowerCapacityKw = Number(rateForm.pumpPowerCapacityKw)
        body.pumpOperatingHoursPerDay = Number(rateForm.pumpOperatingHoursPerDay)
        if (rateForm.pumpEnergyKwhPerM3) body.pumpEnergyKwhPerM3 = Number(rateForm.pumpEnergyKwhPerM3)
        if (invoices.length === 0) body.baselinePeriodMonths = Number(rateForm.baselinePeriodMonths) || undefined
      }
      body.landAreaValue = Number(rateForm.landAreaValue)
      body.landAreaUnit = rateForm.landAreaUnit
      if (rateForm.cropType) body.cropType = rateForm.cropType
    }

    setCalculating(true)
    try {
      const res = await fetch(`/api/projects/${project.id}/baseline`, {
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
      fetchBaseline()
    } catch {
      toast.error('خطأ في الاتصال')
    } finally {
      setCalculating(false)
    }
  }

  const totalInvoicesAmount = invoices.reduce((sum, inv) => sum + inv.amount, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {category === 'RENEWABLE_ENERGY' ? (
          <Zap className="h-4 w-4 text-amber-500" />
        ) : (
          <Droplet className="h-4 w-4 text-sky-500" />
        )}
        <h3 className="text-sm font-semibold">
          {category === 'RENEWABLE_ENERGY' ? 'خط أساس الطاقة المتجددة' : 'خط أساس استدامة المياه'}
        </h3>
        <Badge variant="outline" className="text-[10px]">يُحدَّد تلقائيًا حسب نوع المشروع</Badge>
      </div>

      {/* بطاقة خط الأساس المعتمد حاليًا */}
      {loading ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin ml-2" /> جاري التحميل...
        </div>
      ) : current ? (
        <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">خط الأساس المعتمد حاليًا</span>
            <Badge variant="outline" className="text-[10px]">فترة الرصد: {current.baselinePeriodMonths} شهرًا</Badge>
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
          <p className="text-[10px] text-muted-foreground">معامل الانبعاثات: {current.emissionFactorSource || '—'}</p>
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
              <span>{new Date(h.createdAt).toLocaleDateString('ar')}</span>
              <span className="tabular-nums">{h.baselineCo2eTons.toLocaleString('en-US')} tCO2e</span>
            </div>
          ))}
        </div>
      )}

      {/* جدول الفواتير التاريخية */}
      <div className="space-y-2 border-t pt-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-xs font-semibold">
              {category === 'RENEWABLE_ENERGY' ? 'فواتير الكهرباء التاريخية' : 'فواتير المياه التاريخية'}
            </h4>
            <Badge variant="outline" className="text-[10px] tabular-nums">{invoices.length}/{MAX_INVOICES}</Badge>
          </div>
          {!showInvoiceForm && invoices.length < MAX_INVOICES && (
            <Button type="button" variant="outline" size="sm" onClick={openAddInvoice}>
              <Plus className="h-3.5 w-3.5 ml-1" />
              إضافة فاتورة
            </Button>
          )}
        </div>

        {showInvoiceForm && (
          <div className="rounded-lg border p-3 bg-muted/30">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">الشهر</Label>
                <Select value={invoiceForm.month} onValueChange={(v) => setInvoiceForm((f) => ({ ...f, month: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, idx) => (
                      <SelectItem key={idx + 1} value={String(idx + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">السنة</Label>
                <Input
                  type="number" min="2000" max="2100" dir="ltr"
                  value={invoiceForm.year}
                  onChange={(e) => setInvoiceForm((f) => ({ ...f, year: e.target.value }))}
                  placeholder="2025"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">المبلغ</Label>
                <Input
                  type="number" min="0" step="0.01" dir="ltr"
                  value={invoiceForm.amount}
                  onChange={(e) => setInvoiceForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="1450"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-3">
              <Button type="button" size="sm" onClick={handleSaveInvoice} disabled={savingInvoice}>
                {savingInvoice ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" /> : <Check className="h-3.5 w-3.5 ml-1" />}
                {editingInvoiceId ? 'حفظ التعديل' : 'حفظ الفاتورة'}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={closeInvoiceForm} disabled={savingInvoice}>
                <X className="h-3.5 w-3.5 ml-1" />
                إلغاء
              </Button>
            </div>
          </div>
        )}

        {invoicesLoading ? (
          <div className="flex items-center justify-center py-4 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin ml-2" /> جاري تحميل الفواتير...
          </div>
        ) : invoices.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">لا توجد فواتير مُسجَّلة بعد. أضف فاتورة واحدة على الأقل للبدء.</p>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">الشهر</TableHead>
                  <TableHead className="text-xs">السنة</TableHead>
                  <TableHead className="text-xs">المبلغ</TableHead>
                  <TableHead className="text-xs w-20">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="text-xs">{MONTHS[inv.month - 1]}</TableCell>
                    <TableCell className="text-xs tabular-nums">{inv.year}</TableCell>
                    <TableCell className="text-xs tabular-nums font-medium">{inv.amount.toLocaleString('en-US')}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditInvoice(inv)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button" variant="ghost" size="icon"
                          className="h-6 w-6 text-red-500 hover:text-red-600"
                          onClick={() => handleDeleteInvoice(inv.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between border-t bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
              <span>الإجمالي ({invoices.length} فاتورة)</span>
              <span className="font-bold tabular-nums">{totalInvoicesAmount.toLocaleString('en-US')}</span>
            </div>
          </div>
        )}
      </div>

      {/* التعرفة والبيانات الفنية المصاحبة (كما تم برمجتها سابقًا) */}
      <div className="space-y-3 border-t pt-3">
        <h4 className="text-xs font-semibold">التعرفة والبيانات الفنية</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">الدولة/المنطقة (لتحديد معامل انبعاثات الشبكة)</Label>
            <Select value={rateForm.gridRegionOrCountry} onValueChange={(v) => setRateForm((f) => ({ ...f, gridRegionOrCountry: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {category === 'RENEWABLE_ENERGY' ? (
            <div className="space-y-1.5">
              <Label className="text-xs">تعرفة الكهرباء لكل kWh</Label>
              <Input
                type="number" min="0" step="0.01" dir="ltr"
                value={rateForm.electricityRate}
                onChange={(e) => setRateForm((f) => ({ ...f, electricityRate: e.target.value }))}
                placeholder="0.18"
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs">تعرفة المياه لكل لتر (لاستخدام الفواتير أعلاه)</Label>
              <Input
                type="number" min="0" step="0.0001" dir="ltr"
                value={rateForm.waterRatePerLiter}
                onChange={(e) => setRateForm((f) => ({ ...f, waterRatePerLiter: e.target.value }))}
                placeholder="0.002"
              />
            </div>
          )}
        </div>

        {category === 'WATER_SUSTAINABILITY' && (
          <>
            <p className="text-[11px] text-muted-foreground">
              بديل عن فواتير المياه: إن لم تتوفر فواتير، يمكن الاحتساب من قدرة المضخة وساعات تشغيلها (تُستخدم فقط
              عند عدم وجود أي فاتورة في الجدول أعلاه).
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">قدرة المضخة (kW)</Label>
                <Input
                  type="number" min="0" dir="ltr"
                  value={rateForm.pumpPowerCapacityKw}
                  onChange={(e) => setRateForm((f) => ({ ...f, pumpPowerCapacityKw: e.target.value }))}
                  placeholder="7.5"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">ساعات تشغيل المضخة يوميًا</Label>
                <Input
                  type="number" min="0" max="24" dir="ltr"
                  value={rateForm.pumpOperatingHoursPerDay}
                  onChange={(e) => setRateForm((f) => ({ ...f, pumpOperatingHoursPerDay: e.target.value }))}
                  placeholder="4"
                />
              </div>
            </div>
            {invoices.length === 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">عدد الأشهر (لمسار قدرة المضخة فقط)</Label>
                  <Input
                    type="number" min="1" max="60" dir="ltr"
                    value={rateForm.baselinePeriodMonths}
                    onChange={(e) => setRateForm((f) => ({ ...f, baselinePeriodMonths: e.target.value }))}
                    placeholder="12"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">كثافة طاقة الضخ (kWh لكل م³) — اختياري</Label>
                  <Input
                    type="number" min="0" step="0.01" dir="ltr"
                    value={rateForm.pumpEnergyKwhPerM3}
                    onChange={(e) => setRateForm((f) => ({ ...f, pumpEnergyKwhPerM3: e.target.value }))}
                    placeholder="0.35"
                  />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">مساحة الأرض المروية</Label>
                <Input
                  type="number" min="0" dir="ltr"
                  value={rateForm.landAreaValue}
                  onChange={(e) => setRateForm((f) => ({ ...f, landAreaValue: e.target.value }))}
                  placeholder="5000"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">وحدة المساحة</Label>
                <Select value={rateForm.landAreaUnit} onValueChange={(v: 'sqm' | 'hectares') => setRateForm((f) => ({ ...f, landAreaUnit: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sqm">متر مربع (م²)</SelectItem>
                    <SelectItem value="hectares">هكتار</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">نوع المحصول (اختياري - لأغراض التوثيق)</Label>
              <Input
                value={rateForm.cropType}
                onChange={(e) => setRateForm((f) => ({ ...f, cropType: e.target.value }))}
                placeholder="نخيل / قمح / خضروات..."
              />
            </div>
          </>
        )}

        <Button type="button" size="sm" onClick={handleCalculate} disabled={calculating}>
          {calculating ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" /> : <Plus className="h-3.5 w-3.5 ml-1" />}
          احتساب وحفظ خط الأساس
        </Button>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Landmark, Plus, Trash2, AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface Funder {
  id: string
  funderName: string
  funderNameAr: string | null
  fundingAmount: number | null
  projectTotalValue: number | null
  attributionShare: number
  attributionMethod: string
  attributionNote: string | null
  currency: string | null
  isActive: boolean
}

interface AttributionSummary {
  total: number
  totalPct: number
  isOverAttributed: boolean
}

interface NewFunderForm {
  funderName: string
  attributionMethod: 'capital_share' | 'manual'
  fundingAmount: string
  projectTotalValue: string
  attributionShare: string
  attributionNote: string
}

const EMPTY_NEW_FUNDER: NewFunderForm = {
  funderName: '',
  attributionMethod: 'capital_share',
  fundingAmount: '',
  projectTotalValue: '',
  attributionShare: '',
  attributionNote: '',
}

/**
 * إدارة الجهات الممولة ونسب الإسناد (Banking Attribution) لمشروع معيّن.
 * يُستخدم من داخل نموذج المشروع (وضع التعديل فقط، لأنه يحتاج projectId حقيقي).
 *
 * لا يُعدَّل هذا المكوّن أبدًا أي رقم في CalculationRun أو ImpactUnit — فقط
 * يدير قائمة ProjectFunder التي تُقرأ من قسم الحسابات/وحدات الأثر/التقارير
 * كطبقة عرض مشتقة (attribution)، مطابقةً لمنهجية PCAF لتمويل المشاريع.
 */
export function ProjectFundersManager({ projectId, projectCurrency }: { projectId: string; projectCurrency?: string }) {
  const [funders, setFunders] = useState<Funder[]>([])
  const [summary, setSummary] = useState<AttributionSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newFunder, setNewFunder] = useState<NewFunderForm>(EMPTY_NEW_FUNDER)

  const fetchFunders = () => {
    setLoading(true)
    fetch(`/api/projects/${projectId}/funders`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then((d) => {
        setFunders(d.funders || [])
        setSummary(d.attributionSummary || null)
      })
      .catch(() => toast.error('تعذّر جلب بيانات الممولين'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (projectId) fetchFunders()
  }, [projectId])

  const resetForm = () => {
    setNewFunder(EMPTY_NEW_FUNDER)
    setShowAddForm(false)
  }

  const handleAdd = async () => {
    if (!newFunder.funderName.trim()) {
      toast.error('اسم الممول مطلوب')
      return
    }

    const body: Record<string, unknown> = {
      funderName: newFunder.funderName.trim(),
      attributionMethod: newFunder.attributionMethod,
      currency: projectCurrency,
    }

    if (newFunder.attributionMethod === 'manual') {
      const share = Number(newFunder.attributionShare) / 100
      if (!newFunder.attributionShare || Number.isNaN(share) || share < 0 || share > 1) {
        toast.error('أدخل نسبة إسناد صحيحة بين 0 و100')
        return
      }
      if (!newFunder.attributionNote.trim()) {
        toast.error('يجب توضيح سبب الإدخال اليدوي لنسبة الإسناد')
        return
      }
      body.attributionShare = share
      body.attributionNote = newFunder.attributionNote.trim()
    } else {
      const funding = Number(newFunder.fundingAmount)
      const total = Number(newFunder.projectTotalValue)
      if (!newFunder.fundingAmount || !newFunder.projectTotalValue || Number.isNaN(funding) || Number.isNaN(total) || total <= 0) {
        toast.error('أدخل مبلغ التمويل وإجمالي قيمة المشروع (رقمين أكبر من صفر)')
        return
      }
      body.fundingAmount = funding
      body.projectTotalValue = total
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/funders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'فشلت إضافة الممول')
        return
      }
      toast.success('تمت إضافة الممول')
      if (data.warnings?.length) {
        data.warnings.forEach((w: string) => toast.warning(w))
      }
      resetForm()
      fetchFunders()
    } catch {
      toast.error('خطأ في الاتصال')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (funderId: string) => {
    if (!confirm('حذف هذا الممول؟ سيختفي نصيبه من الحسابات ووحدات الأثر والتقارير.')) return
    try {
      const res = await fetch(`/api/projects/${projectId}/funders/${funderId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('تم حذف الممول')
      fetchFunders()
    } catch {
      toast.error('فشل حذف الممول')
    }
  }

  const handleToggleActive = async (funder: Funder) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/funders/${funder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !funder.isActive }),
      })
      if (!res.ok) throw new Error()
      fetchFunders()
    } catch {
      toast.error('فشل تحديث حالة الممول')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Landmark className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">الجهات الممولة ونسب الإسناد</h3>
        <Badge variant="outline" className="text-[10px]">PCAF Attribution</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        سجّل هنا كل جهة ساهمت في تمويل هذا المشروع مع نسبتها، ليظهر "نصيب الممول" من الأثر البيئي (تجنّب الكربون)
        بجانب رقم المشروع الكامل — في الحسابات، وحدات الأثر، والتقارير — وفق منهجية PCAF لتمويل المشاريع.
      </p>

      {summary && summary.isOverAttributed && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2.5 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            مجموع نسب الإسناد النشطة حاليًا {summary.totalPct}% (يتجاوز 100%). راجع البيانات لتفادي احتساب نفس
            الأثر أكثر من مرة في تقارير أكثر من جهة.
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin ml-2" /> جاري التحميل...
        </div>
      ) : funders.length === 0 && !showAddForm ? (
        <p className="text-xs text-muted-foreground py-2">لا يوجد ممولون مسجَّلون بعد لهذا المشروع.</p>
      ) : (
        <div className="space-y-2">
          {funders.map((f) => (
            <div
              key={f.id}
              className={`flex items-center justify-between gap-3 rounded-lg border p-2.5 text-xs ${f.isActive ? '' : 'opacity-50'}`}
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{f.funderNameAr || f.funderName}</p>
                <p className="text-[10px] text-muted-foreground">
                  {f.attributionMethod === 'capital_share'
                    ? `نسبة رأس المال: ${f.fundingAmount?.toLocaleString('en-US')} / ${f.projectTotalValue?.toLocaleString('en-US')} ${f.currency || ''}`
                    : `إدخال يدوي${f.attributionNote ? ` — ${f.attributionNote}` : ''}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className="font-bold tabular-nums">
                  {(f.attributionShare * 100).toFixed(2)}%
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[10px]"
                  onClick={() => handleToggleActive(f)}
                >
                  {f.isActive ? 'إيقاف' : 'تفعيل'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-red-500 hover:text-red-600"
                  onClick={() => handleDelete(f.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddForm ? (
        <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
          <div className="space-y-1.5">
            <Label className="text-xs">اسم الجهة الممولة</Label>
            <Input
              value={newFunder.funderName}
              onChange={(e) => setNewFunder((f) => ({ ...f, funderName: e.target.value }))}
              placeholder="بنك التنمية الصناعية السعودية"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">طريقة احتساب النسبة</Label>
            <Select
              value={newFunder.attributionMethod}
              onValueChange={(v: 'capital_share' | 'manual') => setNewFunder((f) => ({ ...f, attributionMethod: v }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="capital_share">نسبة رأس المال (PCAF) — من مبلغ التمويل / قيمة المشروع</SelectItem>
                <SelectItem value="manual">إدخال يدوي</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {newFunder.attributionMethod === 'capital_share' ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">مبلغ تمويل هذه الجهة ({projectCurrency || 'SAR'})</Label>
                <Input
                  type="number"
                  min="0"
                  value={newFunder.fundingAmount}
                  onChange={(e) => setNewFunder((f) => ({ ...f, fundingAmount: e.target.value }))}
                  placeholder="600000"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">القيمة الإجمالية للمشروع ({projectCurrency || 'SAR'})</Label>
                <Input
                  type="number"
                  min="0"
                  value={newFunder.projectTotalValue}
                  onChange={(e) => setNewFunder((f) => ({ ...f, projectTotalValue: e.target.value }))}
                  placeholder="2000000"
                  dir="ltr"
                />
              </div>
              {Number(newFunder.fundingAmount) > 0 && Number(newFunder.projectTotalValue) > 0 && (
                <p className="col-span-2 text-[11px] text-muted-foreground">
                  نسبة الإسناد المحسوبة: {((Number(newFunder.fundingAmount) / Number(newFunder.projectTotalValue)) * 100).toFixed(2)}%
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">نسبة الإسناد (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={newFunder.attributionShare}
                  onChange={(e) => setNewFunder((f) => ({ ...f, attributionShare: e.target.value }))}
                  placeholder="30"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">سبب الإدخال اليدوي</Label>
                <Input
                  value={newFunder.attributionNote}
                  onChange={(e) => setNewFunder((f) => ({ ...f, attributionNote: e.target.value }))}
                  placeholder="نسبة متفق عليها تعاقديًا تختلف عن نسبة رأس المال"
                />
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Button type="button" size="sm" onClick={handleAdd} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" /> : <Plus className="h-3.5 w-3.5 ml-1" />}
              إضافة الممول
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={resetForm} disabled={saving}>
              إلغاء
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setShowAddForm(true)}>
          <Plus className="h-3.5 w-3.5 ml-1" />
          إضافة جهة ممولة
        </Button>
      )}
    </div>
  )
}

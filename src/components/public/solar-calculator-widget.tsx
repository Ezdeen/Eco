'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Loader2, Sun, TrendingDown, Leaf, Calendar, Download, CheckCircle2, Building2, User } from 'lucide-react'
import { toast } from 'sonner'
import { runSolarCalculator, DEFAULT_CLIENT_FACTORS, type SolarCalculatorResult, type SolarUserType } from '@/lib/solar-engine'

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

interface LeadFormState {
  fullName: string
  email: string
  phone: string
  companyName: string
}

export function SolarCalculatorWidget() {
  const [userType, setUserType] = useState<SolarUserType>('individual')
  const [monthlyBill, setMonthlyBill] = useState(600)
  const [loanPercent, setLoanPercent] = useState(70)
  const [loanTermYears, setLoanTermYears] = useState(5)
  const [loanInterestRatePct, setLoanInterestRatePct] = useState(6)

  const [gateOpen, setGateOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [fullReport, setFullReport] = useState<{ result: SolarCalculatorResult; reportUrl: string } | null>(null)
  const [form, setForm] = useState<LeadFormState>({ fullName: '', email: '', phone: '', companyName: '' })

  const sessionIdRef = useRef<string>('')
  if (!sessionIdRef.current && typeof crypto !== 'undefined' && crypto.randomUUID) {
    sessionIdRef.current = crypto.randomUUID()
  }

  // Instant, client-side teaser — zero network round-trip. Uses indicative
  // fallback factors (see src/lib/solar-engine.ts::DEFAULT_CLIENT_FACTORS);
  // the authoritative, DB-backed numbers are recomputed server-side the
  // moment the visitor submits the full-report gate below.
  const teaser = useMemo(
    () =>
      runSolarCalculator(
        { userType, monthlyElectricityBill: monthlyBill, loanPercent, loanTermYears, loanInterestRatePct },
        DEFAULT_CLIENT_FACTORS,
      ),
    [userType, monthlyBill, loanPercent, loanTermYears, loanInterestRatePct],
  )

  // Debounced, best-effort, anonymous funnel logging (no PII). Never blocks the UI.
  useEffect(() => {
    const handle = setTimeout(() => {
      fetch('/api/public/solar-calculator/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          userType,
          monthlyElectricityBill: monthlyBill,
          loanPercent,
          loanTermYears,
          loanInterestRatePct,
          countryCode: 'SA',
          currency: DEFAULT_CLIENT_FACTORS.currency,
          locale: 'ar',
        }),
      }).catch(() => {})
    }, 1200)
    return () => clearTimeout(handle)
  }, [userType, monthlyBill, loanPercent, loanTermYears, loanInterestRatePct])

  async function handleSubmitGate() {
    if (!form.fullName.trim() || !form.email.trim()) {
      toast.error('الاسم الكامل والبريد الإلكتروني مطلوبان')
      return
    }
    if (userType === 'sme' && !form.companyName.trim()) {
      toast.error('اسم المنشأة مطلوب لعملاء الشركات الصغيرة والمتوسطة')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/public/solar-calculator/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: form.fullName,
          email: form.email,
          phone: form.phone || undefined,
          companyName: form.companyName || undefined,
          userType,
          countryCode: 'SA',
          locale: 'ar',
          monthlyElectricityBill: monthlyBill,
          loanPercent,
          loanTermYears,
          loanInterestRatePct,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'تعذّر إرسال الطلب، حاول مجددًا')
        return
      }
      setFullReport({ result: json.result, reportUrl: json.reportUrl })
      setGateOpen(false)
      toast.success('تم إعداد تقريرك الكامل بنجاح')
    } catch {
      toast.error('تعذّر الاتصال بالخادم، حاول مجددًا')
    } finally {
      setSubmitting(false)
    }
  }

  const displayed = fullReport?.result || teaser

  return (
    <Card className="border-green-200/60 shadow-lg shadow-green-900/5">
      <CardHeader className="bg-gradient-to-l from-green-600 to-teal-600 text-white rounded-t-xl">
        <CardTitle className="flex items-center gap-2 text-xl">
          <Sun className="h-5 w-5" /> حاسبة القرض الأخضر الشمسي
        </CardTitle>
        <CardDescription className="text-green-50">
          اعرف توفيرك الشهري، فترة الاسترداد، والأثر البيئي المتوقع خلال أقل من دقيقة
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6 pt-6">
        {/* User type */}
        <div className="space-y-2">
          <Label>نوع العميل</Label>
          <RadioGroup
            value={userType}
            onValueChange={(v) => setUserType(v as SolarUserType)}
            className="grid grid-cols-2 gap-3"
          >
            <label
              className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer transition-colors ${userType === 'individual' ? 'border-green-500 bg-green-50' : 'border-muted'}`}
            >
              <RadioGroupItem value="individual" />
              <User className="h-4 w-4" /> فرد
            </label>
            <label
              className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer transition-colors ${userType === 'sme' ? 'border-green-500 bg-green-50' : 'border-muted'}`}
            >
              <RadioGroupItem value="sme" />
              <Building2 className="h-4 w-4" /> منشأة صغيرة/متوسطة
            </label>
          </RadioGroup>
        </div>

        {/* Monthly bill */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label>فاتورة الكهرباء الشهرية الحالية</Label>
            <span className="font-bold text-green-700">{fmt(monthlyBill)} {DEFAULT_CLIENT_FACTORS.currency}</span>
          </div>
          <Slider value={[monthlyBill]} min={100} max={20000} step={50} onValueChange={(v) => setMonthlyBill(v[0])} />
        </div>

        {/* Loan inputs */}
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label className="text-xs">نسبة التمويل بالقرض</Label>
              <span className="text-xs font-semibold">{loanPercent}%</span>
            </div>
            <Slider value={[loanPercent]} min={0} max={100} step={5} onValueChange={(v) => setLoanPercent(v[0])} />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label className="text-xs">مدة التمويل</Label>
              <span className="text-xs font-semibold">{loanTermYears} سنوات</span>
            </div>
            <Slider value={[loanTermYears]} min={1} max={10} step={1} onValueChange={(v) => setLoanTermYears(v[0])} />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label className="text-xs">معدل الفائدة السنوي</Label>
              <span className="text-xs font-semibold">{loanInterestRatePct}%</span>
            </div>
            <Slider
              value={[loanInterestRatePct]}
              min={0}
              max={20}
              step={0.5}
              onValueChange={(v) => setLoanInterestRatePct(v[0])}
            />
          </div>
        </div>

        {/* Teaser metrics — top-line, shown immediately */}
        <div className="grid grid-cols-3 gap-3 pt-2">
          <TeaserCard
            icon={<TrendingDown className="h-4 w-4" />}
            label="صافي التوفير الشهري"
            value={`${fmt(displayed.cashflow.netMonthlyCashflowDuringLoan)} ${displayed.currency}`}
          />
          <TeaserCard
            icon={<Calendar className="h-4 w-4" />}
            label="سنة الاسترداد"
            value={displayed.cashflow.simplePaybackYears ? `${displayed.cashflow.simplePaybackYears}` : '—'}
          />
          <TeaserCard
            icon={<Leaf className="h-4 w-4" />}
            label="CO₂ متجنَّب سنويًا"
            value={`${displayed.carbon.avoidedCO2TonsPerYear} طن`}
          />
        </div>

        {fullReport ? (
          <FullReportDetails result={fullReport.result} reportUrl={fullReport.reportUrl} />
        ) : (
          <Button
            className="w-full bg-green-600 hover:bg-green-700"
            size="lg"
            onClick={() => setGateOpen(true)}
          >
            احصل على تقريرك الكامل (PDF جاهز للبنك) مجانًا
          </Button>
        )}

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          هذه النتائج تقديرية لأغراض التخطيط الأولي ولا تشكل عرض تمويل ملزمًا. القيم المعروضة قبل إرسال
          النموذج تستخدم عوامل مرجعية افتراضية توضيحية؛ يُعاد احتسابها بدقة عبر مصادر بيانات موثّقة عند
          إصدار التقرير الكامل.
        </p>
      </CardContent>

      <Dialog open={gateOpen} onOpenChange={setGateOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>أكمل بياناتك لإصدار التقرير الكامل</DialogTitle>
            <DialogDescription>
              تقرير PDF مفصّل يتضمن ختم توثيق dMRV، جاهز لعرضه على البنك أو الجهة الممولة.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="solar-lead-name">الاسم الكامل</Label>
              <Input
                id="solar-lead-name"
                value={form.fullName}
                onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="solar-lead-email">البريد الإلكتروني</Label>
              <Input
                id="solar-lead-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="solar-lead-phone">رقم الهاتف (اختياري)</Label>
              <Input
                id="solar-lead-phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            {userType === 'sme' && (
              <div className="space-y-1.5">
                <Label htmlFor="solar-lead-company">اسم المنشأة</Label>
                <Input
                  id="solar-lead-company"
                  value={form.companyName}
                  onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleSubmitGate} disabled={submitting} className="w-full bg-green-600 hover:bg-green-700">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
              إصدار التقرير الكامل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function TeaserCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3 text-center space-y-1">
      <div className="flex items-center justify-center gap-1 text-muted-foreground">{icon}</div>
      <div className="text-lg font-bold text-green-700">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  )
}

function FullReportDetails({ result, reportUrl }: { result: SolarCalculatorResult; reportUrl: string }) {
  return (
    <div className="space-y-4 border-t pt-4">
      <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
        <CheckCircle2 className="h-4 w-4" /> تقريرك الكامل جاهز
      </div>

      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground mb-1">السيناريو أ — الوضع الحالي</div>
          <div className="font-bold">{fmt(result.scenarios.scenarioA_statusQuo.monthlyCost)} {result.currency}/شهريًا</div>
        </div>
        <div className="rounded-lg border p-3 border-green-300 bg-green-50">
          <div className="text-xs text-muted-foreground mb-1">السيناريو ب — شمسي + قرض أخضر</div>
          <div className="font-bold text-green-700">
            {fmt(result.scenarios.scenarioB_solarLoan.monthlyOutflowYear1)} {result.currency}/شهريًا
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
        <MiniStat label="تكلفة المنظومة" value={`${fmt(result.loan.estimatedSystemCost)} ${result.currency}`} />
        <MiniStat label="القسط الشهري" value={`${fmt(result.loan.monthlyPMT)} ${result.currency}`} />
        <MiniStat label="العائد التراكمي 20 سنة" value={`${result.cashflow.cumulativeROI20yrPct ?? '—'}%`} />
        <MiniStat label="أشجار مكافئة/سنويًا" value={`${result.carbon.treesEquivalentPerYear}`} />
      </div>

      <Badge variant="outline" className="text-[10px]">
        {result.leadScore.priority === 'high' ? 'أولوية عالية' : result.leadScore.priority === 'medium' ? 'أولوية متوسطة' : 'أولوية عادية'}
      </Badge>

      <Button asChild variant="outline" className="w-full">
        <a href={reportUrl} target="_blank" rel="noopener noreferrer">
          <Download className="h-4 w-4 ml-2" /> تحميل التقرير الكامل (PDF)
        </a>
      </Button>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-2 bg-muted/20">
      <div className="font-bold">{value}</div>
      <div className="text-muted-foreground">{label}</div>
    </div>
  )
}

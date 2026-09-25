'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import styles from './solar-calculator-widget.module.css'

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

  // Session ID initialization stable across renders
  const sessionIdRef = useRef<string>('')
  if (!sessionIdRef.current) {
    sessionIdRef.current = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `session-${Date.now()}`
  }

  // Client-side instant teaser calculation
  const teaser = useMemo(
    () =>
      runSolarCalculator(
        { userType, monthlyElectricityBill: monthlyBill, loanPercent, loanTermYears, loanInterestRatePct },
        DEFAULT_CLIENT_FACTORS,
      ),
    [userType, monthlyBill, loanPercent, loanTermYears, loanInterestRatePct],
  )

  // Funnel logging (non-blocking)
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
    if (!form.fullName.trim()) {
      toast.error('الرجاء إدخال الاسم الكامل')
      return
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!form.email.trim() || !emailRegex.test(form.email.trim())) {
      toast.error('الرجاء إدخال بريد إلكتروني صحيح')
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
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          companyName: form.companyName.trim() || undefined,
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
    <Card className={styles.widget}>
      <CardHeader className={styles.header}>
        <CardTitle className={styles.title}>
          <Sun className="h-6 w-6" />
          <span>حاسبة القرض الأخضر الشمسي</span>
        </CardTitle>
        <CardDescription className={styles.description}>
          اعرف توفيرك الشهري، فترة الاسترداد، والأثر البيئي المتوقع خلال أقل من دقيقة
        </CardDescription>
      </CardHeader>

      <CardContent className={styles.content}>
        {/* User type selector */}
        <div className="space-y-2">
          <Label className={styles.label}>نوع العميل</Label>
          <RadioGroup
            value={userType}
            onValueChange={(v) => setUserType(v as SolarUserType)}
            className="grid grid-cols-2 gap-3"
          >
            <label
              className={`${styles.radioCard} ${userType === 'individual' ? styles.radioCardActive : ''}`}
            >
              <RadioGroupItem value="individual" id="type-individual" />
              <User className="h-4 w-4" />
              <span>فرد</span>
            </label>
            <label
              className={`${styles.radioCard} ${userType === 'sme' ? styles.radioCardActive : ''}`}
            >
              <RadioGroupItem value="sme" id="type-sme" />
              <Building2 className="h-4 w-4" />
              <span>منشأة صغيرة/متوسطة</span>
            </label>
          </RadioGroup>
        </div>

        {/* Monthly bill input */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label className={styles.label}>فاتورة الكهرباء الشهرية الحالية</Label>
            <span className={styles.billBadge}>
              {fmt(monthlyBill)} {DEFAULT_CLIENT_FACTORS.currency}
            </span>
          </div>
          <Slider
            value={[monthlyBill]}
            min={100}
            max={20000}
            step={50}
            onValueChange={(v) => setMonthlyBill(v[0])}
          />
        </div>

        {/* Loan parameters */}
        <div className={styles.loanGrid}>
          <div className={styles.loanCard}>
            <div className="flex justify-between items-center mb-2">
              <Label className="text-xs font-semibold">نسبة التمويل</Label>
              <span className="text-xs font-bold text-emerald-700">{loanPercent}%</span>
            </div>
            <Slider
              value={[loanPercent]}
              min={0}
              max={100}
              step={5}
              onValueChange={(v) => setLoanPercent(v[0])}
            />
          </div>

          <div className={styles.loanCard}>
            <div className="flex justify-between items-center mb-2">
              <Label className="text-xs font-semibold">مدة التمويل</Label>
              <span className="text-xs font-bold text-emerald-700">{loanTermYears} سنوات</span>
            </div>
            <Slider
              value={[loanTermYears]}
              min={1}
              max={10}
              step={1}
              onValueChange={(v) => setLoanTermYears(v[0])}
            />
          </div>

          <div className={styles.loanCard}>
            <div className="flex justify-between items-center mb-2">
              <Label className="text-xs font-semibold">معدل الفائدة السنوي</Label>
              <span className="text-xs font-bold text-emerald-700">{loanInterestRatePct}%</span>
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

        {/* Teaser key metrics */}
        <div className={styles.teaserGrid}>
          <TeaserCard
            icon={<TrendingDown className="h-5 w-5" />}
            label="صافي التوفير الشهري"
            value={`${fmt(displayed.cashflow.netMonthlyCashflowDuringLoan)} ${displayed.currency}`}
          />
          <TeaserCard
            icon={<Calendar className="h-5 w-5" />}
            label="سنة الاسترداد"
            value={displayed.cashflow.simplePaybackYears ? `${displayed.cashflow.simplePaybackYears}` : '—'}
          />
          <TeaserCard
            icon={<Leaf className="h-5 w-5" />}
            label="CO₂ متجنَّب سنويًا"
            value={`${displayed.carbon.avoidedCO2TonsPerYear} طن`}
          />
        </div>

        {/* Call to action or Full Report */}
        {fullReport ? (
          <FullReportDetails result={fullReport.result} reportUrl={fullReport.reportUrl} />
        ) : (
          <Button
            className={styles.submitBtn}
            size="lg"
            onClick={() => setGateOpen(true)}
          >
            احصل على تقريرك الكامل (PDF جاهز للبنك) مجانًا
          </Button>
        )}

        <p className={styles.disclaimer}>
          هذه النتائج تقديرية لأغراض التخطيط الأولي ولا تشكل عرض تمويل ملزمًا. القيم المعروضة قبل إرسال
          النموذج تستخدم عوامل مرجعية افتراضية توضيحية؛ يُعاد احتسابها بدقة عبر مصادر بيانات موثّقة عند
          إصدار التقرير الكامل.
        </p>
      </CardContent>

      <Dialog open={gateOpen} onOpenChange={setGateOpen}>
        <DialogContent className={styles.dialog} dir="rtl">
          <DialogHeader className="space-y-2 text-right">
            <DialogTitle className={styles.dialogTitle}>أكمل بياناتك لإصدار التقرير الكامل</DialogTitle>
            <DialogDescription className={styles.dialogDescription}>
              تقرير PDF مفصّل يتضمن ختم توثيق dMRV، جاهز لعرضه على البنك أو الجهة الممولة.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="solar-lead-name">الاسم الكامل *</Label>
              <Input
                id="solar-lead-name"
                placeholder="أدخل اسمك الكامل"
                value={form.fullName}
                onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="solar-lead-email">البريد الإلكتروني *</Label>
              <Input
                id="solar-lead-email"
                type="email"
                placeholder="name@example.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="solar-lead-phone">رقم الهاتف (اختياري)</Label>
              <Input
                id="solar-lead-phone"
                type="tel"
                placeholder="05XXXXXXXX"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            {userType === 'sme' && (
              <div className="space-y-1.5">
                <Label htmlFor="solar-lead-company">اسم المنشأة *</Label>
                <Input
                  id="solar-lead-company"
                  placeholder="اسم الشركة أو المؤسسة"
                  value={form.companyName}
                  onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              onClick={handleSubmitGate}
              disabled={submitting}
              className={styles.dialogSubmitBtn}
            >
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
    <div className={styles.teaserCard}>
      <div className={styles.teaserIcon}>{icon}</div>
      <div className={styles.teaserValue}>{value}</div>
      <div className={styles.teaserLabel}>{label}</div>
    </div>
  )
}

function FullReportDetails({ result, reportUrl }: { result: SolarCalculatorResult; reportUrl: string }) {
  return (
    <div className={styles.reportContainer}>
      <div className={styles.reportHeader}>
        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        <span className="font-bold text-emerald-900 text-sm">تقريرك الكامل جاهز للتحميل</span>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className={styles.scenarioCard}>
          <div className="text-xs text-muted-foreground mb-1 font-medium">السيناريو أ — الوضع الحالي</div>
          <div className="font-bold text-slate-800">{fmt(result.scenarios.scenarioA_statusQuo.monthlyCost)} {result.currency}/شهريًا</div>
        </div>
        <div className={`${styles.scenarioCard} ${styles.scenarioCardHighlight}`}>
          <div className="text-xs text-emerald-700 mb-1 font-semibold">السيناريو ب — شمسي + قرض أخضر</div>
          <div className="font-bold text-emerald-800">
            {fmt(result.scenarios.scenarioB_solarLoan.monthlyOutflowYear1)} {result.currency}/شهريًا
          </div>
        </div>
      </div>

      <div className={styles.miniStatGrid}>
        <MiniStat label="تكلفة المنظومة" value={`${fmt(result.loan.estimatedSystemCost)} ${result.currency}`} />
        <MiniStat label="القسط الشهري" value={`${fmt(result.loan.monthlyPMT)} ${result.currency}`} />
        <MiniStat label="العائد التراكمي 20 سنة" value={`${result.cashflow.cumulativeROI20yrPct ?? '—'}%`} />
        <MiniStat label="أشجار مكافئة/سنويًا" value={`${result.carbon.treesEquivalentPerYear}`} />
      </div>

      <div className="flex items-center justify-between">
        <Badge variant="outline" className="text-xs px-3 py-1 border-emerald-300 text-emerald-800 bg-emerald-50">
          أولوية التمويل: {result.leadScore.priority === 'high' ? 'عالية' : result.leadScore.priority === 'medium' ? 'متوسطة' : 'عادية'}
        </Badge>
      </div>

      <Button asChild variant="outline" className={styles.downloadBtn}>
        <a href={reportUrl} target="_blank" rel="noopener noreferrer">
          <Download className="h-4 w-4 ml-2" /> تحميل التقرير الكامل (PDF)
        </a>
      </Button>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.miniStatCard}>
      <div className={styles.miniStatValue}>{value}</div>
      <div className={styles.miniStatLabel}>{label}</div>
    </div>
  )
}

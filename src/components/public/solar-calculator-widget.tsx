'use client'

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/ui/radio-group'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ArrowUpLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Download,
  FileText,
  Leaf,
  Loader2,
  Sun,
  TrendingDown,
  User,
  Wallet,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  DEFAULT_CLIENT_FACTORS,
  runSolarCalculator,
  type SolarCalculatorResult,
  type SolarUserType,
} from '@/lib/solar-engine'

interface LeadFormState {
  fullName: string
  email: string
  phone: string
  companyName: string
}

interface SavedReport {
  inputKey: string
  result: SolarCalculatorResult
  reportUrl: string
}

const BILL_MIN = 100
const BILL_MAX = 20_000
const BILL_STEP = 50
const REQUEST_TIMEOUT = 30_000
const QUICK_BILLS = [300, 600, 1_200, 3_000]

const numberFormatter = new Intl.NumberFormat('ar-SA', {
  maximumFractionDigits: 0,
})

const decimalFormatter = new Intl.NumberFormat('ar-SA', {
  maximumFractionDigits: 1,
})

function formatNumber(
  value: number | null | undefined,
  decimals = false,
) {
  if (value == null || !Number.isFinite(value)) return '—'

return (decimals ? decimalFormatter : numberFormatter).format(value)
}

function formatUnit(
  value: number | null | undefined,
  unit: string,
  decimals = false,
) {
  const formatted = formatNumber(value, decimals)
  return formatted === '—' ? formatted : `${formatted} ${unit}`
}

function normalizeBill(value: number) {
  return Math.min(
    BILL_MAX,
    Math.max(BILL_MIN, Math.round(value / BILL_STEP) * BILL_STEP),
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Checks the fields consumed by this interface.
 * The server must still validate inputs and calculate authoritative results.
 */
function isSolarResult(value: unknown): value is SolarCalculatorResult {
  if (!isRecord(value)) return false

const { cashflow, carbon, loan, scenarios } = value

if (
    typeof value.currency !== 'string' ||
    !value.currency.trim() ||
    !isRecord(cashflow) ||
    !isRecord(carbon) ||
    !isRecord(loan) ||
    !isRecord(scenarios)
  ) {
    return false
  }

const scenarioA = scenarios.scenarioA_statusQuo
  const scenarioB = scenarios.scenarioB_solarLoan

if (!isRecord(scenarioA) || !isRecord(scenarioB)) return false

const requiredNumbers = [
    cashflow.netMonthlyCashflowDuringLoan,
    carbon.avoidedCO2TonsPerYear,
    carbon.treesEquivalentPerYear,
    loan.estimatedSystemCost,
    loan.monthlyPMT,
    scenarioA.monthlyCost,
    scenarioB.monthlyOutflowYear1,
  ]

const optionalNumbers = [
    cashflow.simplePaybackYears,
    cashflow.cumulativeROI20yrPct,
  ]

return (
    requiredNumbers.every(
      (number) => typeof number === 'number' && Number.isFinite(number),
    ) &&
    optionalNumbers.every(
      (number) =>
        number == null ||
        (typeof number === 'number' && Number.isFinite(number)),
    )
  )
}

function getSafeReportUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null

try {
    const url = new URL(value, window.location.origin)

const allowed =
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && url.origin === window.location.origin)

if (!allowed || url.username || url.password) return null

return url.href
  } catch {
    return null
  }
}

export function SolarCalculatorWidget() {
  const id = useId()

const [userType, setUserType] = useState<SolarUserType>('individual')
  const [monthlyBill, setMonthlyBill] = useState(600)
  const [billDraft, setBillDraft] = useState('600')
  const [loanPercent, setLoanPercent] = useState(70)
  const [loanTermYears, setLoanTermYears] = useState(5)
  const [loanInterestRatePct, setLoanInterestRatePct] = useState(6)

const [gateOpen, setGateOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [savedReport, setSavedReport] = useState<SavedReport | null>(null)

const [form, setForm] = useState<LeadFormState>({
    fullName: '',
    email: '',
    phone: '',
    companyName: '',
  })

const sessionIdRef = useRef('')
  const submittingRef = useRef(false)
  const requestRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(false)

const inputs = useMemo(
    () => ({
      userType,
      monthlyElectricityBill: monthlyBill,
      loanPercent,
      loanTermYears,
      loanInterestRatePct,
    }),
    [
      userType,
      monthlyBill,
      loanPercent,
      loanTermYears,
      loanInterestRatePct,
    ],
  )

const inputKey = JSON.stringify(inputs)

const teaser = useMemo(
    () => runSolarCalculator(inputs, DEFAULT_CLIENT_FACTORS),
    [inputs],
  )

// A report is valid only for the exact inputs used to generate it.
  const activeReport =
    savedReport?.inputKey === inputKey ? savedReport : null

const displayed = activeReport?.result ?? teaser
  const netCashflow = displayed.cashflow.netMonthlyCashflowDuringLoan
  const hasNegativeCashflow = netCashflow < 0

const billDraftNumber = Number(billDraft)
  const billDraftInvalid =
    !billDraft.trim() ||
    !Number.isFinite(billDraftNumber) ||
    billDraftNumber < BILL_MIN ||
    billDraftNumber > BILL_MAX ||
    billDraftNumber % BILL_STEP !== 0

useEffect(() => {
    mountedRef.current = true

if (!sessionIdRef.current && globalThis.crypto?.randomUUID) {
      sessionIdRef.current = globalThis.crypto.randomUUID()
    }

return () => {
      mountedRef.current = false
      requestRef.current?.abort()
    }
  }, [])

// Best-effort telemetry, without lead contact details.
  useEffect(() => {
    if (!sessionIdRef.current) return

const controller = new AbortController()

const timer = window.setTimeout(() => {
      void fetch('/api/public/solar-calculator/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          ...inputs,
          sessionId: sessionIdRef.current,
          countryCode: 'SA',
          currency: DEFAULT_CLIENT_FACTORS.currency,
          locale: 'ar',
        }),
      }).catch(() => {
        // Telemetry must never interrupt the calculator.
      })
    }, 1_200)

return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [inputs])

function updateBill(value: number) {
    const normalized = normalizeBill(value)
    setMonthlyBill(normalized)
    setBillDraft(String(normalized))
  }

function updateForm(field: keyof LeadFormState, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }))
    setSubmitError(null)
  }

function openReportDialog() {
    setSubmitError(null)
    setGateOpen(true)
  }

async function handleSubmitGate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

if (submittingRef.current) return

const fullName = form.fullName.trim()
    const email = form.email.trim()
    const phone = form.phone.trim()
    const companyName = form.companyName.trim()

if (fullName.length < 2) {
      setSubmitError('يرجى إدخال الاسم الكامل.')
      return
    }

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setSubmitError('يرجى إدخال بريد إلكتروني صحيح.')
      return
    }

if (userType === 'sme' && !companyName) {
      setSubmitError('يرجى إدخال اسم المنشأة.')
      return
    }

// Capture the input snapshot before starting the request.
    const submittedInputKey = inputKey
    const submittedInputs = { ...inputs }

const controller = new AbortController()
    requestRef.current = controller
    submittingRef.current = true

setSubmitting(true)
    setSubmitError(null)

const timeout = window.setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT,
    )

try {
      const response = await fetch('/api/public/solar-calculator/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          ...submittedInputs,
          fullName,
          email,
          phone: phone || undefined,
          companyName:
            submittedInputs.userType === 'sme' ? companyName : undefined,
          countryCode: 'SA',
          locale: 'ar',
        }),
      })

if (!response.ok) {
        throw new Error(
          response.status === 429
            ? 'طلبات كثيرة خلال وقت قصير. انتظر قليلًا ثم حاول مجددًا.'
            : 'تعذّر إصدار التقرير. يرجى المحاولة لاحقًا.',
        )
      }

const data: unknown = await response.json()

if (!isRecord(data) || !isSolarResult(data.result)) {
        throw new Error('وصلت استجابة غير مكتملة من الخادم.')
      }

const reportUrl = getSafeReportUrl(data.reportUrl)

if (!reportUrl) {
        throw new Error('تعذّر التحقق من رابط التقرير.')
      }

if (!mountedRef.current) return

setSavedReport({
        inputKey: submittedInputKey,
        result: data.result,
        reportUrl,
      })

setGateOpen(false)
      toast.success('تم إعداد تقريرك بنجاح')
    } catch (error) {
      if (!mountedRef.current) return

const message = controller.signal.aborted
        ? 'انتهت مهلة الانتظار دون تأكيد النتيجة. قد يكون الطلب وصل إلى الخادم.'
        : error instanceof TypeError
          ? 'تعذّر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.'
          : error instanceof SyntaxError
            ? 'تعذّر قراءة استجابة الخادم.'
            : error instanceof Error
              ? error.message
              : 'حدث خطأ غير متوقع.'

setSubmitError(message)
      // Do not automatically retry a lead-creation request.
    } finally {
      window.clearTimeout(timeout)

if (requestRef.current === controller) {
        requestRef.current = null
      }

submittingRef.current = false

if (mountedRef.current) {
        setSubmitting(false)
      }
    }
  }

return (
    <Card
      dir="rtl"
      className="gap-0 overflow-hidden rounded-3xl border-emerald-200/70 bg-background py-0 shadow-xl shadow-emerald-950/5 dark:border-emerald-900/60"
    >
      <CardHeader className="relative isolate overflow-hidden bg-gradient-to-bl from-emerald-950 via-emerald-800 to-teal-700 p-6 text-white sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-16 -top-20 -z-10 h-64 w-64 rounded-full border-[35px] border-white/5"
        />

<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Badge className="border-white/20 bg-white/10 px-3 py-1 text-white hover:bg-white/10">
            <Leaf aria-hidden="true" className="me-1.5 h-3.5 w-3.5" />
            خطّط لطاقة أنظف
          </Badge>

<span className="text-xs text-emerald-100">
            السعودية · {DEFAULT_CLIENT_FACTORS.currency}
          </span>
        </div>

<div className="flex items-start gap-4">
          <span className="hidden rounded-2xl border border-white/15 bg-white/10 p-3 sm:flex">
            <Sun aria-hidden="true" className="h-8 w-8 text-amber-200" />
          </span>

<div className="space-y-3">
            <CardTitle className="text-2xl font-bold leading-relaxed sm:text-3xl">
              حاسبة التمويل الشمسي
            </CardTitle>

<CardDescription className="max-w-xl text-sm leading-7 text-emerald-50/90">
              حوّل فاتورة الكهرباء إلى خطة أوضح. قارن التكاليف،
              واستكشف التدفق النقدي والأثر البيئي المتوقع.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

<CardContent className="p-4 sm:p-6 lg:p-8">
        <div className="grid items-start gap-6 lg:grid-cols-2 lg:gap-8">
          <fieldset
            disabled={submitting}
            className="min-w-0 space-y-7 disabled:opacity-60"
          >
            <legend className="sr-only">مدخلات الحساب</legend>

<SectionHeading
              icon={<Zap className="h-4 w-4" />}
              title="صمّم خطتك"
              description="غيّر المدخلات لمشاهدة التقدير مباشرة."
            />

<div className="space-y-3">
              <Label id={`${id}-customer-label`}>نوع العميل</Label>

<RadioGroup
                dir="rtl"
                aria-labelledby={`${id}-customer-label`}
                value={userType}
                onValueChange={(value) => {
                  if (value === 'individual' || value === 'sme') {
                    setUserType(value)
                  }
                }}
                className="grid gap-3 sm:grid-cols-2"
              >
                {[
                  {
                    value: 'individual',
                    title: 'أفراد',
                    description: 'لمنزلك واحتياجاتك اليومية',
                    icon: User,
                  },
                  {
                    value: 'sme',
                    title: 'منشآت',
                    description: 'للشركات الصغيرة والمتوسطة',
                    icon: Building2,
                  },
                ].map((item) => {
                  const Icon = item.icon
                  const selected = userType === item.value

return (
                    <label
                      key={item.value}
                      htmlFor={`${id}-${item.value}`}
                      className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition-colors motion-reduce:transition-none ${
                        selected
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40'
                          : 'border-border bg-background hover:bg-muted/50'
                      }`}
                    >
                      <RadioGroupItem
                        id={`${id}-${item.value}`}
                        value={item.value}
                      />

<Icon
                        aria-hidden="true"
                        className="h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-400"
                      />

<span>
                        <span className="block text-sm font-semibold">
                          {item.title}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {item.description}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </RadioGroup>
            </div>

<div className="space-y-4 rounded-2xl border bg-muted/20 p-4 sm:p-5">
              <Label htmlFor={`${id}-bill`}>
                فاتورة الكهرباء الشهرية
              </Label>

<div className="flex items-center gap-3">
                <Input
                  id={`${id}-bill`}
                  type="number"
                  inputMode="numeric"
                  dir="ltr"
                  min={BILL_MIN}
                  max={BILL_MAX}
                  step={BILL_STEP}
                  value={billDraft}
                  aria-invalid={billDraftInvalid}
                  aria-describedby={`${id}-bill-help`}
                  onChange={(event) => {
                    const raw = event.target.value
                    setBillDraft(raw)

const value = Number(raw)

if (
                      raw.trim() &&
                      Number.isFinite(value) &&
                      value >= BILL_MIN &&
                      value <= BILL_MAX &&
                      value % BILL_STEP === 0
                    ) {
                      setMonthlyBill(value)
                    }
                  }}
                  onBlur={() => {
                    updateBill(
                      billDraft.trim() && Number.isFinite(billDraftNumber)
                        ? billDraftNumber
                        : monthlyBill,
                    )
                  }}
                  className="h-14 rounded-xl bg-background text-center text-xl font-bold tabular-nums"
                />

<span className="shrink-0 text-sm text-muted-foreground">
                  {DEFAULT_CLIENT_FACTORS.currency}
                </span>
              </div>

<RangeControl
                id={`${id}-bill-range`}
                label="تعديل الفاتورة"
                value={monthlyBill}
                min={BILL_MIN}
                max={BILL_MAX}
                step={BILL_STEP}
                displayValue={formatUnit(
                  monthlyBill,
                  DEFAULT_CLIENT_FACTORS.currency,
                )}
                onChange={updateBill}
              />

<div className="flex flex-wrap gap-2">
                {QUICK_BILLS.map((amount) => (
                  <Button
                    key={amount}
                    type="button"
                    size="sm"
                    variant={monthlyBill === amount ? 'default' : 'outline'}
                    aria-pressed={monthlyBill === amount}
                    onClick={() => updateBill(amount)}
                    className={
                      monthlyBill === amount
                        ? 'rounded-full bg-emerald-700 text-white hover:bg-emerald-800'
                        : 'rounded-full'
                    }
                  >
                    {formatNumber(amount)}
                  </Button>
                ))}
              </div>

<p
                id={`${id}-bill-help`}
                className={`text-xs leading-6 ${
                  billDraftInvalid
                    ? 'text-amber-800 dark:text-amber-300'
                    : 'text-muted-foreground'
                }`}
              >
                من {formatNumber(BILL_MIN)} إلى {formatNumber(BILL_MAX)}،
                بخطوة {formatNumber(BILL_STEP)}. تُضبط القيمة عند مغادرة الحقل.
              </p>
            </div>

<div className="space-y-5">
              <SectionHeading
                icon={<Wallet className="h-4 w-4" />}
                title="خيارات التمويل"
              />

<RangeControl
                id={`${id}-percent`}
                label="نسبة التمويل"
                value={loanPercent}
                min={0}
                max={100}
                step={5}
                displayValue={formatUnit(loanPercent, '٪')}
                onChange={setLoanPercent}
              />

<div className="grid gap-5 sm:grid-cols-2">
                <RangeControl
                  id={`${id}-term`}
                  label="مدة التمويل بالسنوات"
                  value={loanTermYears}
                  min={1}
                  max={10}
                  step={1}
                  disabled={loanPercent === 0}
                  displayValue={formatNumber(loanTermYears)}
                  onChange={setLoanTermYears}
                />

<RangeControl
                  id={`${id}-interest`}
                  label="معدل الفائدة السنوي"
                  value={loanInterestRatePct}
                  min={0}
                  max={20}
                  step={0.5}
                  disabled={loanPercent === 0}
                  displayValue={formatUnit(loanInterestRatePct, '٪', true)}
                  onChange={setLoanInterestRatePct}
                />
              </div>

{loanPercent === 0 && (
                <p className="text-xs leading-6 text-muted-foreground">
                  اخترت الشراء دون قرض؛ المدة والفائدة لا تنطبقان على هذا الخيار.
                </p>
              )}
            </div>
          </fieldset>

<section
            aria-label="نتائج الحساب"
            className="min-w-0 space-y-4 lg:sticky lg:top-6"
          >
            <div className="rounded-3xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50 to-background p-5 dark:border-emerald-900 dark:from-emerald-950/40 sm:p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">نظرة على نتائجك</h3>
                <Badge variant="outline" className="bg-background/70">
                  {activeReport ? 'محسوبة عبر الخادم' : 'تقدير أولي'}
                </Badge>
              </div>

<div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <TrendingDown aria-hidden="true" className="h-4 w-4" />
                  صافي التدفق النقدي الشهري أثناء التمويل
                </div>

<p
                  className={`flex flex-wrap items-baseline gap-2 ${
                    hasNegativeCashflow
                      ? 'text-amber-800 dark:text-amber-300'
                      : 'text-emerald-800 dark:text-emerald-300'
                  }`}
                >
                  <bdi className="text-4xl font-extrabold tracking-tight tabular-nums sm:text-5xl">
                    {formatNumber(netCashflow)}
                  </bdi>
                  <span className="text-sm font-medium">
                    {displayed.currency} / شهر
                  </span>
                </p>

<p className="text-xs leading-6 text-muted-foreground">
                  {hasNegativeCashflow
                    ? 'التدفق سالب وفق هذه المدخلات؛ راجع نسبة التمويل ومدته وتكاليفه.'
                    : 'المبلغ المتوقع وفق افتراضات المحرك خلال فترة القرض.'}
                </p>
              </div>

<div className="mt-6 grid gap-3 sm:grid-cols-2">
                <MetricCard
                  icon={<Calendar className="h-4 w-4" />}
                  label="فترة الاسترداد البسيطة"
                  value={formatUnit(
                    displayed.cashflow.simplePaybackYears,
                    'سنة',
                    true,
                  )}
                />
                <MetricCard
                  icon={<Leaf className="h-4 w-4" />}
                  label="انبعاثات CO₂ المتجنبة سنويًا"
                  value={formatUnit(
                    displayed.carbon.avoidedCO2TonsPerYear,
                    'طن',
                    true,
                  )}
                />
              </div>
            </div>

{activeReport ? (
              <FullReportDetails
                result={activeReport.result}
                reportUrl={activeReport.reportUrl}
              />
            ) : (
              <div className="space-y-3 rounded-2xl border p-4">
                {savedReport && (
                  <p role="status" className="text-xs leading-6 text-muted-foreground">
                    تغيرت المدخلات؛ المعروض الآن تقدير جديد، ويلزم إصدار تقرير
                    مطابق للإعدادات الحالية.
                  </p>
                )}

<Button
                  type="button"
                  size="lg"
                  disabled={submitting || billDraftInvalid}
                  onClick={openReportDialog}
                  className="h-auto min-h-12 w-full gap-2 whitespace-normal rounded-xl bg-emerald-700 py-3 text-white shadow-md shadow-emerald-900/10 hover:bg-emerald-800"
                >
                  <FileText aria-hidden="true" className="h-4 w-4 shrink-0" />
                  {savedReport ? 'إصدار تقرير للمدخلات الجديدة' : 'احصل على تقريرك الكامل'}
                  <ArrowUpLeft aria-hidden="true" className="h-4 w-4 shrink-0" />
                </Button>

<p className="text-center text-xs leading-6 text-muted-foreground">
                  تفاصيل التكلفة والتمويل والأثر البيئي في تقرير واحد.
                </p>
              </div>
            )}
          </section>
        </div>

<p className="mt-7 border-t pt-4 text-xs leading-7 text-muted-foreground">
          النتائج تقديرية لأغراض التخطيط، ولا تمثل عرض تمويل أو ضمانًا للتوفير
          أو اعتمادًا من جهة ممولة. يستخدم التقدير الأولي عوامل مرجعية افتراضية،
          ويُعاد الحساب عبر الخادم عند طلب التقرير. تظل النتائج خاضعة لجودة
          المدخلات وافتراضات الحساب وظروف التركيب والتشغيل.
        </p>
      </CardContent>

<Dialog
        open={gateOpen}
        onOpenChange={(open) => {
          if (!submittingRef.current) setGateOpen(open)
        }}
      >
        <DialogContent
          dir="rtl"
          className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-md"
          onEscapeKeyDown={(event) => {
            if (submittingRef.current) event.preventDefault()
          }}
          onInteractOutside={(event) => {
            if (submittingRef.current) event.preventDefault()
          }}
        >
          <DialogHeader className="text-start sm:text-start">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              <FileText aria-hidden="true" className="h-6 w-6" />
            </div>

<DialogTitle>خطوتك التالية نحو الطاقة الشمسية</DialogTitle>

<DialogDescription className="leading-7">
              أدخل بياناتك لطلب التقرير التفصيلي وفق إعداداتك الحالية.
            </DialogDescription>
          </DialogHeader>

<form
            onSubmit={handleSubmitGate}
            aria-busy={submitting}
            className="space-y-5"
          >
            <fieldset disabled={submitting} className="space-y-4">
              <legend className="sr-only">بيانات طلب التقرير</legend>

<div className="space-y-2">
                <Label htmlFor={`${id}-name`}>الاسم الكامل *</Label>
                <Input
                  id={`${id}-name`}
                  name="fullName"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={120}
                  value={form.fullName}
                  onChange={(event) => updateForm('fullName', event.target.value)}
                  className="h-11 rounded-xl"
                />
              </div>

<div className="space-y-2">
                <Label htmlFor={`${id}-email`}>البريد الإلكتروني *</Label>
                <Input
                  id={`${id}-email`}
                  name="email"
                  type="email"
                  dir="ltr"
                  autoComplete="email"
                  required
                  maxLength={254}
                  placeholder="name@example.com"
                  value={form.email}
                  onChange={(event) => updateForm('email', event.target.value)}
                  className="h-11 rounded-xl"
                />
              </div>

<div className="space-y-2">
                <Label htmlFor={`${id}-phone`}>رقم الهاتف — اختياري</Label>
                <Input
                  id={`${id}-phone`}
                  name="phone"
                  type="tel"
                  dir="ltr"
                  autoComplete="tel"
                  maxLength={30}
                  value={form.phone}
                  onChange={(event) => updateForm('phone', event.target.value)}
                  className="h-11 rounded-xl"
                />
              </div>

{userType === 'sme' && (
                <div className="space-y-2">
                  <Label htmlFor={`${id}-company`}>اسم المنشأة *</Label>
                  <Input
                    id={`${id}-company`}
                    name="companyName"
                    autoComplete="organization"
                    required
                    maxLength={160}
                    value={form.companyName}
                    onChange={(event) =>
                      updateForm('companyName', event.target.value)
                    }
                    className="h-11 rounded-xl"
                  />
                </div>
              )}
            </fieldset>

{submitError && (
              <p
                role="alert"
                className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm leading-6 text-destructive"
              >
                {submitError}
              </p>
            )}

<p className="text-xs leading-6 text-muted-foreground">
              عند المتابعة ستُرسل البيانات المدخلة إلى الخادم لطلب التقرير.
              الحقول المشار إليها بعلامة * مطلوبة.
            </p>

<DialogFooter>
              <Button
                type="submit"
                disabled={submitting}
                className="h-12 w-full gap-2 rounded-xl bg-emerald-700 text-white hover:bg-emerald-800"
              >
                {submitting ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                ) : (
                  <FileText aria-hidden="true" className="h-4 w-4" />
                )}
                {submitting ? 'جارٍ إعداد التقرير…' : 'إصدار التقرير الكامل'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function SectionHeading({
  icon,
  title,
  description,
}: {
  icon: ReactNode
  title: string
  description?: string
}) {
  return (
    <div>
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <span
          aria-hidden="true"
          className="text-emerald-700 dark:text-emerald-400"
        >
          {icon}
        </span>
        {title}
      </h3>
      {description && (
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  )
}

function RangeControl({
  id,
  label,
  value,
  min,
  max,
  step,
  displayValue,
  disabled = false,
  onChange,
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  step: number
  displayValue: string
  disabled?: boolean
  onChange: (value: number) => void
}) {
  return (
    <div className={`space-y-2 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id} className="text-xs leading-6">
          {label}
        </Label>
        <output
          htmlFor={id}
          className="shrink-0 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold tabular-nums text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
        >
          {displayValue}
        </output>
      </div>

<input
        id={id}
        type="range"
        dir="rtl"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-valuetext={displayValue}
        onChange={(event) => onChange(Number(event.target.value))}
        className="block h-8 w-full cursor-pointer accent-emerald-600 focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600


'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calculator, TrendingUp, DollarSign, Zap, Leaf, AlertTriangle, Loader2 } from 'lucide-react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, Cell } from 'recharts'
import { toast } from 'sonner'
import { InfoTooltip } from '@/components/ui/info-tooltip'

// تعريفات المصطلحات المستخدمة في الحاسبة الاستثمارية، تظهر كغيمة صغيرة
// عند التحويم/الضغط على أيقونة (i) بجانب كل حقل أو نتيجة
const TERM_DEFINITIONS = {
  capacityKwp: 'القدرة المُركّبة لمنظومة الطاقة الشمسية، تُقاس بالكيلوواط الذروي (kWp)، وهي أساس حساب كمية الطاقة المُنتجة.',
  location: 'موقع المشروع، يُستخدم لتحديد متوسط ساعات سطوع الشمس اليومية (PSH) التي تؤثر مباشرة على الإنتاجية.',
  currency: 'العملة التي تُدخل بها جميع القيم المالية (CAPEX وOPEX والتعرفات)، دون تحويل تلقائي بين العملات.',
  capex: 'Capital Expenditure — النفقات الرأسمالية، وهي التكلفة الإجمالية لإنشاء المشروع (المعدات والتركيب) تُدفع مرة واحدة في البداية.',
  opexAnnual: 'Operational Expenditure — النفقات التشغيلية السنوية، وتشمل الصيانة والتشغيل والتأمين وغيرها من التكاليف المتكررة كل عام.',
  degradationRate: 'نسبة الانخفاض السنوي في كفاءة إنتاج الألواح الشمسية بسبب التقادم، تُقاس كنسبة مئوية من الإنتاج السنوي.',
  tariffRetail: 'سعر بيع الكهرباء بالتجزئة (أو سعر التوفير) لكل كيلوواط/ساعة، يُستخدم لحساب قيمة الطاقة المُستهلكة ذاتيًا.',
  tariffFeedIn: 'Feed-in Tariff — التعرفة التي تُدفع مقابل كل كيلوواط/ساعة من الطاقة الفائضة التي تُباع أو تُغذّى إلى الشبكة الكهربائية.',
  financingRate: 'نسبة تمويل المشروع عبر قرض (دين) من إجمالي التكلفة الرأسمالية (CAPEX)، والباقي يُموَّل من حقوق الملكية.',
  loanTermYears: 'المدة الزمنية بالسنوات التي يُسدَّد خلالها القرض المستخدم لتمويل جزء من المشروع.',
  loanInterestRate: 'معدل الفائدة السنوي المفروض على القرض، مستقل عن معدل الخصم المستخدم في حساب NPV.',
  selfConsumptionRate: 'نسبة الطاقة المُنتجة التي يستهلكها المشروع مباشرة بدل بيعها للشبكة، وتؤثر على مزيج الإيرادات بين تعرفة التجزئة وFeed-in.',
  inflationRate: 'معدل التضخم السنوي المتوقع، يُستخدم لتصعيد التكاليف (مثل OPEX) والإيرادات عبر عمر المشروع.',
  discountRate: 'معدل الخصم المستخدم لتحويل التدفقات النقدية المستقبلية إلى قيمتها الحالية عند حساب NPV.',
  systemLifetimeYears: 'العمر الافتراضي التشغيلي للمنظومة الشمسية بالسنوات، وهو الأفق الزمني المستخدم في كل الحسابات المالية.',
  annualEnergy: 'إجمالي الطاقة الكهربائية التي تُنتجها المنظومة خلال السنة الأولى من التشغيل، تُقاس بالكيلوواط/ساعة (kWh).',
  co2Avoided: 'كمية غاز ثاني أكسيد الكربون المكافئ (CO₂e) التي يتم تجنب انبعاثها بفضل استبدال الكهرباء التقليدية بالطاقة الشمسية.',
  annualRevenue: 'إجمالي الإيراد المتوقع من المشروع خلال السنة الأولى، ناتج عن بيع/توفير الطاقة المُنتجة.',
  specificYield: 'Specific Yield — مؤشر أداء يقيس كمية الطاقة المُنتجة سنويًا لكل كيلوواط ذروي مُركّب (kWh/kWp)، ويُستخدم لمقارنة كفاءة المواقع المختلفة.',
  npv: 'Net Present Value — صافي القيمة الحالية، وهو مجموع التدفقات النقدية المستقبلية للمشروع مخصومة إلى قيمتها الحالية؛ القيمة الموجبة تعني أن المشروع مُربح اقتصاديًا.',
  irr: 'Internal Rate of Return — معدل العائد الداخلي، وهو معدل الخصم الذي يجعل صافي القيمة الحالية (NPV) للمشروع يساوي صفرًا؛ كلما ارتفع كان المشروع أكثر جاذبية.',
  payback: 'Payback Period — فترة الاسترداد، وهي المدة الزمنية اللازمة لاسترجاع التكلفة الرأسمالية الأولية (CAPEX) من صافي التدفقات النقدية للمشروع.',
  lcoe: 'Levelized Cost of Energy — التكلفة المُسواة للطاقة، وهي متوسط تكلفة إنتاج كل كيلوواط/ساعة من الكهرباء عبر عمر المشروع بالكامل.',
  loanAmount: 'إجمالي قيمة القرض المستخدم لتمويل جزء من التكلفة الرأسمالية للمشروع، بناءً على نسبة التمويل المُحددة.',
  equityCapex: 'الجزء من التكلفة الرأسمالية الذي يُموَّل من حقوق الملكية (رأس المال الذاتي) دون اللجوء إلى القرض.',
  annualDebtService: 'القسط السنوي الثابت (أصل الدين + الفائدة) الذي يجب سداده لخدمة القرض خلال مدته.',
  dscr: 'Debt Service Coverage Ratio — نسبة تغطية خدمة الدين، تقيس قدرة التدفقات النقدية التشغيلية على تغطية أقساط الدين السنوية؛ القيمة أعلى من 1.2 تُعتبر مريحة عادةً.',
  cumulativeCashFlow: 'التدفق النقدي التراكمي منذ بداية المشروع، ونقطة تجاوزه للصفر تمثل لحظة استرداد رأس المال (Payback).',
  netCashFlow: 'صافي التدفق النقدي لسنة معينة، أي الفرق بين الإيرادات والتكاليف (بما فيها OPEX وخدمة الدين إن وُجدت) خلال تلك السنة.',
  sensitivity: 'تحليل الحساسية يوضح مدى تأثر صافي القيمة الحالية (NPV) بتغيّر أحد المدخلات الرئيسية (مثل CAPEX أو التعرفة أو الإنتاج) صعودًا أو هبوطًا.',
} as const

export function CalculatorSection() {
  const [inputs, setInputs] = useState({
    capacityKwp: 1000,
    location: 'riyadh',
    currency: 'SAR',
    capex: 1500000,
    opexAnnual: 22500,
    degradationRate: 0.005,
    tariffRetail: 0.18,
    tariffFeedIn: 0.10,
    selfConsumptionRate: 0.7,
    financingRate: 0,
    loanTermYears: 0,
    loanInterestRate: 0.06,
    inflationRate: 0.02,
    discountRate: 0.08,
    systemLifetimeYears: 25,
  })
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const run = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/calculator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inputs),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (data && data.results) {
        setResult(data)
        toast.success('اكتمل الحساب')
      } else {
        toast.error('استجابة غير صالحة')
      }
    } catch {
      toast.error('خطأ في الحساب')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  const fmt = (n: number) => (n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
  // Use the currency returned by the API (echoes back whatever the user
  // selected below) rather than a hardcoded 'SAR', since this platform
  // supports projects/tariffs in multiple currencies (SAR, AED, ...).
  const currencyLabel = result?.currency || inputs.currency || 'SAR'
  const fmtCurrency = (n: number) => `${fmt(n)} ${currencyLabel}`

  return (
    <div className="space-y-4">
      {/* Inputs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            مدخلات الحاسبة الاستثمارية
          </CardTitle>
          <CardDescription className="text-xs">
            NPV, IRR, Payback, LCOE - مع سيناريوهات وتحليل حساسية
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              القدرة (kWp)
            </Label>
            <Input
              type="number"
              value={inputs.capacityKwp}
              onChange={(e) => setInputs({ ...inputs, capacityKwp: +e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              الموقع
              <InfoTooltip text={TERM_DEFINITIONS.location} />
            </Label>
            <Select value={inputs.location} onValueChange={(v) => setInputs({ ...inputs, location: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="riyadh">الرياض (PSH: 6.5)</SelectItem>
                <SelectItem value="jeddah">جدة (PSH: 6.2)</SelectItem>
                <SelectItem value="dammam">الدمام (PSH: 6.3)</SelectItem>
                <SelectItem value="mecca">مكة (PSH: 6.4)</SelectItem>
                <SelectItem value="medina">المدينة (PSH: 6.6)</SelectItem>
                <SelectItem value="abu_dhabi">أبوظبي (PSH: 6.0)</SelectItem>
                <SelectItem value="dubai">دبي (PSH: 5.9)</SelectItem>
                <SelectItem value="doha">الدوحة (PSH: 5.8)</SelectItem>
                <SelectItem value="kuwait_city">الكويت (PSH: 5.9)</SelectItem>
                <SelectItem value="manama">المنامة (PSH: 5.7)</SelectItem>
                <SelectItem value="muscat">مسقط (PSH: 5.9)</SelectItem>
                <SelectItem value="cairo">القاهرة (PSH: 6.0)</SelectItem>
                <SelectItem value="amman">عمّان (PSH: 5.8)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              العملة
              <InfoTooltip text={TERM_DEFINITIONS.currency} />
            </Label>
            <Select value={inputs.currency} onValueChange={(v) => setInputs({ ...inputs, currency: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SAR">ريال سعودي (SAR)</SelectItem>
                <SelectItem value="AED">درهم إماراتي (AED)</SelectItem>
                <SelectItem value="QAR">ريال قطري (QAR)</SelectItem>
                <SelectItem value="KWD">دينار كويتي (KWD)</SelectItem>
                <SelectItem value="BHD">دينار بحريني (BHD)</SelectItem>
                <SelectItem value="OMR">ريال عُماني (OMR)</SelectItem>
                <SelectItem value="EGP">جنيه مصري (EGP)</SelectItem>
                <SelectItem value="JOD">دينار أردني (JOD)</SelectItem>
                <SelectItem value="USD">دولار أمريكي (USD)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              يجب إدخال CAPEX وOPEX والتعرفات كلها بنفس هذه العملة — لا يوجد تحويل عملات تلقائي
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              CAPEX ({inputs.currency})
              <InfoTooltip text={TERM_DEFINITIONS.capex} />
            </Label>
            <Input
              type="number"
              value={inputs.capex}
              onChange={(e) => setInputs({ ...inputs, capex: +e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              OPEX السنوي ({inputs.currency})
              <InfoTooltip text={TERM_DEFINITIONS.opexAnnual} />
            </Label>
            <Input
              type="number"
              value={inputs.opexAnnual}
              onChange={(e) => setInputs({ ...inputs, opexAnnual: +e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              التدهور السنوي (%)
              <InfoTooltip text={TERM_DEFINITIONS.degradationRate} />
            </Label>
            <Input
              type="number"
              step="0.1"
              value={inputs.degradationRate * 100}
              onChange={(e) => setInputs({ ...inputs, degradationRate: +e.target.value / 100 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              تعرفة البيع ({inputs.currency}/kWh)
              <InfoTooltip text={TERM_DEFINITIONS.tariffRetail} />
            </Label>
            <Input
              type="number"
              step="0.01"
              value={inputs.tariffRetail}
              onChange={(e) => setInputs({ ...inputs, tariffRetail: +e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              تعرفة Feed-in ({inputs.currency}/kWh)
              <InfoTooltip text={TERM_DEFINITIONS.tariffFeedIn} />
            </Label>
            <Input
              type="number"
              step="0.01"
              value={inputs.tariffFeedIn}
              onChange={(e) => setInputs({ ...inputs, tariffFeedIn: +e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              نسبة التمويل بالدين (%)
              <InfoTooltip text={TERM_DEFINITIONS.financingRate} />
            </Label>
            <Input
              type="number"
              step="1"
              value={inputs.financingRate * 100}
              onChange={(e) => setInputs({ ...inputs, financingRate: +e.target.value / 100 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              مدة القرض (سنة)
              <InfoTooltip text={TERM_DEFINITIONS.loanTermYears} />
            </Label>
            <Input
              type="number"
              value={inputs.loanTermYears}
              onChange={(e) => setInputs({ ...inputs, loanTermYears: +e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              فائدة القرض السنوية (%)
              <InfoTooltip text={TERM_DEFINITIONS.loanInterestRate} />
            </Label>
            <Input
              type="number"
              step="0.1"
              value={inputs.loanInterestRate * 100}
              onChange={(e) => setInputs({ ...inputs, loanInterestRate: +e.target.value / 100 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              نسبة الاستهلاك الذاتي (%)
              <InfoTooltip text={TERM_DEFINITIONS.selfConsumptionRate} />
            </Label>
            <Input
              type="number"
              value={inputs.selfConsumptionRate * 100}
              onChange={(e) => setInputs({ ...inputs, selfConsumptionRate: +e.target.value / 100 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              معدل التضخم (%)
              <InfoTooltip text={TERM_DEFINITIONS.inflationRate} />
            </Label>
            <Input
              type="number"
              step="0.1"
              value={inputs.inflationRate * 100}
              onChange={(e) => setInputs({ ...inputs, inflationRate: +e.target.value / 100 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              معدل الخصم (%)
              <InfoTooltip text={TERM_DEFINITIONS.discountRate} />
            </Label>
            <Input
              type="number"
              step="0.1"
              value={inputs.discountRate * 100}
              onChange={(e) => setInputs({ ...inputs, discountRate: +e.target.value / 100 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              عمر النظام (سنة)
              <InfoTooltip text={TERM_DEFINITIONS.systemLifetimeYears} />
            </Label>
            <Input
              type="number"
              value={inputs.systemLifetimeYears}
              onChange={(e) => setInputs({ ...inputs, systemLifetimeYears: +e.target.value })}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={run} disabled={loading} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 ml-1 animate-spin" /> : <Calculator className="h-4 w-4 ml-1" />}
              احسب
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <>
          {/* Key metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200">
              <div className="flex items-center gap-1 text-xs text-emerald-700 mb-1">
                <Zap className="h-3 w-3" /> طاقة سنوية (سنة 1)
                <InfoTooltip text={TERM_DEFINITIONS.annualEnergy} className="text-emerald-700/70" />
              </div>
              <p className="text-xl font-bold tabular-nums text-emerald-600">{fmt(result.results.annualEnergyYear1)}</p>
              <p className="text-[10px] text-muted-foreground">kWh</p>
            </Card>
            <Card className="p-4 bg-blue-50 dark:bg-blue-950/30 border-blue-200">
              <div className="flex items-center gap-1 text-xs text-blue-700 mb-1">
                <Leaf className="h-3 w-3" /> CO₂ متجنب (سنة 1)
                <InfoTooltip text={TERM_DEFINITIONS.co2Avoided} className="text-blue-700/70" />
              </div>
              <p className="text-xl font-bold tabular-nums text-blue-600">{fmt(result.results.annualCo2AvoidedYear1)}</p>
              <p className="text-[10px] text-muted-foreground">kgCO₂e</p>
            </Card>
            <Card className="p-4 bg-amber-50 dark:bg-amber-950/30 border-amber-200">
              <div className="flex items-center gap-1 text-xs text-amber-700 mb-1">
                <DollarSign className="h-3 w-3" /> إيراد سنوي (سنة 1)
                <InfoTooltip text={TERM_DEFINITIONS.annualRevenue} className="text-amber-700/70" />
              </div>
              <p className="text-xl font-bold tabular-nums text-amber-600">{fmt(result.results.annualRevenueYear1)}</p>
              <p className="text-[10px] text-muted-foreground">{currencyLabel}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                <TrendingUp className="h-3 w-3" /> Specific Yield
                <InfoTooltip text={TERM_DEFINITIONS.specificYield} />
              </div>
              <p className="text-xl font-bold tabular-nums">{fmt(result.results.specificYield)}</p>
              <p className="text-[10px] text-muted-foreground">kWh/kWp</p>
            </Card>
          </div>

          {/* Financial results */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">المؤشرات المالية</CardTitle>
                <CardDescription className="text-xs">
                  {inputs.financingRate > 0
                    ? 'NPV وIRR وPayback محسوبة على تدفقات حقوق الملكية (بعد خصم أقساط الدين)'
                    : 'NPV وIRR وPayback (بدون تمويل بالدين)'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-muted/40">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      NPV
                      <InfoTooltip text={TERM_DEFINITIONS.npv} />
                    </p>
                    <p className={`text-xl font-bold tabular-nums ${result.results.npv >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {fmtCurrency(result.results.npv)}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/40">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      IRR
                      <InfoTooltip text={TERM_DEFINITIONS.irr} />
                    </p>
                    <p className={`text-xl font-bold tabular-nums ${result.results.irr >= 8 ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {result.results.irr}%
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/40">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      Payback
                      <InfoTooltip text={TERM_DEFINITIONS.payback} />
                    </p>
                    <p className="text-xl font-bold tabular-nums">
                      {result.results.paybackYears ? `${result.results.paybackYears} سنة` : 'غير محقق'}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/40">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      LCOE
                      <InfoTooltip text={TERM_DEFINITIONS.lcoe} />
                    </p>
                    <p className="text-xl font-bold tabular-nums">
                      {result.results.lcoe} <span className="text-xs font-normal text-muted-foreground">{currencyLabel}/kWh</span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">سيناريوهات</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    { name: 'متحفظ', data: result.scenarios.conservative, color: 'text-amber-600' },
                    { name: 'أساسي', data: result.scenarios.base, color: 'text-emerald-600' },
                    { name: 'متفائل', data: result.scenarios.optimistic, color: 'text-blue-600' },
                  ].map((s) => (
                    <div key={s.name} className="flex items-center justify-between p-2 rounded-lg bg-muted/40">
                      <span className={`text-sm font-semibold ${s.color}`}>{s.name}</span>
                      <div className="text-left text-xs">
                        <p>NPV: <span className="font-bold tabular-nums">{fmtCurrency(s.data.npv)}</span></p>
                        <p>IRR: <span className="font-bold tabular-nums">{(s.data.irr * 100).toFixed(1)}%</span> • Payback: <span className="tabular-nums">{s.data.paybackYears ? `${s.data.paybackYears.toFixed(1)}y` : '—'}</span></p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Debt service (only meaningful when financing is used) */}
          {inputs.financingRate > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">التمويل بالدين</CardTitle>
                <CardDescription className="text-xs">
                  فائدة القرض ({(inputs.loanInterestRate * 100).toFixed(1)}%) مستقلة عن معدل الخصم المستخدم في NPV
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 rounded-lg bg-muted/40">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      قيمة القرض
                      <InfoTooltip text={TERM_DEFINITIONS.loanAmount} />
                    </p>
                    <p className="text-lg font-bold tabular-nums">{fmtCurrency(result.debtService.loanAmount)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/40">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      حقوق الملكية المدفوعة
                      <InfoTooltip text={TERM_DEFINITIONS.equityCapex} />
                    </p>
                    <p className="text-lg font-bold tabular-nums">{fmtCurrency(result.debtService.equityCapex)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/40">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      قسط سنوي
                      <InfoTooltip text={TERM_DEFINITIONS.annualDebtService} />
                    </p>
                    <p className="text-lg font-bold tabular-nums">{fmtCurrency(result.debtService.annualDebtService)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/40">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      DSCR (متوسط مدة القرض)
                      <InfoTooltip text={TERM_DEFINITIONS.dscr} />
                    </p>
                    <p className={`text-lg font-bold tabular-nums ${result.debtService.dscr && result.debtService.dscr >= 1.2 ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {result.debtService.dscr ?? '—'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Cash flow chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-1">
                التدفق النقدي التراكمي
                <InfoTooltip text={TERM_DEFINITIONS.cumulativeCashFlow} />
              </CardTitle>
              <CardDescription className="text-xs">عبر عمر النظام ({inputs.systemLifetimeYears} سنة)</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={result.cashFlows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="year" tick={{ fontSize: 10 }} tickFormatter={(y) => `س${y}`} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    formatter={(v: number, name: string) => {
                      if (name === 'cumulativeCashFlow') return [fmtCurrency(v), 'تراكمي']
                      if (name === 'netCashFlow') return [fmtCurrency(v), 'صافي سنوي']
                      if (name === 'energy') return [fmt(v) + ' kWh', 'طاقة']
                      if (name === 'co2Avoided') return [fmt(v) + ' kg', 'CO₂e']
                      return [fmt(v), name]
                    }}
                    labelFormatter={(y) => `السنة ${y}`}
                  />
                  <Legend formatter={(name) => name === 'cumulativeCashFlow' ? 'تراكمي' : name === 'netCashFlow' ? 'صافي سنوي' : name} />
                  <ReferenceLine y={0} stroke="#dc2626" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="cumulativeCashFlow" stroke="#16a34a" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="netCashFlow" stroke="#0891b2" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Energy production chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">الطاقة المُنتجة وCO₂ المتجنب سنويًا</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={result.cashFlows.slice(1)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 10 }} tickFormatter={(y) => `س${y}`} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    formatter={(v: number, name: string) => name === 'energy' ? [fmt(v) + ' kWh', 'طاقة'] : [fmt(v) + ' kg', 'CO₂e']}
                    labelFormatter={(y) => `السنة ${y}`}
                  />
                  <Legend formatter={(name) => name === 'energy' ? 'طاقة (kWh)' : 'CO₂e (kg)'} />
                  <Bar dataKey="energy" fill="#16a34a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="co2Avoided" fill="#0891b2" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Sensitivity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-1">
                تحليل الحساسية
                <InfoTooltip text={TERM_DEFINITIONS.sensitivity} />
              </CardTitle>
              <CardDescription className="text-xs">تأثير تغيّر المدخلات على NPV</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Object.entries(result.sensitivity).map(([key, data]: [string, any]) => (
                  <div key={key}>
                    <p className="text-xs font-semibold mb-2">
                      {key === 'capex' ? 'CAPEX' : key === 'tariff' ? 'التعرفة' : 'الإنتاج'}
                    </p>
                    <ResponsiveContainer width="100%" height={120}>
                      <BarChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                        <XAxis dataKey="change" tick={{ fontSize: 9 }} />
                        <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                        <Tooltip
                          contentStyle={{ fontSize: 11, borderRadius: 6 }}
                          formatter={(v: number) => [fmtCurrency(v), 'NPV']}
                        />
                        <Bar dataKey="npv" radius={[3, 3, 0, 0]}>
                          {data.map((d: any, i: number) => (
                            <Cell key={i} fill={d.change === '0%' ? '#16a34a' : d.npv < 0 ? '#dc2626' : '#0891b2'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Disclaimer */}
          <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200">
            <CardContent className="p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-300">{result.disclaimer}</p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

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

export function CalculatorSection() {
  const [inputs, setInputs] = useState({
    capacityKwp: 1000,
    location: 'riyadh',
    capex: 1500000,
    opexAnnual: 22500,
    degradationRate: 0.005,
    tariffRetail: 0.18,
    tariffFeedIn: 0.10,
    selfConsumptionRate: 0.7,
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
      const data = await res.json()
      setResult(data)
      toast.success('اكتمل الحساب')
    } catch (e) {
      toast.error('خطأ في الحساب')
    } finally {
      setLoading(false)
    }
  }

  const fmt = (n: number) => (n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
  const fmtCurrency = (n: number) => `${fmt(n)} ${'SAR'}`

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
            <Label className="text-xs">القدرة (kWp)</Label>
            <Input
              type="number"
              value={inputs.capacityKwp}
              onChange={(e) => setInputs({ ...inputs, capacityKwp: +e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">الموقع</Label>
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
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">CAPEX (SAR)</Label>
            <Input
              type="number"
              value={inputs.capex}
              onChange={(e) => setInputs({ ...inputs, capex: +e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">OPEX السنوي (SAR)</Label>
            <Input
              type="number"
              value={inputs.opexAnnual}
              onChange={(e) => setInputs({ ...inputs, opexAnnual: +e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">التدهور السنوي (%)</Label>
            <Input
              type="number"
              step="0.1"
              value={inputs.degradationRate * 100}
              onChange={(e) => setInputs({ ...inputs, degradationRate: +e.target.value / 100 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">تعرفة البيع (SAR/kWh)</Label>
            <Input
              type="number"
              step="0.01"
              value={inputs.tariffRetail}
              onChange={(e) => setInputs({ ...inputs, tariffRetail: +e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">تعرفة Feed-in (SAR/kWh)</Label>
            <Input
              type="number"
              step="0.01"
              value={inputs.tariffFeedIn}
              onChange={(e) => setInputs({ ...inputs, tariffFeedIn: +e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">نسبة الاستهلاك الذاتي (%)</Label>
            <Input
              type="number"
              value={inputs.selfConsumptionRate * 100}
              onChange={(e) => setInputs({ ...inputs, selfConsumptionRate: +e.target.value / 100 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">معدل التضخم (%)</Label>
            <Input
              type="number"
              step="0.1"
              value={inputs.inflationRate * 100}
              onChange={(e) => setInputs({ ...inputs, inflationRate: +e.target.value / 100 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">معدل الخصم (%)</Label>
            <Input
              type="number"
              step="0.1"
              value={inputs.discountRate * 100}
              onChange={(e) => setInputs({ ...inputs, discountRate: +e.target.value / 100 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">عمر النظام (سنة)</Label>
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
              </div>
              <p className="text-xl font-bold tabular-nums text-emerald-600">{fmt(result.results.annualEnergyYear1)}</p>
              <p className="text-[10px] text-muted-foreground">kWh</p>
            </Card>
            <Card className="p-4 bg-blue-50 dark:bg-blue-950/30 border-blue-200">
              <div className="flex items-center gap-1 text-xs text-blue-700 mb-1">
                <Leaf className="h-3 w-3" /> CO₂ متجنب (سنة 1)
              </div>
              <p className="text-xl font-bold tabular-nums text-blue-600">{fmt(result.results.annualCo2AvoidedYear1)}</p>
              <p className="text-[10px] text-muted-foreground">kgCO₂e</p>
            </Card>
            <Card className="p-4 bg-amber-50 dark:bg-amber-950/30 border-amber-200">
              <div className="flex items-center gap-1 text-xs text-amber-700 mb-1">
                <DollarSign className="h-3 w-3" /> إيراد سنوي (سنة 1)
              </div>
              <p className="text-xl font-bold tabular-nums text-amber-600">{fmt(result.results.annualRevenueYear1)}</p>
              <p className="text-[10px] text-muted-foreground">SAR</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                <TrendingUp className="h-3 w-3" /> Specific Yield
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
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-muted/40">
                    <p className="text-xs text-muted-foreground">NPV</p>
                    <p className={`text-xl font-bold tabular-nums ${result.results.npv >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {fmtCurrency(result.results.npv)}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/40">
                    <p className="text-xs text-muted-foreground">IRR</p>
                    <p className={`text-xl font-bold tabular-nums ${result.results.irr >= 8 ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {result.results.irr}%
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/40">
                    <p className="text-xs text-muted-foreground">Payback</p>
                    <p className="text-xl font-bold tabular-nums">
                      {result.results.paybackYears ? `${result.results.paybackYears} سنة` : 'غير محقق'}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/40">
                    <p className="text-xs text-muted-foreground">LCOE</p>
                    <p className="text-xl font-bold tabular-nums">
                      {result.results.lcoe_fils} <span className="text-xs font-normal text-muted-foreground">fils/kWh</span>
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

          {/* Cash flow chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">التدفق النقدي التراكمي</CardTitle>
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
              <CardTitle className="text-base">تحليل الحساسية</CardTitle>
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

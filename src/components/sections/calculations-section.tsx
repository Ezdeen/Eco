'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Calculator, FlaskConical, Code2, Database, TrendingUp, Leaf, DollarSign, Activity } from 'lucide-react'
import { toast } from 'sonner'

export function CalculationsSection() {
  const [projects, setProjects] = useState<any[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [recentRuns, setRecentRuns] = useState<any[]>([])
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<any>(null)

  useEffect(() => {
    fetch('/api/projects').then((r) => r.json()).then((d) => setProjects(d.projects || []))
    fetch('/api/calculations').then((r) => r.json()).then((d) => setRecentRuns(d.calculationRuns || []))
  }, [])

  const runCalculation = async () => {
    if (!selectedProject) {
      toast.error('اختر مشروعًا أولاً')
      return
    }
    setRunning(true)
    setResult(null)
    try {
      const now = new Date()
      const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      const res = await fetch('/api/calculations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject,
          periodStart: periodStart.toISOString(),
          periodEnd: now.toISOString(),
          methodologyVersion: 'ghg_protocol_scope2_v1.2',
        }),
      })
      const data = await res.json()
      if (data.success) {
        setResult(data)
        toast.success('اكتمل الحساب بنجاح')
        // Refresh recent runs
        const r = await fetch('/api/calculations')
        const d = await r.json()
        setRecentRuns(d.calculationRuns || [])
      } else {
        toast.error('فشل الحساب')
      }
    } catch (e) {
      toast.error('خطأ في الاتصال')
    } finally {
      setRunning(false)
    }
  }

  const fmt = (n: number) => (n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })

  return (
    <div className="space-y-4">
      {/* Methodology cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900 text-emerald-600">
              <Leaf className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-sm">الكربون المتجنب</p>
              <p className="text-xs text-muted-foreground">GHG Protocol Scope 2</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            CO₂e = الطاقة الصافية × معامل انبعاث الشبكة (location-based)
          </p>
          <Badge variant="outline" className="mt-2 text-xs">v1.2 - معتمد</Badge>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900 text-blue-600">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-sm">الأداء</p>
              <p className="text-xs text-muted-foreground">IEC 61724</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            PR = Final Yield / Reference Yield
          </p>
          <Badge variant="outline" className="mt-2 text-xs">v2.0 - معتمد</Badge>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900 text-amber-600">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-sm">الوفر المالي</p>
              <p className="text-xs text-muted-foreground">Self-consumption + Feed-in</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            الوفر = (Self-consumed × Retail) + (Exported × Feed-in)
          </p>
          <Badge variant="outline" className="mt-2 text-xs">v1.0 - معتمد</Badge>
        </Card>
      </div>

      {/* Run new calculation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            تشغيل حساب جديد
          </CardTitle>
          <CardDescription className="text-xs">
            يتم حفظ إصدار الصيغة والمعاملات والمدخلات لإعادة إنتاج كل نتيجة لاحقًا
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">المشروع</Label>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر مشروعًا" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nameAr || p.name} ({p.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">المنهجية</Label>
              <Select defaultValue="ghg_protocol_scope2_v1.2">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ghg_protocol_scope2_v1.2">GHG Protocol Scope 2 v1.2</SelectItem>
                  <SelectItem value="ghg_protocol_scope2_v1.1">GHG Protocol Scope 2 v1.1</SelectItem>
                  <SelectItem value="iso_14064_2_v1.0">ISO 14064-2 v1.0</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">الفترة</Label>
              <Select defaultValue="30d">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">آخر 7 أيام</SelectItem>
                  <SelectItem value="30d">آخر 30 يومًا</SelectItem>
                  <SelectItem value="90d">آخر 90 يومًا</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={runCalculation} disabled={running || !selectedProject} className="w-full md:w-auto">
            <Calculator className="h-4 w-4 ml-1" />
            {running ? 'جاري الحساب...' : 'تشغيل الحساب'}
          </Button>

          {result && (
            <div className="mt-4 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
                <h4 className="font-semibold text-sm">نتائج الحساب</h4>
                <Badge variant="outline" className="text-xs ml-auto">Run ID: {result.run.id.slice(0, 8)}</Badge>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">إجمالي الطاقة</p>
                  <p className="font-bold tabular-nums">{fmt(result.details.totalEnergyKwh)} kWh</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">CO₂e متجنب</p>
                  <p className="font-bold tabular-nums">{fmt(result.details.totalCo2AvoidedKg)} kg</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">الوفر</p>
                  <p className="font-bold tabular-nums">{fmt(result.details.totalSavings)} SAR</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Performance Ratio</p>
                  <p className="font-bold tabular-nums">{(result.details.performanceRatio * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Specific Yield</p>
                  <p className="font-bold tabular-nums">{fmt(result.details.specificYield)} kWh/kWp</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">التوافر</p>
                  <p className="font-bold tabular-nums">{(result.details.availability * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">أشجار مكافئة</p>
                  <p className="font-bold tabular-nums">{fmt(result.details.treeEquivalent)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">كم سيارة متجنّب</p>
                  <p className="font-bold tabular-nums">{fmt(result.details.carKmAvoided)} km</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-emerald-200 text-xs text-muted-foreground">
                <p>معامل الانبعاث: {result.details.emissionFactor.factor} kgCO₂e/kWh ({result.details.emissionFactor.source})</p>
                <p>عدد القراءات: {result.details.readingsCount} • Hash: <code className="font-mono">{result.run.parametersHash?.slice(0, 24)}...</code></p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reference data */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-5 w-5" />
            المعاملات المرجعية
          </CardTitle>
          <CardDescription className="text-xs">معاملات موثقة ذات إصدارات - لا تستخدم قيمًا ثابتة افتراضية</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs p-3 rounded-lg bg-muted/40">
              <div>
                <p className="text-muted-foreground">المعامل</p>
                <p className="font-semibold">معامل انبعاث الشبكة (SA)</p>
              </div>
              <div>
                <p className="text-muted-foreground">القيمة</p>
                <p className="font-semibold tabular-nums">0.432 kgCO₂e/kWh</p>
              </div>
              <div>
                <p className="text-muted-foreground">المصدر</p>
                <p className="font-semibold">Saudi Electricity Company</p>
              </div>
              <div>
                <p className="text-muted-foreground">السريان</p>
                <p className="font-semibold">2024-01-01 → حالي</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs p-3 rounded-lg bg-muted/40">
              <div>
                <p className="text-muted-foreground">المعامل</p>
                <p className="font-semibold">عامل الشجرة المكافئ</p>
              </div>
              <div>
                <p className="text-muted-foreground">القيمة</p>
                <p className="font-semibold tabular-nums">21 kg CO₂/شجرة/سنة</p>
              </div>
              <div>
                <p className="text-muted-foreground">المصدر</p>
                <p className="font-semibold">EPA - 2024</p>
              </div>
              <div>
                <p className="text-muted-foreground">السريان</p>
                <p className="font-semibold">2024-01-01 → حالي</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs p-3 rounded-lg bg-muted/40">
              <div>
                <p className="text-muted-foreground">المعامل</p>
                <p className="font-semibold">عامل السيارة المكافف</p>
              </div>
              <div>
                <p className="text-muted-foreground">القيمة</p>
                <p className="font-semibold tabular-nums">0.12 kg CO₂/km</p>
              </div>
              <div>
                <p className="text-muted-foreground">المصدر</p>
                <p className="font-semibold">EPA - 2024</p>
              </div>
              <div>
                <p className="text-muted-foreground">السريان</p>
                <p className="font-semibold">2024-01-01 → حالي</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent runs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-5 w-5" />
            آخر عمليات الحساب
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {recentRuns.slice(0, 5).map((r) => (
            <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 hover:bg-muted transition-colors">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Code2 className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">{r.project?.nameAr || r.project?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(r.periodStart).toLocaleDateString('ar-SA')} → {new Date(r.periodEnd).toLocaleDateString('ar-SA')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <div className="text-left">
                  <p className="font-semibold tabular-nums">{r.totalEnergyKwh?.toLocaleString() || '—'} kWh</p>
                  <p className="text-muted-foreground">{r.totalCo2AvoidedKg?.toLocaleString() || '—'} kgCO₂e</p>
                </div>
                <Badge variant="outline" className="text-xs">{r.methodologyVersion}</Badge>
                <Badge variant="default" className="text-xs bg-emerald-600">{r.status === 'completed' ? 'مكتمل' : r.status}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

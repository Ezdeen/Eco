import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectAccess } from '@/lib/authorization'
import { createProjectBaselineSchema } from '@/lib/validation'
import { getEmissionFactor } from '@/lib/reference-data'
import {
  computeEnergyBaseline,
  computeWaterBaseline,
  convertLandAreaToSqm,
  STANDARDS_APPLIED,
  ESG_ALIGNMENT,
  buildDmrvLinkageNotes,
  type BaselineCategory,
} from '@/lib/baseline'

interface Params {
  params: Promise<{ id: string }>
}

// ============== حاسبة خط الأساس البيئي (dMRV Baseline Impact Calculator for SMEs) ==============
//
// GET  /api/projects/[id]/baseline  → يعيد سجل الأساس الرسمي الحالي (آخر confirmed) + السجل الكامل
// POST /api/projects/[id]/baseline  → يحسب ويحفظ خط أساس جديد من بيانات تاريخية (فواتير) يدخلها
//                                      المستخدم عند تسجيل مشروع قائم مسبقًا (Legacy) ينتقل لحل أخضر
//
// المخرجات تطابق مخطط JSON المعتمد لهذه الميزة (project_id, category, baseline_period_months,
// baseline_metrics, standards_applied, dmrv_linkage_notes, esg_alignment) وتُحفظ أيضًا داخل
// resultPayload لأغراض التدقيق والتصدير في تقارير ESG لاحقًا.

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id: projectId } = await params
    const auth = await requireProjectAccess(projectId, 'project:read')
    if (!auth.authorized) return auth.response

    const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } })
    if (!project) return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })

    const baselines = await db.projectBaseline.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    })

    const current = baselines.find((b) => b.status === 'confirmed') ?? baselines[0] ?? null

    return NextResponse.json({
      current,
      history: baselines,
    })
  } catch (error) {
    console.error('Failed to fetch project baseline:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء جلب خط الأساس' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id: projectId } = await params
    // نفس صلاحية تشغيل الحسابات الأخرى في المنصة (calculationSchema/calculations)
    const auth = await requireProjectAccess(projectId, 'calculation:run')
    if (!auth.authorized) return auth.response

    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, organizationId: true, country: true, currency: true },
    })
    if (!project) return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'صيغة JSON غير صالحة' }, { status: 400 })
    }

    const parsed = createProjectBaselineSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'بيانات خط الأساس غير صحيحة', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const data = parsed.data
    const category = data.category as BaselineCategory

    // الدولة/المنطقة: من المدخل، وإلا من دولة المشروع نفسه (fallback منطقي)
    const countryCode = data.gridRegionOrCountry || project.country || 'SA'
    const emissionFactor = await getEmissionFactor(countryCode)

    // الفواتير التاريخية المُدخلة مسبقًا عبر الجدول (شهر/سنة/مبلغ) لهذا المشروع والفئة -
    // هي مصدر "إجمالي قيمة الفاتورة" الآن، بدل متوسط شهري تقديري يُدخل يدويًا هنا.
    const invoices = await db.projectBaselineInvoice.findMany({
      where: { projectId, category },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    })

    let totalEnergyKwh: number | null = null
    let totalWaterLiters: number | null = null
    let baselineCo2eTons = 0
    let pumpingCo2eTons: number | null = null
    let waterIntensityPerSqm: number | null = null
    let effectiveBaselinePeriodMonths: number
    let monthlyElectricityBillAvg: number | null = null
    let waterBillAvg: number | null = null
    const warnings: string[] = []

    if (category === 'RENEWABLE_ENERGY') {
      if (invoices.length === 0) {
        return NextResponse.json(
          { error: 'أضف فاتورة كهرباء واحدة على الأقل (شهر/سنة/مبلغ) من جدول الفواتير قبل احتساب خط الأساس' },
          { status: 400 },
        )
      }
      const totalBillValue = invoices.reduce((sum, inv) => sum + inv.amount, 0)
      effectiveBaselinePeriodMonths = invoices.length
      monthlyElectricityBillAvg = totalBillValue / effectiveBaselinePeriodMonths

      const result = computeEnergyBaseline({
        monthlyElectricityBill: monthlyElectricityBillAvg,
        electricityRate: data.electricityRate as number,
        timePeriodMonths: effectiveBaselinePeriodMonths,
        emissionFactorKgPerKwh: emissionFactor.factor,
      })
      totalEnergyKwh = result.totalEnergyKwh
      baselineCo2eTons = result.baselineCo2eTons
    } else {
      const landAreaSqm = convertLandAreaToSqm(data.landAreaValue as number, data.landAreaUnit)
      const hasInvoices = invoices.length > 0 && data.waterRatePerLiter != null && data.waterRatePerLiter > 0
      const hasPumpData = data.pumpPowerCapacityKw != null && data.pumpOperatingHoursPerDay != null

      if (hasInvoices) {
        const totalBillValue = invoices.reduce((sum, inv) => sum + inv.amount, 0)
        effectiveBaselinePeriodMonths = invoices.length
        waterBillAvg = totalBillValue / effectiveBaselinePeriodMonths
      } else if (hasPumpData) {
        if (!data.baselinePeriodMonths) {
          return NextResponse.json(
            { error: 'عدد الأشهر مطلوب عند الاحتساب عبر قدرة المضخة (بدون فواتير)' },
            { status: 400 },
          )
        }
        effectiveBaselinePeriodMonths = data.baselinePeriodMonths
      } else {
        return NextResponse.json(
          {
            error: invoices.length === 0
              ? 'أضف فاتورة مياه واحدة على الأقل من جدول الفواتير، أو أدخل قدرة المضخة وساعات التشغيل اليومية'
              : 'أدخل تعرفة المياه لكل لتر لاستخدام الفواتير المُدخلة',
          },
          { status: 400 },
        )
      }

      const result = computeWaterBaseline({
        timePeriodMonths: effectiveBaselinePeriodMonths,
        emissionFactorKgPerKwh: emissionFactor.factor,
        landAreaSqm,
        waterBill: waterBillAvg,
        waterRatePerLiter: data.waterRatePerLiter,
        pumpOperatingHoursPerDay: data.pumpOperatingHoursPerDay,
        pumpPowerCapacityKw: data.pumpPowerCapacityKw,
        pumpEnergyKwhPerM3: data.pumpEnergyKwhPerM3,
      })
      totalWaterLiters = result.totalWaterLiters
      waterIntensityPerSqm = result.waterIntensityPerSqm
      pumpingCo2eTons = result.pumpingCo2eTons
      baselineCo2eTons = result.pumpingCo2eTons ?? 0
      warnings.push(...result.warnings)
    }

    const standardsApplied = STANDARDS_APPLIED[category]
    const esgAlignment = ESG_ALIGNMENT[category]
    const dmrvLinkageNotes = buildDmrvLinkageNotes(category)

    // مخطط JSON الرسمي المعتمد لهذه الميزة - يُحفظ كاملاً في resultPayload للتدقيق/التصدير
    const resultPayload = {
      project_id: projectId,
      category,
      baseline_period_months: effectiveBaselinePeriodMonths,
      baseline_metrics: {
        total_energy_kwh: totalEnergyKwh,
        total_water_liters: totalWaterLiters,
        baseline_co2e_tons: baselineCo2eTons,
        water_intensity_per_sqm: waterIntensityPerSqm,
      },
      standards_applied: standardsApplied,
      dmrv_linkage_notes: dmrvLinkageNotes,
      esg_alignment: {
        gri_standards: esgAlignment.griStandards,
        sdg_goals: esgAlignment.sdgGoals,
      },
      emission_factor: {
        value: emissionFactor.factor,
        source: emissionFactor.source,
        version: emissionFactor.version,
        from_db: emissionFactor.fromDb,
      },
      source_invoices_count: invoices.length,
      warnings,
    }

    const created = await db.$transaction(async (tx) => {
      // أي سجل "confirmed" سابق لنفس الفئة يُصبح "superseded" - يبقى محفوظًا بالكامل
      // للتدقيق (لا يُحذف أبدًا)، لكن السجل الجديد هو خط الأساس الرسمي المعتمد الآن.
      await tx.projectBaseline.updateMany({
        where: { projectId, category, status: 'confirmed' },
        data: { status: 'superseded' },
      })

      const baseline = await tx.projectBaseline.create({
        data: {
          projectId,
          category,
          status: 'confirmed',
          baselinePeriodMonths: effectiveBaselinePeriodMonths,

          monthlyElectricityBill: monthlyElectricityBillAvg,
          electricityRate: data.electricityRate ?? null,
          gridRegionOrCountry: countryCode,

          waterBill: waterBillAvg,
          waterRatePerLiter: data.waterRatePerLiter ?? null,
          pumpOperatingHoursPerDay: data.pumpOperatingHoursPerDay ?? null,
          pumpPowerCapacityKw: data.pumpPowerCapacityKw ?? null,
          pumpEnergyKwhPerM3: data.pumpEnergyKwhPerM3 ?? null,
          landAreaValue: data.landAreaValue ?? null,
          landAreaUnit: data.landAreaUnit,
          cropType: data.cropType ?? null,

          totalEnergyKwh,
          totalWaterLiters,
          baselineCo2eTons,
          pumpingCo2eTons,
          waterIntensityPerSqm,

          emissionFactorValue: emissionFactor.factor,
          emissionFactorSource: emissionFactor.source,
          emissionFactorVersion: emissionFactor.version,

          methodologyVersion: 'dmrv-baseline-v1',
          standardsApplied: JSON.stringify(standardsApplied),
          dmrvLinkageNotes,
          esgAlignment: JSON.stringify(esgAlignment),
          resultPayload: JSON.stringify(resultPayload),

          createdBy: auth.user.userId,
        },
      })

      await tx.auditEvent.create({
        data: {
          organizationId: project.organizationId,
          projectId,
          userId: auth.user.userId,
          actor: auth.user.email,
          action: 'project.baseline.create',
          resource: 'project_baseline',
          resourceId: baseline.id,
          result: 'success',
          metadata: JSON.stringify({
            category,
            baselinePeriodMonths: effectiveBaselinePeriodMonths,
            baselineCo2eTons,
            sourceInvoicesCount: invoices.length,
          }),
        },
      })

      return baseline
    })

    return NextResponse.json({
      success: true,
      baseline: created,
      ...resultPayload,
    })
  } catch (error) {
    console.error('Failed to compute project baseline:', error)
    const message = error instanceof Error ? error.message : 'حدث خطأ أثناء احتساب خط الأساس'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectAccess } from '@/lib/authorization'
import { getEmissionFactor } from '@/lib/reference-data'
import {
  computeIrrigationRecommendation,
  calculateWaterSavings,
  estimateBaselineWaterUseM3,
  type WaterSavingsResult,
} from '@/lib/irrigation'
import { assessWaterRecommendation } from '@/lib/water-comparison'

// GET /api/irrigation/recommendations?projectId=...
// يعيد آخر توصيات الري المولَّدة لمشروع ري ذكي (لأغراض العرض والتدقيق - dMRV trail)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    if (!projectId) {
      return NextResponse.json({ error: 'projectId مطلوب' }, { status: 400 })
    }

    const auth = await requireProjectAccess(projectId, 'reading:read')
    if (!auth.authorized) return auth.response

    const recommendations = await db.irrigationRecommendation.findMany({
      where: { projectId },
      orderBy: { generatedAt: 'desc' },
      take: 30,
    })

    return NextResponse.json({ recommendations })
  } catch (error) {
    console.error('List irrigation recommendations error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/irrigation/recommendations
// body: { projectId, periodStart, periodEnd }
// يجمع قراءات شبكة مجسات الرطوبة (soil_moisture_pct) + أحدث بيانات طقس/فضائية للموقع
// + معامل المحصول/التربة، ثم يُشغّل محرك الاستدلال (src/lib/irrigation.ts) وينشئ سجل
// IrrigationRecommendation قابلاً للتدقيق. إن وُجدت قراءات عداد مياه فعلية لنفس الفترة
// (water_meter_m3 / water_flow_m3h) تُحسب المقارنة بالفعلي وتوفير المياه فورًا أيضًا.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { projectId, periodStart, periodEnd } = body as {
      projectId?: string
      periodStart?: string
      periodEnd?: string
    }

    if (!projectId || !periodStart || !periodEnd) {
      return NextResponse.json(
        { error: 'projectId و periodStart و periodEnd مطلوبة' },
        { status: 400 },
      )
    }

    const auth = await requireProjectAccess(projectId, 'calculation:run')
    if (!auth.authorized) return auth.response
    const { user } = auth

    const project = await db.project.findUnique({ where: { id: projectId } })
    if (!project) return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })
    if (project.projectType !== 'smart_irrigation') {
      return NextResponse.json(
        { error: 'هذا المشروع ليس من نوع الري الذكي (smart_irrigation)' },
        { status: 400 },
      )
    }

    const start = new Date(periodStart)
    const end = new Date(periodEnd)
    const days = Math.max(1, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))

    // 1) قراءات شبكة مجسات الرطوبة لهذه الفترة
    const soilMoistureReadings = await db.energyReading.findMany({
      where: {
        projectId,
        metricType: 'soil_moisture_pct',
        measuredAt: { gte: start, lte: end },
        qualityStatus: { in: ['received', 'validated', 'approved', 'corrected'] },
      },
      select: { value: true },
    })

    // 2) أحدث بيانات طقس/فضائية للموقع (نفس الموقع lat/lon المسجّل عند إنشاء المشروع)
    const [weatherObs, spaceObs] = await Promise.all([
      db.weatherObservation.findFirst({
        where: { projectId, observedAt: { lte: end } },
        orderBy: { observedAt: 'desc' },
      }),
      db.spaceDataObservation.findFirst({
        where: { projectId, observedAt: { lte: end } },
        orderBy: { observedAt: 'desc' },
      }),
    ])

    const weather = {
      temperatureC: weatherObs?.temperatureC ?? spaceObs?.temperatureC ?? null,
      humidityPct: weatherObs?.humidityPct ?? spaceObs?.humidityPct ?? null,
      windSpeedMs: weatherObs?.windSpeedMs ?? spaceObs?.windSpeedMs ?? null,
      ghiWm2: spaceObs?.ghiWm2 ?? weatherObs?.irradianceWm2 ?? null,
    }
    const weatherSource = spaceObs ? spaceObs.sourceKey : weatherObs ? weatherObs.dataSource : 'fallback_defaults'

    // 3) تشغيل محرك الاستدلال (ETo + Kc(NDVI) + شبكة مجسات الرطوبة العصبية)
    // NDVI (البيانات الفضائية / Sentinel Hub-CDSE) يُستخدم لاشتقاق Kc الفعلي من حالة
    // الغطاء النباتي الحقيقية بدل الجدول الثابت - انظر deriveCropCoefficient في irrigation.ts.
    // فحص الحداثة (NDVI_MAX_AGE_DAYS) يتم داخل المحرك نفسه ويرجع تلقائيًا للجدول الثابت
    // إن كانت الرصدة قديمة جدًا أو غائبة.
    const rec = computeIrrigationRecommendation({
      soilMoistureReadingsPct: soilMoistureReadings.map((r) => r.value),
      weather,
      cropType: project.cropType || 'other',
      soilType: project.soilType || 'loamy',
      irrigatedAreaM2: project.irrigatedAreaM2 || 0,
      irrigationMethod: project.irrigationMethod,
      ndvi: spaceObs?.ndvi ?? null,
      ndviObservedAt: spaceObs?.observedAt ?? null,
    })

    // 4) قراءات عداد المياه الذكي الفعلية لنفس الفترة (إن وُجدت) - للمقارنة الفورية
    const waterReadings = await db.energyReading.findMany({
      where: {
        projectId,
        metricType: { in: ['water_meter_m3', 'water_flow_m3h'] },
        measuredAt: { gte: start, lte: end },
        qualityStatus: { in: ['validated', 'approved', 'corrected'] },
      },
      select: { value: true },
    })
    const actualIrrigationM3 = waterReadings.length > 0 ? waterReadings.reduce((s, r) => s + r.value, 0) : null

    const deviationPct = actualIrrigationM3 != null && rec.recommendedIrrigationM3 > 0
      ? Math.round(((actualIrrigationM3 - rec.recommendedIrrigationM3) / rec.recommendedIrrigationM3) * 10000) / 100
      : null

    const crypto = await import('crypto')
    const inputsHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ projectId, periodStart, periodEnd, weather, weatherSource, rec }))
      .digest('hex')

    const created = await db.irrigationRecommendation.create({
      data: {
        projectId,
        periodStart: start,
        periodEnd: end,
        soilMoistureAvgPct: rec.soilMoistureAvgPct,
        soilMoistureMinPct: rec.soilMoistureMinPct,
        soilMoistureMaxPct: rec.soilMoistureMaxPct,
        sensorReadingCount: rec.sensorReadingCount,
        sensorAgreement: rec.sensorAgreement,
        etoMm: rec.etoMm,
        cropCoefficientKc: rec.cropCoefficientKc,
        kcSource: rec.kcSource,
        ndviUsed: rec.ndviUsed,
        ndviObservedAt: rec.ndviUsed != null ? (spaceObs?.observedAt ?? null) : null,
        weatherSource,
        recommendedIrrigationM3: rec.recommendedIrrigationM3,
        confidenceScore: rec.confidenceScore,
        actualIrrigationM3,
        deviationPct,
        status: actualIrrigationM3 != null ? 'compared' : 'generated',
        inputsHash,
        createdBy: user.userId,
      },
    })

    // 5) المقارنة الأرضية-الفضائية (Ground vs Space) وبوابة الأهلية لاستدامة المياه:
    // نظير GroundSpaceComparison للطاقة الشمسية، لكن مُطبَّق هنا على مستوى الفترة.
    // يصنّف الانحراف (efficient / over_irrigation / under_irrigation)، ويُصدر تنبيهًا
    // (Case + Notification) تلقائيًا عند الإفراط أو العجز المائي - فقط عند توفر قراءة فعلية.
    let waterAssessment: Awaited<ReturnType<typeof assessWaterRecommendation>> | null = null
    if (actualIrrigationM3 != null) {
      waterAssessment = await assessWaterRecommendation(created.id)
    }

    // 6) توفير المياه والأثر البيئي المشتق (فقط عند توفر قراءة فعلية)
    let waterSavings: WaterSavingsResult | null = null
    if (actualIrrigationM3 != null) {
      const baselineM3 = estimateBaselineWaterUseM3({
        irrigatedAreaM2: project.irrigatedAreaM2 || 0,
        days,
        dailyWaterBudgetM3: project.dailyWaterBudgetM3,
        baselineWaterUseLM2Day: project.baselineWaterUseLM2Day,
      })
      const countryCode = (project.country || 'SA').substring(0, 2).toUpperCase()
      const ef = await getEmissionFactor(countryCode, start)
      waterSavings = calculateWaterSavings({
        actualM3: actualIrrigationM3,
        baselineM3,
        waterTariffPerM3: project.waterTariffPerM3,
        pumpEnergyKwhPerM3: project.pumpEnergyKwhPerM3,
        emissionFactorKgPerKwh: ef.factor,
      })
    }

    return NextResponse.json({
      success: true,
      recommendation: waterAssessment
        ? { ...created, assessment: waterAssessment.assessment, severity: waterAssessment.severity, caseId: waterAssessment.caseId, notificationId: waterAssessment.notificationId }
        : created,
      details: { ...rec, weatherSource, waterSavings, waterAssessment },
    })
  } catch (error) {
    console.error('Irrigation recommendation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

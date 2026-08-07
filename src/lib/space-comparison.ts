// ============================================================================
// طبقة مقارنة البيانات الأرضية بالبيانات الفضائية (Ground vs Space Data QA)
// ============================================================================
// الوصف:
//   تفحص هذه الطبقة جودة البيانات الأرضية (قراءات الطاقة القادمة من الأجهزة/الإنفرترات)
//   من خلال مقارنتها ببيانات الإشعاع الشمسي الفضائية (SpaceDataObservation / أو
//   WeatherObservation كمصدر احتياطي فعلي — انظر ملاحظة المصادر أدناه)، وتقدير كفاءة كل
//   قراءة، وإصدار التنبيهات المناسبة.
//
// شرط التطبيق (حرفيًا كما وُصف):
//   تُطبَّق هذه الحسابات فقط على القراءات التي تجاوزت مرحلة التحقق بنجاح
//   (EnergyReading.validationStatus === 'valid'). أي قراءة أخرى (pending/invalid/reviewed)
//   تُتجاهَل تمامًا من هذه الطبقة.
//
// ملاحظة عن مصادر الإشعاع الفعلي:
//   حاليًا (انظر src/lib/space-data/sync.ts) مصدرا NASA POWER وCAMS معطَّلان مؤقتًا في
//   دورة السحب اليومية، والمصدر الوحيد النشط فعليًا هو CDSE — الذي لا يوفر GHI إطلاقًا
//   (هو مخصص لمؤشرات NDVI/EVI/LST/NO2). لذلك هذه الطبقة تُفضّل GHI من SpaceDataObservation
//   إن وُجد (لدعم إعادة تفعيل NASA POWER/CAMS لاحقًا دون أي تعديل هنا)، وإلا تسقط تلقائيًا
//   إلى WeatherObservation (Open-Meteo Solar، وهو مصدر فضائي/استشعار عن بعد فعليًا وليس
//   محطة أرضية) كمصدر بديل حي. كلا المصدرين يُعاد توحيدهما لنفس وحدة PSH (kWh/m²/day)
//   قبل أي حساب.

import { db } from './db'

// ============== أنواع البيانات ==============

export type ComparisonAssessment =
  | 'normal'              // القراءة ضمن النطاق المتوقع
  | 'overstated'          // ⚠️ قراءة مبالغ فيها
  | 'understated'         // ⚠️ قراءة منخفضة (يلزم تنظيف الألواح)
  | 'dust_accumulation'   // ⚠️ تراكم الغبار (نقص متكرر ومتصاعد بدون سبب جوي واضح)
  | 'efficiency_loss'     // ⚠️ نقص كفاءة عام (تحديد الخسائر ومصادرها)

export const ALERT_LABELS_AR: Record<Exclude<ComparisonAssessment, 'normal'>, string> = {
  overstated: 'قراءة مبالغ فيها',
  understated: 'قراءة منخفضة',
  dust_accumulation: 'تراكم الغبار',
  efficiency_loss: 'نقص الكفاءة',
}

export const ALERT_CASE_TYPE: Record<Exclude<ComparisonAssessment, 'normal'>, string> = {
  overstated: 'overstated_reading',
  understated: 'low_reading',
  dust_accumulation: 'dust_accumulation',
  efficiency_loss: 'efficiency_loss',
}

export const ALERT_CODE: Record<Exclude<ComparisonAssessment, 'normal'>, string> = {
  overstated: 'OVERSTATED_READING',
  understated: 'LOW_READING',
  dust_accumulation: 'DUST_ACCUMULATION',
  efficiency_loss: 'EFFICIENCY_LOSS',
}

export interface ComparisonResult {
  status: 'skipped' | 'no_space_data' | 'no_project_data' | 'computed'
  reason?: string
  comparisonId?: string
  assessment?: ComparisonAssessment
  efficiencyRatio?: number
  deviationPct?: number
}

// ============== إعدادات وعتبات الحساب (Thresholds) ==============
// موثّقة صراحة لسهولة المراجعة والتعديل لاحقًا.
const THRESHOLDS = {
  // انحراف ±15% يُعتبر ضمن هامش الخطأ الطبيعي لأي نموذج تقدير (زوايا، انعكاسات، فروق تجميع زمني)
  NORMAL_BAND_PCT: 15,
  // فوق هذا الحد => قراءة مبالغ فيها
  OVERSTATED_PCT: 15,
  // تحت هذا الحد => قراءة منخفضة (نقص أداء محتمل)
  UNDERSTATED_PCT: -15,
  // نقص حاد (تحت -40%) يُصنَّف كنقص كفاءة عام حتى لو لم يتكرر بعد
  SEVERE_LOSS_PCT: -40,
  // عدد القراءات المتتالية المنخفضة (ضمن نفس المشروع) اللازم لترجيح تراكم الغبار
  // بدلاً من تعليل عابر (سحابة، ظل مؤقت، عطل لحظي)
  DUST_MIN_CONSECUTIVE_READINGS: 3,
  // نافذة البحث عن أقرب رصدة فضائية لنفس اليوم (بالساعات)
  MAX_OBSERVATION_GAP_HOURS: 30,
} as const

const KWH_PER_MJ = 0.277778 // 1 MJ/m² = 0.277778 kWh/m²

// ============== دوال مساعدة ==============

function severityFromDeviation(deviationPct: number): 'low' | 'medium' | 'high' | 'critical' {
  const abs = Math.abs(deviationPct)
  if (abs >= 60) return 'critical'
  if (abs >= 40) return 'high'
  if (abs >= 25) return 'medium'
  return 'low'
}

// يوحّد GHI من أي مصدر (SpaceDataObservation بوحدة W/m² متوسط يومي، أو WeatherObservation
// بوحدة MJ/m²/day) إلى نفس وحدة PSH (kWh/m²/day = "ساعات ذروة شمسية معادلة").
function toDailyPshKwhM2(input: { ghiWm2Avg?: number | null; ghiMjPerDay?: number | null }): number | null {
  if (input.ghiWm2Avg !== undefined && input.ghiWm2Avg !== null) {
    // W/m² متوسط على مدار 24 ساعة => kWh/m²/day
    return (input.ghiWm2Avg * 24) / 1000
  }
  if (input.ghiMjPerDay !== undefined && input.ghiMjPerDay !== null) {
    return input.ghiMjPerDay * KWH_PER_MJ
  }
  return null
}

function dayRange(date: Date) {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

// ============== المُحرّك الرئيسي ==============

/**
 * يُشغَّل لقراءة أرضية واحدة (EnergyReading) بعد أن تجاوزت التحقق بنجاح.
 * يقارنها بالبيانات الفضائية المتاحة لنفس المشروع/اليوم، ويحسب الكفاءة، ويصدر
 * تنبيهًا (Case + Notification) عند الحاجة. آمن للاستدعاء المتكرر لنفس القراءة
 * (idempotent) بفضل قيد @@unique على GroundSpaceComparison.readingId.
 */
export async function runGroundSpaceComparison(readingId: string): Promise<ComparisonResult> {
  const reading = await db.energyReading.findUnique({
    where: { id: readingId },
    include: {
      project: {
        select: {
          id: true, name: true, nameAr: true, code: true,
          capacityKwp: true, latitude: true, longitude: true, projectType: true,
        },
      },
      asset: { include: { solarProfile: true } },
    },
  })

  if (!reading) {
    return { status: 'skipped', reason: 'القراءة غير موجودة' }
  }

  // شرط التطبيق الصريح: فقط القراءات التي تجاوزت التحقق بنجاح
  if (reading.validationStatus !== 'valid') {
    return { status: 'skipped', reason: 'القراءة لم تتجاوز مرحلة التحقق بعد (validationStatus != valid)' }
  }

  // هذه الطبقة مصممة لقراءات الطاقة المُصدَّرة فقط (الإنتاج الفعلي القابل للمقارنة بالإشعاع)
  if (reading.metricType !== 'energy_export_kwh') {
    return { status: 'skipped', reason: `metricType (${reading.metricType}) غير مدعوم لهذه المقارنة` }
  }

  // تجنّب إعادة الحساب لنفس القراءة إن كانت موجودة مسبقًا (idempotency)
  const existing = await db.groundSpaceComparison.findUnique({ where: { readingId } })
  if (existing) {
    return {
      status: 'computed',
      comparisonId: existing.id,
      assessment: existing.assessment as ComparisonAssessment,
      efficiencyRatio: existing.efficiencyRatio,
      deviationPct: existing.deviationPct,
    }
  }

  const project = reading.project
  if (!project.latitude || !project.longitude) {
    return { status: 'no_project_data', reason: 'المشروع بدون إحداثيات (latitude/longitude)' }
  }

  // ---- 1) بيانات المشروع: قدرة الألواح، اتجاهها، عددها ----
  // نجمع بيانات كل أصول المشروع الشمسية (solar_array) إن لم تكن القراءة مرتبطة بأصل محدد،
  // لأن قدرة "المشروع" ككل قد تكون موزّعة على عدة مصفوفات ألواح (Assets) بزوايا مختلفة.
  let capacityKwp: number | null = null
  let tiltDegrees: number | null = null
  let azimuthDegrees: number | null = null
  let systemLosses = 0.14 // افتراضي موثّق (مطابق لـ energy-performance/route.ts)
  let inverterEfficiency = 0.97 // افتراضي موثّق

  if (reading.asset?.solarProfile) {
    const p = reading.asset.solarProfile
    capacityKwp = p.capacityKwp
    tiltDegrees = p.tiltDegrees ?? null
    azimuthDegrees = p.azimuthDegrees ?? null
    if (p.systemLosses !== null && p.systemLosses !== undefined) systemLosses = p.systemLosses
    if (p.inverterEfficiency !== null && p.inverterEfficiency !== undefined) inverterEfficiency = p.inverterEfficiency
  } else {
    // لا يوجد أصل محدد مرتبط بالقراءة: نجمع كل مصفوفات الألواح الشمسية للمشروع
    const solarAssets = await db.asset.findMany({
      where: { projectId: project.id, assetType: 'solar_array' },
      include: { solarProfile: true },
    })
    const profiles = solarAssets.map((a) => a.solarProfile).filter((p): p is NonNullable<typeof p> => !!p)
    if (profiles.length > 0) {
      capacityKwp = profiles.reduce((s, p) => s + (p.capacityKwp || 0), 0)
      // متوسط مرجّح بالقدرة للزوايا (اتجاه/ميل)، لأن كل لوح قد يكون بزاوية مختلفة
      const totalCap = capacityKwp || 1
      tiltDegrees = profiles.reduce((s, p) => s + (p.tiltDegrees || 0) * (p.capacityKwp || 0), 0) / totalCap
      azimuthDegrees = profiles.reduce((s, p) => s + (p.azimuthDegrees || 0) * (p.capacityKwp || 0), 0) / totalCap
      const withLosses = profiles.filter((p) => p.systemLosses !== null && p.systemLosses !== undefined)
      if (withLosses.length > 0) {
        systemLosses = withLosses.reduce((s, p) => s + (p.systemLosses as number), 0) / withLosses.length
      }
      const withInv = profiles.filter((p) => p.inverterEfficiency !== null && p.inverterEfficiency !== undefined)
      if (withInv.length > 0) {
        inverterEfficiency = withInv.reduce((s, p) => s + (p.inverterEfficiency as number), 0) / withInv.length
      }
    }
  }

  // Fallback نهائي إلى Project.capacityKwp إن لم تُسجَّل أي مصفوفة ألواح تفصيلية بعد
  if (!capacityKwp || capacityKwp <= 0) {
    capacityKwp = project.capacityKwp || null
  }

  if (!capacityKwp || capacityKwp <= 0) {
    return { status: 'no_project_data', reason: 'لا توجد بيانات قدرة كافية للمشروع (capacityKwp)' }
  }

  // ---- 2) بيانات الإشعاع الشمسي الفعلية (الفضائية) لنفس يوم القراءة ----
  const { start, end } = dayRange(reading.measuredAt)
  const maxGapMs = THRESHOLDS.MAX_OBSERVATION_GAP_HOURS * 60 * 60 * 1000

  // نفضّل SpaceDataObservation (GHI حقيقي) إن توفّر — يدعم إعادة تفعيل NASA POWER/CAMS لاحقًا
  const spaceObservations = await db.spaceDataObservation.findMany({
    where: {
      projectId: project.id,
      observedAt: { gte: new Date(start.getTime() - maxGapMs), lte: new Date(end.getTime() + maxGapMs) },
      ghiWm2: { not: null },
    },
    orderBy: { observedAt: 'desc' },
    take: 5,
  })

  const nearestSpace = spaceObservations
    .map((o) => ({ o, gap: Math.abs(o.observedAt.getTime() - reading.measuredAt.getTime()) }))
    .sort((a, b) => a.gap - b.gap)[0]

  let pshKwhM2: number | null = null
  let spaceSourceKey: string | null = null
  let spaceObservedAt: Date | null = null
  let spaceGhiWm2: number | null = null
  let spaceObservationId: string | null = null
  let aod: number | null = null

  if (nearestSpace && nearestSpace.gap <= maxGapMs) {
    pshKwhM2 = toDailyPshKwhM2({ ghiWm2Avg: nearestSpace.o.ghiWm2 })
    spaceSourceKey = nearestSpace.o.sourceKey
    spaceObservedAt = nearestSpace.o.observedAt
    spaceGhiWm2 = nearestSpace.o.ghiWm2
    spaceObservationId = nearestSpace.o.id
    aod = nearestSpace.o.aod
  } else {
    // Fallback فعلي: WeatherObservation (Open-Meteo Solar) — مصدر استشعار عن بعد نشط حاليًا
    const weatherObs = await db.weatherObservation.findMany({
      where: {
        projectId: project.id,
        observedAt: { gte: new Date(start.getTime() - maxGapMs), lte: new Date(end.getTime() + maxGapMs) },
        irradianceWm2: { not: null },
      },
      orderBy: { observedAt: 'desc' },
      take: 5,
    })

    const nearestWeather = weatherObs
      .map((o) => ({ o, gap: Math.abs(o.observedAt.getTime() - reading.measuredAt.getTime()) }))
      .sort((a, b) => a.gap - b.gap)[0]

    if (!nearestWeather || nearestWeather.gap > maxGapMs) {
      return { status: 'no_space_data', reason: 'لا توجد رصدة فضائية/إشعاع قريبة كفاية من تاريخ القراءة' }
    }

    pshKwhM2 = toDailyPshKwhM2({ ghiMjPerDay: nearestWeather.o.irradianceWm2 })
    spaceSourceKey = nearestWeather.o.dataSource // 'Open-Meteo' — يُخزَّن كمصدر بديل موثّق
    spaceObservedAt = nearestWeather.o.observedAt
    spaceGhiWm2 = null // القيمة الأصلية بوحدة مختلفة (MJ/m²/day)؛ pshKwhM2 هو الموحَّد
  }

  if (pshKwhM2 === null || pshKwhM2 <= 0) {
    return { status: 'no_space_data', reason: 'قيمة الإشعاع الفضائي غير صالحة (صفر أو مفقودة)' }
  }

  // ---- 3) الحساب المنطقي: الطاقة المتوقعة بناءً على الإشعاع الفعلي وبيانات المشروع ----
  // نموذج مبسّط لكنه موثّق: نفس صيغة energy-performance/route.ts، بفارق أن psh هنا يأتي
  // من مصدر فضائي فعلي (وليس متوسط فترة)، ومُطبَّق على قراءة واحدة (عادة يومية أو فترة تجميع).
  //
  // تصحيح الاتجاه/الميل: عند توفر tilt/azimuth، نطبّق عامل تصحيح تقريبي بسيط:
  // الاتجاه الأمثل في نصف الكرة الشمالي هو أزيموث 180° (جنوب) بميل قريب من خط العرض.
  // أي انحراف كبير عن ذلك يقلل الإشعاع الفعلي الساقط على اللوح مقارنة بـ GHI الأفقي.
  let orientationFactor = 1.0
  if (azimuthDegrees !== null && azimuthDegrees !== undefined) {
    const azimuthDeviation = Math.min(Math.abs(azimuthDegrees - 180), 360 - Math.abs(azimuthDegrees - 180))
    // كل 45° انحراف عن الجنوب يُخفّض العامل بنحو 5% (تقدير متحفظ وموثّق، وليس نموذجًا فلكيًا دقيقًا)
    orientationFactor -= Math.min(0.25, (azimuthDeviation / 45) * 0.05)
  }
  if (tiltDegrees !== null && tiltDegrees !== undefined && project.latitude !== null) {
    const idealTilt = Math.abs(project.latitude)
    const tiltDeviation = Math.abs(tiltDegrees - idealTilt)
    orientationFactor -= Math.min(0.15, (tiltDeviation / 30) * 0.05)
  }
  orientationFactor = Math.max(0.5, orientationFactor)

  const expectedEnergyKwh =
    capacityKwp * pshKwhM2 * (1 - systemLosses) * inverterEfficiency * orientationFactor

  if (expectedEnergyKwh <= 0) {
    return { status: 'no_project_data', reason: 'تعذّر حساب طاقة متوقعة موجبة' }
  }

  const efficiencyRatio = reading.value / expectedEnergyKwh
  const deviationPct = ((reading.value - expectedEnergyKwh) / expectedEnergyKwh) * 100

  // ---- 4) تصنيف القراءة وإصدار التنبيه المناسب ----
  let assessment: ComparisonAssessment = 'normal'

  if (deviationPct > THRESHOLDS.OVERSTATED_PCT) {
    assessment = 'overstated'
  } else if (deviationPct <= THRESHOLDS.SEVERE_LOSS_PCT) {
    assessment = 'efficiency_loss'
  } else if (deviationPct < THRESHOLDS.UNDERSTATED_PCT) {
    // نقص أداء: نتحقق إن كان نمطًا متكررًا (تراكم غبار محتمل) أو حادثة منفردة (قراءة منخفضة)
    const recentUnderstated = await db.groundSpaceComparison.findMany({
      where: {
        projectId: project.id,
        assessment: { in: ['understated', 'dust_accumulation'] },
        measuredAt: { gte: new Date(reading.measuredAt.getTime() - 7 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { measuredAt: 'desc' },
      take: THRESHOLDS.DUST_MIN_CONSECUTIVE_READINGS,
    })

    const highAod = aod !== null && aod !== undefined && aod > 0.3 // AOD > 0.3 يُعتبر مؤشر غبار/هباء مرتفع

    if (highAod || recentUnderstated.length >= THRESHOLDS.DUST_MIN_CONSECUTIVE_READINGS - 1) {
      assessment = 'dust_accumulation'
    } else {
      assessment = 'understated'
    }
  }

  const severity = assessment === 'normal' ? null : severityFromDeviation(deviationPct)
  const alertCode = assessment === 'normal' ? null : ALERT_CODE[assessment]

  // ---- 5) حفظ نتيجة المقارنة (قابلة للتدقيق الكامل) ----
  const notes = JSON.stringify({
    orientationFactor: Math.round(orientationFactor * 1000) / 1000,
    pshKwhM2: Math.round(pshKwhM2 * 1000) / 1000,
    aod,
    projectLatitude: project.latitude,
  })

  const comparison = await db.groundSpaceComparison.create({
    data: {
      projectId: project.id,
      readingId: reading.id,
      groundValueKwh: reading.value,
      measuredAt: reading.measuredAt,
      spaceObservationId,
      spaceGhiWm2,
      spaceSourceKey,
      spaceObservedAt,
      capacityKwpUsed: capacityKwp,
      tiltDegreesUsed: tiltDegrees,
      azimuthDegreesUsed: azimuthDegrees,
      systemLossesUsed: systemLosses,
      inverterEfficiencyUsed: inverterEfficiency,
      expectedEnergyKwh,
      efficiencyRatio,
      deviationPct,
      assessment,
      severity: severity || undefined,
      alertCode: alertCode || undefined,
      notes,
    },
  })

  // ---- 6) إصدار حالة (Case) وإشعار (Notification) عند الحاجة فقط ----
  if (assessment !== 'normal') {
    const label = ALERT_LABELS_AR[assessment]
    const projectLabel = project.nameAr || project.name

    const description =
      `${label}: القراءة الأرضية = ${reading.value.toFixed(2)} kWh، ` +
      `الطاقة المتوقعة بناءً على الإشعاع الفعلي = ${expectedEnergyKwh.toFixed(2)} kWh ` +
      `(الانحراف = ${deviationPct.toFixed(1)}%، الكفاءة = ${(efficiencyRatio * 100).toFixed(1)}%)`

    const createdCase = await db.case.create({
      data: {
        projectId: project.id,
        title: `${label} — ${projectLabel}`,
        caseType: ALERT_CASE_TYPE[assessment],
        priority: severity === 'critical' ? 'critical' : severity === 'high' ? 'high' : severity === 'medium' ? 'medium' : 'low',
        status: 'open',
        description,
        slaDeadline: new Date(Date.now() + (severity === 'critical' ? 4 : 24) * 60 * 60 * 1000),
      },
    })

    const notification = await db.notification.create({
      data: {
        projectId: project.id,
        title: `⚠️ ${label}`,
        body: description,
        category: 'alert',
        severity: severity === 'critical' || severity === 'high' ? 'error' : 'warning',
      },
    })

    await db.groundSpaceComparison.update({
      where: { id: comparison.id },
      data: { caseId: createdCase.id, notificationId: notification.id },
    })
  }

  return {
    status: 'computed',
    comparisonId: comparison.id,
    assessment,
    efficiencyRatio,
    deviationPct,
  }
}

// ============== بوابة الأهلية لإصدار إثبات كربون (Attestation Eligibility Gate) ==============
//
// الغرض: قبل السماح لأي فترة/مشروع بالانتقال من "كربون مُقدَّر" إلى "كربون مُتحقَّق
// وموثَّق على Hedera" (انظر src/lib/impact-attestation.ts)، يجب التأكد أن القراءات
// الأرضية التي استند إليها الحساب متوافقة فعلاً مع الإشعاع الفضائي لنفس الفترة — أي أن
// التغيّر البيئي/الإنتاج المُعلَن يعكس واقعًا يمكن التحقق منه بمصدر مستقل (الأقمار
// الصناعية)، وليس مجرد رقم من عداد قد يكون معطوبًا أو مُتلاعَبًا به.
//
// القاعدة (موثّقة صراحة لسهولة المراجعة والتعديل لاحقًا من فريق المنهجية):
//   - تُجمَع كل نتائج GroundSpaceComparison للقراءات الواقعة ضمن الفترة المطلوبة.
//   - إن لم توجد أي مقارنة فضائية-أرضية بعد لهذه الفترة => 'needs_review' (لا يوجد أساس
//     كافٍ لا للقبول ولا للرفض؛ يتطلب تدخلاً بشريًا أو انتظار اكتمال المزامنة الفضائية).
//   - إن كانت نسبة القراءات المصنّفة 'normal' >= MIN_NORMAL_PCT_FOR_ELIGIBILITY => 'eligible'.
//   - وإلا => 'ineligible' (نسبة معتبرة من القراءات مشبوهة: مبالغ فيها، منخفضة، تراكم
//     غبار غير معالَج، أو نقص كفاءة عام) — لا يجوز توثيق كربون لفترة كهذه دون تصحيح
//     القراءات المشبوهة أو استثنائها أولاً.
const ELIGIBILITY_THRESHOLDS = {
  // نسبة القراءات "normal" اللازمة لاعتبار الفترة مؤهلة تلقائيًا دون مراجعة بشرية
  MIN_NORMAL_PCT_FOR_ELIGIBILITY: 90,
  // إن كانت التغطية (عدد القراءات المقارَنة فضائيًا ÷ عدد القراءات الصالحة الكلي للفترة)
  // أقل من هذا الحد، لا يُعتد بالنتيجة كافية ويُصنَّف needs_review بغض النظر عن النسبة
  MIN_COVERAGE_PCT_FOR_DECISION: 50,
} as const

export type EligibilityStatus = 'eligible' | 'ineligible' | 'needs_review'

export interface PeriodEligibilityResult {
  status: EligibilityStatus
  normalPct: number | null
  coveragePct: number | null
  comparedReadingCount: number
  validReadingCount: number
  distribution: Record<ComparisonAssessment, number>
  reason: string
}

/**
 * يفحص أهلية فترة زمنية لمشروع معيّن لإصدار "ملف إثبات كربون" عنها، بناءً على مدى
 * توافق قراءاتها الأرضية مع البيانات الفضائية (GroundSpaceComparison). هذه الدالة هي
 * البوابة التي يجب أن يجتازها أي طلب توثيق قبل الوصول إلى impact-attestation.ts.
 */
export async function checkPeriodEligibility(
  projectId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<PeriodEligibilityResult> {
  const [comparisons, validReadingCount] = await Promise.all([
    db.groundSpaceComparison.findMany({
      where: { projectId, measuredAt: { gte: periodStart, lt: periodEnd } },
      select: { assessment: true },
    }),
    db.energyReading.count({
      where: {
        projectId,
        metricType: 'energy_export_kwh',
        validationStatus: 'valid',
        measuredAt: { gte: periodStart, lt: periodEnd },
      },
    }),
  ])

  const distribution: Record<ComparisonAssessment, number> = {
    normal: 0, overstated: 0, understated: 0, dust_accumulation: 0, efficiency_loss: 0,
  }
  for (const c of comparisons) {
    distribution[c.assessment as ComparisonAssessment] = (distribution[c.assessment as ComparisonAssessment] || 0) + 1
  }

  const comparedReadingCount = comparisons.length

  if (comparedReadingCount === 0) {
    return {
      status: 'needs_review',
      normalPct: null,
      coveragePct: validReadingCount > 0 ? 0 : null,
      comparedReadingCount,
      validReadingCount,
      distribution,
      reason: 'لا توجد أي مقارنة أرضية-فضائية لهذه الفترة بعد؛ لا يمكن تأكيد أن الإنتاج المُعلَن يطابق الإشعاع الفعلي',
    }
  }

  const coveragePct = validReadingCount > 0 ? (comparedReadingCount / validReadingCount) * 100 : 0
  const normalPct = (distribution.normal / comparedReadingCount) * 100

  if (coveragePct < ELIGIBILITY_THRESHOLDS.MIN_COVERAGE_PCT_FOR_DECISION) {
    return {
      status: 'needs_review',
      normalPct: Math.round(normalPct * 10) / 10,
      coveragePct: Math.round(coveragePct * 10) / 10,
      comparedReadingCount,
      validReadingCount,
      distribution,
      reason: `تغطية المقارنة الفضائية منخفضة (${Math.round(coveragePct)}% فقط من القراءات الصالحة قُورنت بالإشعاع الفضائي)؛ العينة غير كافية لقرار آلي`,
    }
  }

  if (normalPct >= ELIGIBILITY_THRESHOLDS.MIN_NORMAL_PCT_FOR_ELIGIBILITY) {
    return {
      status: 'eligible',
      normalPct: Math.round(normalPct * 10) / 10,
      coveragePct: Math.round(coveragePct * 10) / 10,
      comparedReadingCount,
      validReadingCount,
      distribution,
      reason: `${Math.round(normalPct)}% من القراءات المقارَنة ضمن النطاق الطبيعي المتوقع من الإشعاع الفضائي`,
    }
  }

  return {
    status: 'ineligible',
    normalPct: Math.round(normalPct * 10) / 10,
    coveragePct: Math.round(coveragePct * 10) / 10,
    comparedReadingCount,
    validReadingCount,
    distribution,
    reason: `فقط ${Math.round(normalPct)}% من القراءات ضمن النطاق الطبيعي (الحد الأدنى ${ELIGIBILITY_THRESHOLDS.MIN_NORMAL_PCT_FOR_ELIGIBILITY}%)؛ توجد قراءات مشبوهة (مبالغ فيها/منخفضة/تراكم غبار/نقص كفاءة) يجب تصحيحها أو استثناؤها قبل التوثيق`,
  }
}

/**
 * يُشغِّل المقارنة لدفعة من القراءات (مثلاً كل القراءات الصالحة التي لم تُقارَن بعد
 * لمشروع معيّن، أو للنظام كله). يُستخدم من مسار API اليدوي ومن مهمة مجدولة لاحقًا.
 */
export async function runGroundSpaceComparisonBatch(options?: {
  projectId?: string
  limit?: number
}): Promise<{ processed: number; results: ComparisonResult[] }> {
  const limit = Math.min(500, Math.max(1, options?.limit ?? 100))

  // القراءات الصالحة التي لم تُقارَن بعد بعد (لا يوجد لها سجل GroundSpaceComparison)
  const candidateReadings = await db.energyReading.findMany({
    where: {
      validationStatus: 'valid',
      metricType: 'energy_export_kwh',
      ...(options?.projectId ? { projectId: options.projectId } : {}),
    },
    select: { id: true },
    orderBy: { measuredAt: 'desc' },
    take: limit * 3, // هامش إضافي لأن بعضها قد يكون لديه مقارنة مسبقة بالفعل
  })

  const results: ComparisonResult[] = []
  let processed = 0

  for (const r of candidateReadings) {
    if (processed >= limit) break

    const already = await db.groundSpaceComparison.findUnique({ where: { readingId: r.id } })
    if (already) continue

    const result = await runGroundSpaceComparison(r.id)
    results.push(result)
    processed++
  }

  return { processed, results }
}

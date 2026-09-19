// ============================================================================
// طبقة مقارنة البيانات الأرضية بالبيانات الفضائية - مشاريع الري الذكي (Water dMRV)
// ============================================================================
// الوصف:
//   نظير src/lib/space-comparison.ts (المخصص للطاقة الشمسية) لكن مُصمَّم خصيصًا
//   لمشاريع الري الذكي. الفرق الجوهري في وحدة المقارنة: الطاقة الشمسية تُقارن
//   *قراءة واحدة* (EnergyReading) بالإشعاع الفضائي للحظة/اليوم نفسه، بينما المياه
//   تُقارن *فترة ري كاملة* (IrrigationRecommendation) لأن الاحتياج الحيوي الفعلي
//   (V_target) يُحسب تراكميًا على مدى دورة الري لا لحظة واحدة.
//
//   V_actual (الفعلي، من عداد المياه الذكي المُوثَّق hash+Hedera عبر
//             /api/integrations/water-meter — انظر IrrigationRecommendation.actualIrrigationM3)
//        مقابل
//   V_target (المستهدف، من ETo × Kc(NDVI) × عامل التربة ÷ كفاءة الري —
//             انظر IrrigationRecommendation.recommendedIrrigationM3 و src/lib/irrigation.ts)
//
// شرط التطبيق:
//   تُطبَّق هذه الحسابات فقط على توصيات وصلت فعلاً لحالة 'compared' (أي توفرت لها
//   قراءة عداد مياه فعلية موثّقة لنفس الفترة) — أي توصية بلا actualIrrigationM3 لا
//   يمكن الحكم عليها بعد ولا تُصنَّف.

import { db } from './db'

// ============== أنواع البيانات ==============

export type WaterComparisonAssessment =
  | 'efficient'        // الفعلي ضمن النطاق المتوقع من الاحتياج البيولوجي/الفيزيائي المستهدف
  | 'over_irrigation'   // ⚠️ إفراط في الري - هدر مياه وطاقة ضخ، وخطر تشبّع التربة
  | 'under_irrigation'  // ⚠️ عجز في الري - إجهاد مائي يهدد المحصول والإنتاجية

export const WATER_ALERT_LABELS_AR: Record<Exclude<WaterComparisonAssessment, 'efficient'>, string> = {
  over_irrigation: 'إفراط في الري (هدر مياه)',
  under_irrigation: 'عجز في الري (إجهاد مائي)',
}

export const WATER_ALERT_CASE_TYPE: Record<Exclude<WaterComparisonAssessment, 'efficient'>, string> = {
  over_irrigation: 'water_over_irrigation',
  under_irrigation: 'water_under_irrigation',
}

export const WATER_ALERT_CODE: Record<Exclude<WaterComparisonAssessment, 'efficient'>, string> = {
  over_irrigation: 'OVER_IRRIGATION',
  under_irrigation: 'UNDER_IRRIGATION',
}

export interface WaterAssessmentResult {
  status: 'skipped' | 'already_assessed' | 'not_compared' | 'assessed'
  reason?: string
  assessment?: WaterComparisonAssessment
  severity?: 'low' | 'medium' | 'high' | 'critical'
  caseId?: string | null
  notificationId?: string | null
}

// ============== إعدادات وعتبات الحساب (Thresholds) ==============
// موثّقة صراحة لسهولة المراجعة والتعديل لاحقًا من فريق المنهجية.
// نفس هامش ±15% المعتمد لمقارنة الطاقة الشمسية (space-comparison.ts) للاتساق
// المنهجي بين وحدتي dMRV في المنصة، ما لم تُثبت بيانات ميدانية لاحقًا حاجة لهامش مختلف.
const THRESHOLDS = {
  NORMAL_BAND_PCT: 15,      // ضمن ±15% => كفاءة جيدة (efficient)
  SEVERE_OVER_PCT: 40,      // فوق +40% => إفراط شديد (severity: high فأعلى)
  SEVERE_UNDER_PCT: -40,    // تحت -40% => عجز شديد (إجهاد مائي خطير على المحصول)
} as const

const ELIGIBILITY_THRESHOLDS = {
  // نسبة الفترات المصنّفة 'efficient' اللازمة لاعتبار المشروع مؤهلاً لإثبات استدامة مائية
  MIN_EFFICIENT_PCT_FOR_ELIGIBILITY: 90,
  // إن كانت نسبة التوصيات التي وصلت فعلاً لمرحلة 'compared' (مقابل كل التوصيات
  // المولَّدة للفترة) أقل من هذا الحد، العينة غير كافية لقرار آلي
  MIN_COVERAGE_PCT_FOR_DECISION: 50,
} as const

function severityFromDeviation(deviationPct: number): 'low' | 'medium' | 'high' | 'critical' {
  const abs = Math.abs(deviationPct)
  if (abs >= 80) return 'critical'
  if (abs >= 40) return 'high'
  if (abs >= 25) return 'medium'
  return 'low'
}

function classify(deviationPct: number): { assessment: WaterComparisonAssessment; severity: 'low' | 'medium' | 'high' | 'critical' | null } {
  if (deviationPct > THRESHOLDS.NORMAL_BAND_PCT) {
    return { assessment: 'over_irrigation', severity: severityFromDeviation(deviationPct) }
  }
  if (deviationPct < -THRESHOLDS.NORMAL_BAND_PCT) {
    return { assessment: 'under_irrigation', severity: severityFromDeviation(deviationPct) }
  }
  return { assessment: 'efficient', severity: null }
}

// ============== المُحرّك الرئيسي: تصنيف توصية واحدة وإصدار تنبيه عند الحاجة ==============

/**
 * يُشغَّل على IrrigationRecommendation واحدة بعد أن امتلكت قراءة فعلية (actualIrrigationM3)
 * وحُسب انحرافها (deviationPct). يصنّف الانحراف، ويُصدر Case + Notification عند الحاجة
 * (نفس نمط runGroundSpaceComparison تمامًا)، ويُحدّث السجل بالتصنيف ومعرّفات التنبيه.
 * آمن للاستدعاء المتكرر لنفس التوصية (idempotent) - لا يُعيد التصنيف إن كان موجودًا مسبقًا.
 */
export async function assessWaterRecommendation(recommendationId: string): Promise<WaterAssessmentResult> {
  const rec = await db.irrigationRecommendation.findUnique({
    where: { id: recommendationId },
    include: {
      project: { select: { id: true, name: true, nameAr: true, code: true, projectType: true } },
    },
  })

  if (!rec) return { status: 'skipped', reason: 'التوصية غير موجودة' }
  if (rec.project.projectType !== 'smart_irrigation') {
    return { status: 'skipped', reason: 'المشروع ليس من نوع الري الذكي' }
  }
  if (rec.actualIrrigationM3 == null || rec.deviationPct == null) {
    return { status: 'not_compared', reason: 'لا توجد قراءة فعلية من عداد المياه لهذه الفترة بعد - لا يمكن التصنيف' }
  }
  if (rec.assessment) {
    return {
      status: 'already_assessed',
      assessment: rec.assessment as WaterComparisonAssessment,
      severity: rec.severity as WaterAssessmentResult['severity'],
      caseId: rec.caseId,
      notificationId: rec.notificationId,
    }
  }

  const { assessment, severity } = classify(rec.deviationPct)
  const project = rec.project
  const projectLabel = `${project.nameAr || project.name} (${project.code})`

  let caseId: string | null = null
  let notificationId: string | null = null

  if (assessment !== 'efficient') {
    const label = WATER_ALERT_LABELS_AR[assessment]
    const alertCode = WATER_ALERT_CODE[assessment]
    const description =
      `${label}: الاستهلاك الفعلي (V_actual) = ${rec.actualIrrigationM3.toFixed(2)} م³، ` +
      `الاحتياج المستهدف (V_target) من ETo×Kc${rec.kcSource === 'ndvi_derived' ? '(NDVI)' : ''} = ${rec.recommendedIrrigationM3.toFixed(2)} م³ ` +
      `(الانحراف = ${rec.deviationPct.toFixed(1)}%)` +
      (rec.ndviUsed != null ? ` — NDVI المستخدم = ${rec.ndviUsed.toFixed(3)}` : '')

    const createdCase = await db.case.create({
      data: {
        projectId: project.id,
        title: `${label} — ${projectLabel}`,
        caseType: WATER_ALERT_CASE_TYPE[assessment],
        priority: severity === 'critical' ? 'critical' : severity === 'high' ? 'high' : severity === 'medium' ? 'medium' : 'low',
        status: 'open',
        description,
        // العجز المائي (under_irrigation) أكثر إلحاحًا من الإفراط: إجهاد المحصول قد
        // يكون تراكميًا ولا رجعة فيه إن تأخرت المعالجة
        slaDeadline: new Date(
          Date.now() + (severity === 'critical' ? 4 : assessment === 'under_irrigation' ? 12 : 24) * 60 * 60 * 1000,
        ),
      },
    })
    caseId = createdCase.id

    const notification = await db.notification.create({
      data: {
        projectId: project.id,
        title: `⚠️ ${label}`,
        body: description,
        category: 'alert',
        severity: severity === 'critical' || severity === 'high' ? 'error' : 'warning',
      },
    })
    notificationId = notification.id
  }

  await db.irrigationRecommendation.update({
    where: { id: recommendationId },
    data: {
      assessment,
      severity,
      alertCode: assessment !== 'efficient' ? WATER_ALERT_CODE[assessment] : null,
      caseId,
      notificationId,
    },
  })

  return { status: 'assessed', assessment, severity: severity ?? undefined, caseId, notificationId }
}

// ============== بوابة الأهلية لإثبات الاستدامة المائية (Water Sustainability Eligibility Gate) ==============
//
// نظير checkPeriodEligibility في space-comparison.ts. الغرض: قبل السماح لأي فترة/مشروع
// ري ذكي بإصدار "إثبات استدامة مائية" (يُستخدم لاحقًا لتوثيق وفر المياه/الكربون الناتج
// عنه على Hedera)، يجب التأكد أن معظم فترات الري خلالها كانت "كفوءة" (V_actual قريب من
// V_target المُشتق من الأقمار الصناعية والطقس)، لا مجرد رقم من عداد بلا سياق حيوي/فيزيائي.
export type WaterEligibilityStatus = 'eligible' | 'ineligible' | 'needs_review'

export interface WaterPeriodEligibilityResult {
  status: WaterEligibilityStatus
  efficientPct: number | null
  coveragePct: number | null
  comparedCount: number
  generatedCount: number
  distribution: Record<WaterComparisonAssessment, number>
  reason: string
}

/**
 * يفحص أهلية فترة زمنية لمشروع ري ذكي لإصدار إثبات استدامة مائية، بناءً على توزيع
 * تصنيفات IrrigationRecommendation (efficient/over_irrigation/under_irrigation) ضمنها.
 */
export async function checkWaterPeriodEligibility(
  projectId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<WaterPeriodEligibilityResult> {
  const recommendations = await db.irrigationRecommendation.findMany({
    where: { projectId, periodStart: { gte: periodStart }, periodEnd: { lte: periodEnd } },
    select: { assessment: true, status: true },
  })

  const generatedCount = recommendations.length
  const compared = recommendations.filter((r) => r.assessment != null)
  const comparedCount = compared.length

  const distribution: Record<WaterComparisonAssessment, number> = {
    efficient: 0, over_irrigation: 0, under_irrigation: 0,
  }
  for (const r of compared) {
    distribution[r.assessment as WaterComparisonAssessment] = (distribution[r.assessment as WaterComparisonAssessment] || 0) + 1
  }

  if (comparedCount === 0) {
    return {
      status: 'needs_review',
      efficientPct: null,
      coveragePct: generatedCount > 0 ? 0 : null,
      comparedCount,
      generatedCount,
      distribution,
      reason: 'لا توجد أي توصية ري قُورنت بقراءة فعلية من عداد المياه بعد لهذه الفترة؛ لا يمكن تأكيد أن الاستهلاك المُعلَن يطابق الاحتياج الفعلي',
    }
  }

  const coveragePct = generatedCount > 0 ? (comparedCount / generatedCount) * 100 : 0
  const efficientPct = (distribution.efficient / comparedCount) * 100

  if (coveragePct < ELIGIBILITY_THRESHOLDS.MIN_COVERAGE_PCT_FOR_DECISION) {
    return {
      status: 'needs_review',
      efficientPct: Math.round(efficientPct * 10) / 10,
      coveragePct: Math.round(coveragePct * 10) / 10,
      comparedCount,
      generatedCount,
      distribution,
      reason: `تغطية المقارنة بعداد المياه منخفضة (${Math.round(coveragePct)}% فقط من توصيات الري لهذه الفترة قُورنت بقراءة فعلية)؛ العينة غير كافية لقرار آلي`,
    }
  }

  if (efficientPct >= ELIGIBILITY_THRESHOLDS.MIN_EFFICIENT_PCT_FOR_ELIGIBILITY) {
    return {
      status: 'eligible',
      efficientPct: Math.round(efficientPct * 10) / 10,
      coveragePct: Math.round(coveragePct * 10) / 10,
      comparedCount,
      generatedCount,
      distribution,
      reason: `${Math.round(efficientPct)}% من فترات الري المقارَنة ضمن النطاق الكفوء (±${THRESHOLDS.NORMAL_BAND_PCT}% من الاحتياج المستهدف المشتق من الأقمار الصناعية والطقس)`,
    }
  }

  return {
    status: 'ineligible',
    efficientPct: Math.round(efficientPct * 10) / 10,
    coveragePct: Math.round(coveragePct * 10) / 10,
    comparedCount,
    generatedCount,
    distribution,
    reason: `فقط ${Math.round(efficientPct)}% من فترات الري ضمن النطاق الكفوء (الحد الأدنى ${ELIGIBILITY_THRESHOLDS.MIN_EFFICIENT_PCT_FOR_ELIGIBILITY}%)؛ توجد فترات إفراط أو عجز مائي يجب معالجتها قبل التوثيق`,
  }
}

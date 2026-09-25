// ============== محرك إثبات الكربون (Carbon Attestation Engine) ==============
//
// هذا الملف هو الجسر بين ثلاث منظومات كانت موجودة منفصلة في المشروع:
//   1) المراقبة الأرضية-الفضائية (space-comparison.ts → checkPeriodEligibility)
//   2) الحساب الكمّي لوحدات الأثر (نفس منهجية src/app/api/impact/route.ts، لكن هنا
//      مُطبَّقة على فترة/مشروع واحد بدل المحفظة الكاملة، ومع تسجيل صريح لمصدر كل رقم)
//   3) التوثيق على Hedera (AttestationBatch + OutboxEvent، بنفس نمط توثيق القراءات
//      الفردية الموجود مسبقًا عبر n8n + Blind Signer)
//
// التسلسل الإلزامي لإصدار "ملف إثبات كربون" (AttestationBatch) لفترة معيّنة:
//   checkPeriodEligibility()  →  إن لم تكن 'eligible': يُرفض الطلب فورًا (لا حساب، لا هاش)
//        │
//        ▼
//   computeCarbonForPeriod()  →  يحسب الكربون + يبني payload مفصّل يميّز كل رقم:
//                                 measured (من قراءة أرضية مدقَّقة) أو
//                                 estimated (تقدير حسابي، كمعاملات التشجير) أو
//                                 reference_db (من جدول معتمد) أو
//                                 reference_fallback (قيمة احتياطية مكتوبة بالكود)
//        │
//        ▼
//   buildAttestationPayload() →  يجمّد كل ما سبق + نتيجة الأهلية في JSON قانوني واحد
//        │
//        ▼
//   sha256(payload)           →  batchHash
//        │
//        ▼
//   AttestationBatch (status: pending) + OutboxEvent (eventType: attestation_submit)
//        → يلتقطها نفس المستهلك (n8n / Blind Signer) الذي يوثّق القراءات الفردية حاليًا
//        → عند تأكيد الإجماع: status → 'confirmed'، وعندها فقط يجوز ترقية/إنشاء
//          ImpactUnit بحالة 'verified' مرتبطة بهذا الـ batch (انظر promoteToVerifiedUnit)

import crypto from 'crypto'
import { db } from './db'
import { getEmissionFactor, getConversionFactor } from './reference-data'
import { checkPeriodEligibility, type PeriodEligibilityResult } from './space-comparison'

// نفس القيم المستخدمة في src/app/api/impact/route.ts — منقولة هنا حرفيًا لضمان أن
// ملف الإثبات يستخدم بالضبط نفس الأرقام المعروضة في لوحة "وحدات الأثر"، لا نسخة مختلفة.
// ملاحظة المصدر (كما في الملف الأصلي): هذه قيم تقديرية مكتوبة بالكود، لا يوجد لها
// جدول مرجعي معتمد لكل نوع شجرة على حدة في قاعدة البيانات حاليًا.
const TREE_ABSORPTION_FACTORS: Record<string, number> = {
  'السدر (Ziziphus spina-christi)': 22,
  'الغاف (Prosopis cineraria)': 18,
  'الأثل (Tamarix)': 15,
  'السمر (Acacia tortilis)': 20,
  'العرعر (Juniperus)': 12,
  'الزيتون (Olea europaea)': 25,
  'النخيل (Phoenix dactylifera)': 30,
  'اللوز (Prunus dulcis)': 20,
}

export type DataSourceClass = 'measured' | 'estimated' | 'reference_db' | 'reference_fallback'

export interface AttestationInputLine {
  label: string
  value: number
  unit: string
  sourceClass: DataSourceClass
  sourceDetail: string // مصدر نصي: اسم الجدول، اسم القراءة، أو شرح التقدير
}

export interface AttestationReadingRef {
  readingId: string
  measuredAt: string
  valueKwh: number
  qualityStatus: string
  groundSpaceAssessment: string | null // اجتاز البوابة أم لا، لكل قراءة على حدة (تدقيق تفصيلي)
}

export interface CarbonPeriodComputation {
  projectId: string
  periodStart: string
  periodEnd: string
  totalEnergyKwh: number
  kgCO2eAvoided: number
  formula: string
  inputs: AttestationInputLine[]
  readingRefs: AttestationReadingRef[]
  eligibility: PeriodEligibilityResult
}

export class AttestationIneligibleError extends Error {
  constructor(public eligibility: PeriodEligibilityResult) {
    super(`الفترة غير مؤهلة لإصدار إثبات كربون: ${eligibility.reason}`)
    this.name = 'AttestationIneligibleError'
  }
}

/**
 * يحسب الكربون المتجنَّب/الممتص لفترة ومشروع محددين، مع تسجيل تفصيلي لمصدر كل رقم
 * دخل في الحساب. **لا يُستدعى مباشرة من API الإصدار** قبل التأكد من الأهلية — لكنه
 * يتحقق من ذلك بنفسه أيضًا (fail-safe) ويرمي AttestationIneligibleError إن فشلت.
 */
export async function computeCarbonForPeriod(
  projectId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<CarbonPeriodComputation> {
  // Fail-safe: حتى لو نسي المستدعي فحص الأهلية، هذه الدالة لا تُنتج نتيجة قابلة
  // للتوثيق لفترة غير مؤهلة.
  const eligibility = await checkPeriodEligibility(projectId, periodStart, periodEnd)
  if (eligibility.status !== 'eligible') {
    throw new AttestationIneligibleError(eligibility)
  }

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      id: true, name: true, nameAr: true, country: true, projectType: true,
      treeSpecies: true, treeCount: true, plantingDate: true, survivalRateTarget: true,
    },
  })
  if (!project) throw new Error('المشروع غير موجود')

  const readings = await db.energyReading.findMany({
    where: {
      projectId,
      metricType: 'energy_export_kwh',
      qualityStatus: { in: ['validated', 'approved', 'corrected'] },
      measuredAt: { gte: periodStart, lt: periodEnd },
    },
    select: { id: true, value: true, measuredAt: true, qualityStatus: true },
    orderBy: { measuredAt: 'asc' },
  })

  // نجلب نتائج المقارنة الفضائية-الأرضية لكل قراءة على حدة (وليس فقط الملخص العام
  // من checkPeriodEligibility) بحيث يحتوي ملف الإثبات على سجل تدقيق كامل لكل قراءة.
  const comparisons = await db.groundSpaceComparison.findMany({
    where: { projectId, measuredAt: { gte: periodStart, lt: periodEnd } },
    select: { readingId: true, assessment: true },
  })
  const assessmentByReadingId = new Map(comparisons.map((c) => [c.readingId, c.assessment]))

  const totalEnergyKwh = readings.reduce((s, r) => s + r.value, 0)
  const countryCode = (project.country || 'SA').substring(0, 2).toUpperCase()
  const emissionFactor = await getEmissionFactor(countryCode, periodEnd)

  const inputs: AttestationInputLine[] = []
  let kgCO2eAvoided = 0
  let formula: string

  if (project.projectType === 'afforestation' && project.treeCount) {
    // نفس منهجية impact/route.ts للتشجير — تقدير صريح، مصدره التقني موسوم بوضوح
    const genericTreeFactor = await getConversionFactor('tree_co2')
    const perSpecies = TREE_ABSORPTION_FACTORS[project.treeSpecies || '']
    const treeFactor = perSpecies ?? genericTreeFactor.value
    const alive = Math.round((project.treeCount || 0) * (project.survivalRateTarget || 0.85))
    const years = project.plantingDate
      ? (periodEnd.getTime() - project.plantingDate.getTime()) / (1000 * 60 * 60 * 24 * 365)
      : 0
    kgCO2eAvoided = alive * treeFactor * Math.max(years, 0)
    formula = 'kgCO2e = عدد_الأشجار_الحية × معامل_الامتصاص_للنوع(kg/شجرة/سنة) × عدد_السنوات_منذ_الزراعة'

    inputs.push(
      { label: 'عدد الأشجار المزروعة', value: project.treeCount, unit: 'شجرة', sourceClass: 'measured', sourceDetail: 'Project.treeCount (سجل المشروع)' },
      { label: 'معدل البقاء المستهدف', value: project.survivalRateTarget || 0.85, unit: 'نسبة', sourceClass: 'estimated', sourceDetail: 'Project.survivalRateTarget (تقدير تشغيلي، ليس عدًّا فعليًا للأشجار الحية)' },
      { label: 'الأشجار الحية المقدَّرة', value: alive, unit: 'شجرة', sourceClass: 'estimated', sourceDetail: 'محسوبة = treeCount × survivalRateTarget' },
      {
        label: 'معامل الامتصاص لنوع الشجرة',
        value: treeFactor,
        unit: 'kgCO2/شجرة/سنة',
        sourceClass: perSpecies ? 'estimated' : (genericTreeFactor.fromDb ? 'reference_db' : 'reference_fallback'),
        sourceDetail: perSpecies
          ? `قيمة تقديرية ثابتة بالكود لنوع "${project.treeSpecies}" — لا يوجد جدول مرجعي معتمد لكل نوع في قاعدة البيانات حاليًا`
          : `ConversionFactor(tree_co2) — ${genericTreeFactor.source} ${genericTreeFactor.version}`,
      },
      { label: 'عدد السنوات منذ الزراعة', value: Math.round(years * 100) / 100, unit: 'سنة', sourceClass: 'measured', sourceDetail: 'Project.plantingDate مقارنة بنهاية الفترة' },
    )
  } else {
    kgCO2eAvoided = totalEnergyKwh * emissionFactor.factor
    formula = 'kgCO2e = مجموع_الطاقة_المصدَّرة(kWh) × معامل_انبعاث_الشبكة(kgCO2e/kWh)'

    inputs.push(
      {
        label: 'إجمالي الطاقة المصدَّرة للفترة',
        value: Math.round(totalEnergyKwh * 100) / 100,
        unit: 'kWh',
        sourceClass: 'measured',
        sourceDetail: `مجموع ${readings.length} قراءة EnergyReading مدقَّقة (qualityStatus ∈ validated/approved/corrected)`,
      },
      {
        label: 'معامل انبعاث الشبكة',
        value: emissionFactor.factor,
        unit: 'kgCO2e/kWh',
        sourceClass: emissionFactor.fromDb ? 'reference_db' : 'reference_fallback',
        sourceDetail: `GridEmissionFactor(${countryCode}) — ${emissionFactor.source} ${emissionFactor.version}`,
      },
    )
  }

  const readingRefs: AttestationReadingRef[] = readings.map((r) => ({
    readingId: r.id,
    measuredAt: r.measuredAt.toISOString(),
    valueKwh: r.value,
    qualityStatus: r.qualityStatus,
    groundSpaceAssessment: assessmentByReadingId.get(r.id) ?? null,
  }))

  return {
    projectId,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    totalEnergyKwh: Math.round(totalEnergyKwh * 100) / 100,
    kgCO2eAvoided: Math.round(kgCO2eAvoided * 100) / 100,
    formula,
    inputs,
    readingRefs,
    eligibility,
  }
}

/**
 * يبني JSON قانوني (مفاتيح مرتّبة أبجديًا، بدون فراغات عشوائية) من نتيجة الحساب،
 * بحيث يكون الهاش الناتج قابلاً لإعادة الإنتاج من طرف ثالث يملك نفس البيانات.
 * "قانوني" هنا يعني: أي إعادة تسلسل لنفس البيانات تُنتج نفس السلسلة النصية بالضبط.
 */
export function buildCanonicalPayload(computation: CarbonPeriodComputation): string {
  const canonical = {
    version: 'carbon-attestation-v1',
    projectId: computation.projectId,
    periodStart: computation.periodStart,
    periodEnd: computation.periodEnd,
    formula: computation.formula,
    totalEnergyKwh: computation.totalEnergyKwh,
    kgCO2eAvoided: computation.kgCO2eAvoided,
    inputs: [...computation.inputs].sort((a, b) => a.label.localeCompare(b.label)),
    readingRefs: [...computation.readingRefs].sort((a, b) => a.readingId.localeCompare(b.readingId)),
    eligibility: {
      status: computation.eligibility.status,
      normalPct: computation.eligibility.normalPct,
      coveragePct: computation.eligibility.coveragePct,
      comparedReadingCount: computation.eligibility.comparedReadingCount,
      distribution: computation.eligibility.distribution,
    },
  }
  // JSON.stringify مع مفاتيح بترتيب الإدراج أعلاه (ثابت ومقصود) — لا نستخدم
  // ترتيبًا عشوائيًا لضمان أن نفس المدخلات تُنتج نفس الهاش دائمًا.
  return JSON.stringify(canonical)
}

export function hashPayload(canonicalPayload: string): string {
  return crypto.createHash('sha256').update(canonicalPayload, 'utf8').digest('hex')
}

export interface CreateAttestationBatchResult {
  batch: {
    id: string
    batchHash: string
    status: string
    itemCount: number
    kgCO2eClaimed: number | null
    eligibilityStatus: string | null
  }
  computation: CarbonPeriodComputation
}

/**
 * ينفّذ المسار الكامل: أهلية → حساب → تجميد payload → هاش → حفظ AttestationBatch
 * + جدولة OutboxEvent لتوثيقه على Hedera (بنفس نمط توثيق القراءات الفردية).
 * يرمي AttestationIneligibleError إن لم تكن الفترة مؤهلة (لا يُنشئ أي سجل في هذه الحالة).
 */
export async function createAttestationBatch(
  projectId: string,
  periodStart: Date,
  periodEnd: Date,
  createdBy: string,
): Promise<CreateAttestationBatchResult> {
  const computation = await computeCarbonForPeriod(projectId, periodStart, periodEnd)

  const payload = buildCanonicalPayload(computation)
  const batchHash = hashPayload(payload)

  // لو نفس الفترة والمشروع ونفس المدخلات بالضبط أُرسلت سابقًا (نفس الهاش)، لا داعي
  // لتكرار الإصدار — نعيد السجل الموجود بدل إنشاء تكرار.
  const existing = await db.attestationBatch.findUnique({ where: { batchHash } })
  if (existing) {
    return {
      batch: {
        id: existing.id,
        batchHash: existing.batchHash,
        status: existing.status,
        itemCount: existing.itemCount,
        kgCO2eClaimed: existing.kgCO2eClaimed,
        eligibilityStatus: existing.eligibilityStatus,
      },
      computation,
    }
  }

  const batch = await db.$transaction(async (tx) => {
    const created = await tx.attestationBatch.create({
      data: {
        projectId,
        batchHash,
        status: 'pending',
        payloadSummary: payload,
        itemCount: computation.readingRefs.length,
        periodStart,
        periodEnd,
        kgCO2eClaimed: computation.kgCO2eAvoided,
        eligibilityStatus: computation.eligibility.status,
        eligibilityNormalPct: computation.eligibility.normalPct,
        eligibilityReadingCount: computation.eligibility.comparedReadingCount,
        eligibilityDetails: JSON.stringify(computation.eligibility.distribution),
        createdBy,
      },
    })

    // نفس نمط OutboxEvent المستخدم لتوثيق القراءات الفردية — مستهلك خارجي (n8n +
    // Blind Signer) يلتقط الأحداث pending، يرسل الهاش إلى Hedera، ثم يُحدّث النتيجة
    // (hederaTransactionId, consensusTimestamp) عبر مسار منفصل (webhook/callback)
    // لا عبر هذا المسار — تمامًا كآلية القراءات الفردية الحالية.
    await tx.outboxEvent.create({
      data: {
        eventType: 'attestation_submit',
        payload: JSON.stringify({ attestationBatchId: created.id, batchHash, projectId }),
        status: 'pending',
      },
    })

    return created
  })

  return {
    batch: {
      id: batch.id,
      batchHash: batch.batchHash,
      status: batch.status,
      itemCount: batch.itemCount,
      kgCO2eClaimed: batch.kgCO2eClaimed,
      eligibilityStatus: batch.eligibilityStatus,
    },
    computation,
  }
}

/**
 * يُرقّي دفعة إثبات "confirmed" (تم توثيقها فعليًا على Hedera) إلى ImpactUnit بحالة
 * 'verified'. لا تُستخدم لإنشاء وحدات 'estimated' — تلك تُدار من مسارات أخرى (calculator/impact)
 * قبل مرحلة التوثيق. الشرط الصريح: batch.status === 'confirmed' فقط.
 */
export async function promoteToVerifiedUnit(attestationBatchId: string, accountId: string) {
  const batch = await db.attestationBatch.findUnique({ where: { id: attestationBatchId } })
  if (!batch) throw new Error('ملف الإثبات غير موجود')
  if (batch.status !== 'confirmed') {
    throw new Error(`لا يمكن ترقية وحدة أثر إلا من دفعة إثبات مؤكدة على Hedera (الحالة الحالية: ${batch.status})`)
  }
  if (!batch.periodStart || !batch.periodEnd || batch.kgCO2eClaimed == null) {
    throw new Error('بيانات الفترة أو الكمية ناقصة في ملف الإثبات')
  }

  return db.impactUnit.create({
    data: {
      projectId: batch.projectId,
      accountId,
      amount: batch.kgCO2eClaimed,
      unit: 'kgCO2e',
      status: 'verified',
      periodStart: batch.periodStart,
      periodEnd: batch.periodEnd,
      methodologyVersion: 'carbon-attestation-v1',
      attestationBatchId: batch.id,
    },
  })
}

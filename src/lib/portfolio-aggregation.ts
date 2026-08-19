// ============== طبقة التجميع على مستوى محفظة التمويل الأخضر ==============
//
// الغرض: تجميع مؤشرات "محفظة تمويل أخضر" (Green Finance Impact Portfolio) لجهة ممولة
// (بنك) عبر عدة مشاريع، بالشكل الذي يحتاجه قسم الاستدامة/الائتمان في البنك للإفصاح
// (على غرار متطلبات PCAF / TCFD)، بدلاً من تقرير مشروع واحد فقط.
//
// مبدأ التصميم: هذا الملف لا يعيد حساب أي شيء من الصفر. هو يستدعي فقط المنطق
// المُختبَر الموجود مسبقًا في:
//   - impact-attestation.ts  → الكربون المتحقَّق per-project (نفس منهجية إثبات Hedera)
//   - attribution.ts         → نصيب كل ممول (PCAF capital-share attribution)
//   - space-comparison.ts    → بوابة التحقق الأرضي-الفضائي (checkPeriodEligibility)
//   - reference-data.ts      → معاملات الانبعاث الموثّقة المصدر
// ثم يُجمِّع نتائجها إلى ثمانية مؤشرات على مستوى المحفظة.
//
// شفافية إلزامية: كل مؤشر مركَّب (خصوصًا environmentalDataConfidence، الذي لا يوجد
// له تعريف معياري واحد متفق عليه عالميًا) يُرفَق بمعادلته الحرفية وبتفصيل كل مكوّن
// دخل فيه — بنفس روح sourceClass/sourceDetail في impact-attestation.ts. لا يُعرض أي
// رقم مركَّب دون أن يكون قابلاً للتفكيك إلى مكوناته أمام مدقق خارجي.

import { db } from './db'
import { getEmissionFactor } from './reference-data'
import { checkPeriodEligibility, type EligibilityStatus } from './space-comparison'
import { calculateFunderAttribution, type FunderAttributionInput } from './attribution'

// ============== الأوزان المستخدمة في "ثقة البيانات البيئية" ==============
// موثّقة صراحة هنا (لا في مكان آخر) لتسهيل المراجعة والتعديل من فريق المنهجية أو
// الامتثال. مجموع الأوزان = 1. كل تغيير على هذه الأوزان يجب أن يُسجَّل في CHANGELOG
// المنهجية لأنه يُغيّر رقمًا يُعرَض للجهات الممولة.
const CONFIDENCE_WEIGHTS = {
  // نسبة القراءات المُدقَّقة (validated/approved/corrected) من إجمالي القراءات المستلمة.
  // يعكس جودة خط الأنابيب التشغيلي (IoT/Inverter ingestion + مراجعة الشذوذ).
  dataQuality: 0.35,
  // نسبة المشاريع التي اجتازت بوابة المطابقة الأرضية-الفضائية (checkPeriodEligibility
  // بحالة 'eligible' على مدى عمر المشروع بأكمله، لا فترة واحدة فقط).
  satelliteVerification: 0.35,
  // نسبة المشاريع التي لديها AttestationBatch واحد على الأقل بحالة 'confirmed' على
  // Hedera — أي كربون موثَّق فعليًا على سجل غير قابل للتلاعب، لا مجرد مُقدَّر.
  ledgerAttestation: 0.30,
} as const

export type PortfolioProjectVerificationStatus =
  | 'fully_verified'      // اجتاز بوابة الفضاء (eligible) + له إثبات مؤكَّد على Hedera
  | 'satellite_only'      // اجتاز بوابة الفضاء لكن بلا إثبات مؤكَّد على Hedera بعد
  | 'ledger_only'         // له إثبات مؤكَّد على Hedera لكن لم يجتز/لم يُفحص بعد فضائيًا
  | 'unverified'          // لا هذا ولا ذاك

export interface PortfolioProjectSummary {
  projectId: string
  projectName: string
  projectCode: string
  projectType: string
  status: string
  capacityKwp: number | null
  totalEnergyKwh: number
  co2AvoidedKg: number
  co2RemovedKg: number // مساهمة التشجير فقط (removals) — منفصلة صراحة عن الطاقة الشمسية (avoidance)
  emissionFactorSource: string
  spaceEligibility: {
    status: EligibilityStatus
    normalPct: number | null
    reason: string
  }
  hasConfirmedAttestation: boolean
  verificationStatus: PortfolioProjectVerificationStatus
  funders: ReturnType<typeof calculateFunderAttribution>
}

export interface PortfolioMetrics {
  // 1. Green projects financed
  greenProjectsFinanced: number
  // 2. Solar capacity financed (MW) — يستثني مشاريع التشجير (لا سعة كهربائية لها)
  solarCapacityFinancedMw: number
  // 3. Renewable electricity generated (GWh)
  renewableElectricityGeneratedGwh: number
  // 4. Financed avoided emissions (tCO2e) — نصيب الممول فقط عبر PCAF attribution،
  //    وليس أثر المشروع الكامل (المفروض أن يكون أصغر من أو يساوي total avoided)
  financedAvoidedEmissionsTco2e: number
  // مرجع: إجمالي الأثر الكامل (100%) للمقارنة — لا يُستخدم كمؤشر بنكي مباشر لكن
  // ضروري لفهم نسبة تغطية التمويل
  totalAvoidedEmissionsTco2e: number
  // 5. Carbon removals (tCO2e) — مفصولة صراحة عن avoided (منهجية GHG Protocol/PCAF
  //    تُميّز بينهما: avoidance = عدم انبعاث كان سيحدث، removal = امتصاص فعلي موجود)
  carbonRemovalsTco2e: number
  // 6. Projects independently verified (%) — انظر التعريف الصريح في `definitions` أدناه؛
  //    هذا هو "confirmed على Hedera" فقط، وليس مراجعة طرف ثالث بشري (غير موجودة في
  //    المنصة بعد — انظر limitations)
  projectsIndependentlyVerifiedPct: number
  // 7. Satellite-verified projects (%) — اجتازت checkPeriodEligibility بحالة eligible
  //    على مدى عمر المشروع كاملاً (وليس فترة تقرير واحدة فقط)
  satelliteVerifiedProjectsPct: number
  // 8. Environmental data confidence (%) — مؤشر مركَّب، معادلته وأوزانه موثّقة في
  //    `confidenceBreakdown` أدناه لضمان قابلية التفكيك أمام أي مدقق
  environmentalDataConfidencePct: number
  confidenceBreakdown: {
    formula: string
    weights: typeof CONFIDENCE_WEIGHTS
    components: {
      dataQualityPct: number
      satelliteVerificationPct: number
      ledgerAttestationPct: number
    }
  }
  definitions: {
    projectsIndependentlyVerified: string
    satelliteVerified: string
    financedAvoidedEmissions: string
    carbonRemovals: string
  }
  limitations: string[]
}

export interface PortfolioAggregationResult {
  organizationId: string
  periodStart: string
  periodEnd: string
  generatedAt: string
  projectIds: string[]
  metrics: PortfolioMetrics
  projects: PortfolioProjectSummary[]
}

const DEFINITIONS = {
  projectsIndependentlyVerified:
    'نسبة المشاريع التي يملك أحد فتراتها الزمنية على الأقل ملف إثبات (AttestationBatch) ' +
    'بحالة "confirmed" فعليًا على شبكة Hedera العامة — أي هاش SHA-256 لبيانات المشروع تم ' +
    'تثبيته على سجل إجماع لا مركزي غير قابل للتعديل بأثر رجعي، والقابل للتحقق المستقل عبر ' +
    'Hedera Mirror Node (انظر /api/readings/[id]/audit/verify-hedera). هذا التعريف الحالي ' +
    'لا يعني بالضرورة "راجعه مدقق بشري خارجي مستقل (third-party auditor)" — تلك طبقة ' +
    'إضافية (workflow موافقات) غير مُنفَّذة في المنصة بعد، انظر limitations.',
  satelliteVerified:
    'نسبة المشاريع التي اجتازت بوابة المطابقة الأرضية-الفضائية (checkPeriodEligibility) ' +
    'بحالة "eligible" على مدى العمر التشغيلي الكامل للمشروع — أي أن القراءات الأرضية ' +
    'المُعلَنة (من الإنفرترات/العدادات) متوافقة إحصائيًا مع بيانات الإشعاع الشمسي الفضائي ' +
    'المستقلة (CDSE / Open-Meteo Solar حاليًا؛ NASA POWER وCAMS معطَّلان مؤقتًا في دورة ' +
    'السحب اليومية، انظر src/lib/space-data/sync.ts).',
  financedAvoidedEmissions:
    'نصيب الجهة الممولة (البنك) فقط من الانبعاثات المُتجنَّبة الكلية للمشروع، محسوبة بمنهجية ' +
    'PCAF لتمويل المشاريع: Attribution Factor = Outstanding Funding / Total Project Value، ' +
    'ثم Financed Avoided Emissions = Attribution Factor × Project Avoided Emissions. ' +
    'المشاريع بلا سجل ProjectFunder نشط لا تُسهم بأي رقم هنا (تظهر فقط في totalAvoidedEmissionsTco2e).',
  carbonRemovals:
    'الكربون المُمتَص فعليًا (وليس المُتجنَّب) من مشاريع التشجير فقط — GHG Protocol/PCAF ' +
    'يُميّزان صراحة بين avoidance (انبعاث لم يحدث بسبب المشروع، كالطاقة الشمسية) وremoval ' +
    '(امتصاص فعلي لكربون موجود بالفعل في الغلاف الجوي، كالأشجار). لا يجوز جمع الرقمين معًا ' +
    'في إفصاح واحد دون تمييز، لذلك يُعرضان هنا كحقلين منفصلين دائمًا.',
} as const

/**
 * يفحص أهلية مشروع كامل (عمره التشغيلي بأكمله، لا فترة تقرير واحدة) للتحقق الفضائي-
 * الأرضي. يُعيد استخدام نفس عتبات ومنطق checkPeriodEligibility من space-comparison.ts
 * حرفيًا — فقط بنطاق زمني أوسع (من تاريخ التشغيل حتى الآن) مناسب لسؤال "هل هذا المشروع
 * بشكل عام موثوق فضائيًا؟" بدل "هل فترة معينة موثوقة؟".
 */
async function checkProjectLifetimeSpaceEligibility(
  projectId: string,
  commissionedAt: Date | null,
) {
  const start = commissionedAt ?? new Date('2000-01-01')
  const end = new Date()
  return checkPeriodEligibility(projectId, start, end)
}

/**
 * يُجمِّع مؤشرات محفظة التمويل الأخضر لمجموعة مشاريع محددة (أو كل مشاريع منظمة ما إن
 * لم تُحدَّد قائمة). لا يحفظ أي شيء في قاعدة البيانات — استعلام حي فقط. للحفظ الدائم
 * (لقطة موثَّقة تُرسَل لجهة خارجية)، استخدم src/app/api/portfolio-reports/route.ts الذي
 * يستدعي هذه الدالة ثم يُجمِّد نتيجتها في PortfolioReport.
 */
export async function aggregatePortfolioMetrics(
  organizationId: string,
  options?: { projectIds?: string[]; periodStart?: Date; periodEnd?: Date },
): Promise<PortfolioAggregationResult> {
  const periodEnd = options?.periodEnd ?? new Date()
  const periodStart = options?.periodStart ?? new Date('2000-01-01')

  const projects = await db.project.findMany({
    where: {
      organizationId,
      ...(options?.projectIds ? { id: { in: options.projectIds } } : {}),
    },
    select: {
      id: true, name: true, nameAr: true, code: true, projectType: true, status: true,
      country: true, capacityKwp: true, commissionedAt: true,
      treeSpecies: true, treeCount: true, survivalRateTarget: true, plantingDate: true,
      funders: {
        where: { isActive: true },
        select: {
          id: true, funderName: true, funderNameAr: true, fundingAmount: true,
          projectTotalValue: true, attributionShare: true, attributionMethod: true,
          currency: true, isActive: true,
        },
      },
    },
  })

  const projectIds = projects.map((p) => p.id)

  // قراءات الطاقة المُدقَّقة فقط (نفس شرط كل مسار حساب آخر في المنصة) لكل المشاريع دفعة
  // واحدة، ثم تُقسَّم بالذاكرة — أسرع من استعلام منفصل لكل مشروع.
  const verifiedStatuses = ['validated', 'approved', 'corrected']
  const readings = await db.energyReading.findMany({
    where: {
      projectId: { in: projectIds },
      metricType: 'energy_export_kwh',
      qualityStatus: { in: verifiedStatuses },
      measuredAt: { gte: periodStart, lte: periodEnd },
    },
    select: { projectId: true, value: true },
  })

  // مشاريع لديها AttestationBatch واحد على الأقل مؤكَّد فعليًا على Hedera
  const confirmedBatches = await db.attestationBatch.findMany({
    where: { projectId: { in: projectIds }, status: 'confirmed' },
    select: { projectId: true },
    distinct: ['projectId'],
  })
  const confirmedProjectIds = new Set(confirmedBatches.map((b) => b.projectId))

  const emissionFactorCache = new Map<string, Awaited<ReturnType<typeof getEmissionFactor>>>()

  const projectSummaries: PortfolioProjectSummary[] = []
  let totalCapacityKwp = 0
  let totalEnergyKwh = 0
  let totalAvoidedKg = 0
  let totalRemovedKg = 0
  let totalFinancedAvoidedKg = 0

  for (const project of projects) {
    const projectReadings = readings.filter((r) => r.projectId === project.id)
    const projectEnergyKwh = projectReadings.reduce((s, r) => s + r.value, 0)

    let projectAvoidedKg = 0
    let emissionFactorSource = 'n/a'
    let projectRemovedKg = 0

    if (project.projectType === 'afforestation') {
      // Removal (امتصاص)، وليس avoidance — يُحسب هنا فقط لإظهاره كحقل منفصل في المحفظة.
      // نفس منهجية impact-attestation.ts لكن مُلخَّصة (بدون تفصيل sourceClass لكل مُدخل،
      // فذاك التفصيل متاح فعليًا من خلال /api/impact لكل مشروع على حدة).
      const TREE_FACTOR_DEFAULT = 21 // kgCO2/tree/year — fallback fs متوافق مع reference-data.ts
      const alive = Math.round((project.treeCount || 0) * (project.survivalRateTarget || 0.85))
      const years = project.plantingDate
        ? (periodEnd.getTime() - project.plantingDate.getTime()) / (1000 * 60 * 60 * 24 * 365)
        : 0
      projectRemovedKg = alive * TREE_FACTOR_DEFAULT * Math.max(years, 0)
      emissionFactorSource = 'tree_co2 (estimated, per impact-attestation.ts)'
    } else {
      const countryCode = (project.country || 'SA').substring(0, 2).toUpperCase()
      if (!emissionFactorCache.has(countryCode)) {
        emissionFactorCache.set(countryCode, await getEmissionFactor(countryCode, periodEnd))
      }
      const ef = emissionFactorCache.get(countryCode)!
      projectAvoidedKg = projectEnergyKwh * ef.factor
      emissionFactorSource = `${ef.source} ${ef.version}`
      if (project.capacityKwp) totalCapacityKwp += project.capacityKwp
    }

    const spaceEligibility = await checkProjectLifetimeSpaceEligibility(project.id, project.commissionedAt)
    const hasConfirmedAttestation = confirmedProjectIds.has(project.id)

    let verificationStatus: PortfolioProjectVerificationStatus
    if (spaceEligibility.status === 'eligible' && hasConfirmedAttestation) verificationStatus = 'fully_verified'
    else if (spaceEligibility.status === 'eligible') verificationStatus = 'satellite_only'
    else if (hasConfirmedAttestation) verificationStatus = 'ledger_only'
    else verificationStatus = 'unverified'

    const funderInputs: FunderAttributionInput[] = project.funders
    const funderResults = calculateFunderAttribution(projectAvoidedKg, funderInputs, projectEnergyKwh)
    const projectFinancedAvoidedKg = funderResults.reduce((s, f) => s + f.attributableCo2AvoidedKg, 0)

    totalEnergyKwh += projectEnergyKwh
    totalAvoidedKg += projectAvoidedKg
    totalRemovedKg += projectRemovedKg
    totalFinancedAvoidedKg += projectFinancedAvoidedKg

    projectSummaries.push({
      projectId: project.id,
      projectName: project.nameAr || project.name,
      projectCode: project.code,
      projectType: project.projectType,
      status: project.status,
      capacityKwp: project.capacityKwp,
      totalEnergyKwh: Math.round(projectEnergyKwh * 100) / 100,
      co2AvoidedKg: Math.round(projectAvoidedKg * 100) / 100,
      co2RemovedKg: Math.round(projectRemovedKg * 100) / 100,
      emissionFactorSource,
      spaceEligibility: {
        status: spaceEligibility.status,
        normalPct: spaceEligibility.normalPct,
        reason: spaceEligibility.reason,
      },
      hasConfirmedAttestation,
      verificationStatus,
      funders: funderResults,
    })
  }

  // === مؤشرات التحقق على مستوى المحفظة ===
  const totalProjects = projects.length
  const satelliteVerifiedCount = projectSummaries.filter((p) => p.spaceEligibility.status === 'eligible').length
  const ledgerVerifiedCount = projectSummaries.filter((p) => p.hasConfirmedAttestation).length

  const satelliteVerifiedProjectsPct = totalProjects > 0 ? (satelliteVerifiedCount / totalProjects) * 100 : 0
  const projectsIndependentlyVerifiedPct = totalProjects > 0 ? (ledgerVerifiedCount / totalProjects) * 100 : 0

  // نسبة جودة البيانات: من مجمل القراءات المستلمة لهذه المشاريع (وليس فقط المُدقَّقة)
  const allReadingsCount = await db.energyReading.count({ where: { projectId: { in: projectIds } } })
  const validatedReadingsCount = await db.energyReading.count({
    where: { projectId: { in: projectIds }, qualityStatus: { in: verifiedStatuses } },
  })
  const dataQualityPct = allReadingsCount > 0 ? (validatedReadingsCount / allReadingsCount) * 100 : 0

  const environmentalDataConfidencePct =
    dataQualityPct * CONFIDENCE_WEIGHTS.dataQuality +
    satelliteVerifiedProjectsPct * CONFIDENCE_WEIGHTS.satelliteVerification +
    projectsIndependentlyVerifiedPct * CONFIDENCE_WEIGHTS.ledgerAttestation

  const limitations: string[] = []
  if (satelliteVerifiedCount < totalProjects) {
    limitations.push(
      `${totalProjects - satelliteVerifiedCount} من ${totalProjects} مشروعًا لم يجتز بعد بوابة المطابقة الفضائية ` +
      `(إما بيانات فضائية غير كافية، أو انحراف قراءات يتطلب مراجعة).`,
    )
  }
  if (ledgerVerifiedCount < totalProjects) {
    limitations.push(
      `${totalProjects - ledgerVerifiedCount} من ${totalProjects} مشروعًا ليس له بعد ملف إثبات مؤكَّد على Hedera.`,
    )
  }
  limitations.push(
    'مؤشر "Projects independently verified" يعكس حاليًا التوثيق على سجل Hedera اللامركزي، ' +
    'وليس مراجعة بشرية من مدقق طرف ثالث معتمد — تلك طبقة موافقات منفصلة غير مُفعَّلة في المنصة بعد.',
  )
  limitations.push(
    'مصادر الإشعاع الفضائي النشطة حاليًا: CDSE وOpen-Meteo Solar. مصدرا NASA POWER وCAMS ' +
    'معطَّلان مؤقتًا في دورة السحب اليومية (انظر src/lib/space-data/sync.ts).',
  )

  const metrics: PortfolioMetrics = {
    greenProjectsFinanced: totalProjects,
    solarCapacityFinancedMw: Math.round((totalCapacityKwp / 1000) * 1000) / 1000,
    renewableElectricityGeneratedGwh: Math.round((totalEnergyKwh / 1_000_000) * 1000) / 1000,
    financedAvoidedEmissionsTco2e: Math.round((totalFinancedAvoidedKg / 1000) * 100) / 100,
    totalAvoidedEmissionsTco2e: Math.round((totalAvoidedKg / 1000) * 100) / 100,
    carbonRemovalsTco2e: Math.round((totalRemovedKg / 1000) * 100) / 100,
    projectsIndependentlyVerifiedPct: Math.round(projectsIndependentlyVerifiedPct * 10) / 10,
    satelliteVerifiedProjectsPct: Math.round(satelliteVerifiedProjectsPct * 10) / 10,
    environmentalDataConfidencePct: Math.round(environmentalDataConfidencePct * 10) / 10,
    confidenceBreakdown: {
      formula:
        'confidence = dataQuality% × 0.35 + satelliteVerified% × 0.35 + ledgerAttestation% × 0.30',
      weights: CONFIDENCE_WEIGHTS,
      components: {
        dataQualityPct: Math.round(dataQualityPct * 10) / 10,
        satelliteVerificationPct: Math.round(satelliteVerifiedProjectsPct * 10) / 10,
        ledgerAttestationPct: Math.round(projectsIndependentlyVerifiedPct * 10) / 10,
      },
    },
    definitions: DEFINITIONS,
    limitations,
  }

  return {
    organizationId,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    generatedAt: new Date().toISOString(),
    projectIds,
    metrics,
    projects: projectSummaries,
  }
}

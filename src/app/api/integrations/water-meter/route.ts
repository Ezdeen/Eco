import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { verifyApiKey, hasScope } from '@/lib/api-key'
import { computeCanonicalWaterHash } from '@/lib/canonical-hash-water'
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware-utils'

// هذه النقطة نسخة مطابقة معماريًا لـ /api/integrations/inverter لكن لعدادات المياه الذكية
// (مشاريع الري الذكي smart_irrigation)، بنفس المبدأ: n8n يرسل بيانات القراءة الواضحة مع الهاش
// الذي حسبه مسبقًا (Hash_08) والذي سبق أن أثبته على Hedera. دور المنصة هنا ليس أن تكون مصدر
// الإثبات، بل أن تتحقق من تطابق هاش n8n، ثم تُخزّن سجل الأدلة (evidence trail) كاملاً.
const waterMeterPayloadSchema = z.object({
  serialNumber: z.string().min(1),
  intervalVolumeM3: z.number(), // الحجم المُستهلَك خلال هذه الفترة (م³) — مكافئ productionNow
  cumulativeM3: z.number(), // القراءة التراكمية للعداد منذ التركيب (م³) — مكافئ productionTotal
  timestamp: z.string(), // ISO 8601 — يجب أن يكون بالضبط النص الذي استخدمه n8n لحساب الهاش
  n8nHash: z.string().length(64), // Hash_08 — بصمة SHA-256 حسبها n8n قبل الإرسال إلى Hedera
  hederaTransactionId: z.string().min(1), // دليل أن n8n سبق أن أثبت هذا الهاش على شبكة Hedera
  hederaConsensusAt: z.string().optional(), // الطابع الزمني للإجماع من Hedera، إن كان متاحًا
})

// POST /api/integrations/water-meter
// Auth: Authorization: Bearer esg_xxxxx  (مفتاح API بصلاحية "ingestion:write")
export async function POST(request: NextRequest) {
  try {
    const rateCheck = checkRateLimit(request, RATE_LIMITS.ingestion, 'ingestion-water-meter')
    if (!rateCheck.allowed && rateCheck.response) {
      return new NextResponse(rateCheck.response.body, {
        status: rateCheck.response.status,
        headers: rateCheck.response.headers,
      })
    }

    const apiKeyCtx = await verifyApiKey(request)
    if (!apiKeyCtx) {
      return NextResponse.json({ error: 'مفتاح API غير صالح أو مفقود' }, { status: 401 })
    }
    if (!hasScope(apiKeyCtx, 'ingestion:write')) {
      return NextResponse.json({ error: 'مفتاح API لا يملك صلاحية الاستيعاب' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = waterMeterPayloadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'بيانات غير صالحة', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const {
      serialNumber,
      intervalVolumeM3,
      cumulativeM3,
      timestamp,
      n8nHash,
      hederaTransactionId,
      hederaConsensusAt,
    } = parsed.data

    // === فحص فيزيائي مبدئي: التدفق/الحجم لا يمكن أن يكون سالبًا ===
    // على عكس القيمة التراكمية (التي تُفحص لاحقًا بعد إيجاد القراءة السابقة)، هذا الفحص لا
    // يحتاج قراءة سابقة على الإطلاق — حجم مياه سالب مستحيل فيزيائيًا لأي عداد، ويدل إما على
    // خطأ في تحويل وحدات المستشعر أو محاولة تلاعب بالبيانات قبل حسابها.
    if (intervalVolumeM3 < 0) {
      return NextResponse.json(
        { error: `حجم المياه للفترة (${intervalVolumeM3}) قيمة سالبة — غير ممكن فيزيائيًا لعداد مياه` },
        { status: 400 },
      )
    }

    // Resolve device/project by serial number (يفحص جدول Device ثم Project.waterMeterSerial)
    const device = await db.device.findUnique({
      where: { serialNumber },
      select: { id: true, projectId: true, siteId: true, assetId: true },
    })

    let projectId: string
    let deviceId: string | null = null
    let siteId: string | undefined
    let assetId: string | undefined

    if (device) {
      projectId = device.projectId
      deviceId = device.id
      siteId = device.siteId || undefined
      assetId = device.assetId || undefined
    } else {
      const projectBySerial = await db.project.findFirst({
        where: { waterMeterSerial: serialNumber },
        select: { id: true },
      })
      if (!projectBySerial) {
        return NextResponse.json(
          { error: `لا يوجد جهاز أو مشروع مرتبط بالرقم التسلسلي: ${serialNumber}` },
          { status: 404 },
        )
      }
      projectId = projectBySerial.id
    }

    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { organizationId: true },
    })
    if (!project || project.organizationId !== apiKeyCtx.organizationId) {
      return NextResponse.json({ error: 'هذا الجهاز لا ينتمي لمؤسستك' }, { status: 403 })
    }

    const measuredAt = new Date(timestamp)
    if (isNaN(measuredAt.getTime())) {
      return NextResponse.json({ error: 'تاريخ/وقت غير صالح' }, { status: 400 })
    }

    // === خطوة التحقق الجوهرية ===
    // إعادة حساب الهاش من البيانات الواضحة بنفس التنسيق القانوني الذي استخدمه n8n بالضبط.
    // إن لم يتطابق مع n8nHash، فإما أن هناك خللاً في سير عمل n8n، أو أن البيانات تم العبث بها
    // أثناء النقل بين n8n والمنصة.
    const checkHash = computeCanonicalWaterHash({ serialNumber, intervalVolumeM3, cumulativeM3, timestamp })
    const hashMatchStatus = checkHash === n8nHash ? 'match' : 'mismatch'

    if (hashMatchStatus === 'mismatch') {
      console.error(
        `[Water Meter Ingestion] HASH MISMATCH for ${serialNumber} at ${timestamp}. ` +
        `n8n sent: ${n8nHash}, platform computed: ${checkHash}`,
      )
    }

    // Idempotency: تفادي تكرار إدخال نفس القراءة إن أعاد n8n إرسال الطلب
    const existing = await db.energyReading.findFirst({
      where: { deviceId: deviceId || undefined, metricType: 'water_meter_m3', intervalStart: measuredAt },
    })
    if (existing) {
      return NextResponse.json({
        success: true,
        duplicate: true,
        readingId: existing.id,
        hashMatchStatus: existing.hashMatchStatus,
      })
    }

    // === فحص منطقية القيمة التراكمية ===
    // عداد المياه التراكمي لا يمكن إلا أن يبقى ثابتًا (لا استهلاك) أو يزيد — لا يمكن أبدًا أن
    // ينخفض، وتحت التشغيل الطبيعي يُفترض أن يزيد بين القراءات المتتالية. قيمة تراكمية متطابقة
    // تمامًا مع القراءة السابقة عادة ما تدل على مشكلة بمصدر البيانات (مثل إعادة إرسال n8n لبيانات
    // قديمة/تجريبية) وليس قراءة عداد فعلية، لذا تُعلَّم للمراجعة بدل قبولها كمُتحقَّق منها تلقائيًا.
    const previousReading = await db.energyReading.findFirst({
      where: {
        deviceId: deviceId || undefined,
        metricType: 'water_meter_m3',
        measuredAt: { lt: measuredAt },
      },
      orderBy: { measuredAt: 'desc' },
      select: { cumulativeValue: true, measuredAt: true },
    })

    let cumulativeAnomaly: { reason: string; ruleCode: string; severity: string } | null = null
    if (previousReading && previousReading.cumulativeValue !== null && previousReading.cumulativeValue !== undefined) {
      if (cumulativeM3 < previousReading.cumulativeValue) {
        cumulativeAnomaly = {
          reason: `القيمة التراكمية (${cumulativeM3} م³) أقل من القراءة السابقة (${previousReading.cumulativeValue} م³) بتاريخ ${previousReading.measuredAt.toISOString()} — هذا غير ممكن فيزيائياً لعداد مياه تراكمي إلا في حال استبدال العداد`,
          ruleCode: 'CUMULATIVE_DECREASED',
          severity: 'critical',
        }
      } else if (cumulativeM3 === previousReading.cumulativeValue) {
        cumulativeAnomaly = {
          reason: `القيمة التراكمية (${cumulativeM3} م³) مطابقة تماماً للقراءة السابقة بتاريخ ${previousReading.measuredAt.toISOString()} — لا استهلاك مياه مُسجَّل، يُحتمل خلل بمصدر البيانات أو توقف العداد/المضخة`,
          ruleCode: 'CUMULATIVE_UNCHANGED',
          severity: 'medium',
        }
      }
    }

    const reading = await db.energyReading.create({
      data: {
        projectId,
        siteId,
        assetId,
        deviceId,
        metricType: 'water_meter_m3',
        measuredAt,
        intervalStart: measuredAt,
        value: intervalVolumeM3,
        unit: 'm3',
        cumulativeValue: cumulativeM3,
        sourceEventId: `${serialNumber}:${measuredAt.toISOString()}`,
        qualityStatus: hashMatchStatus === 'mismatch' ? 'suspect' : cumulativeAnomaly ? 'suspect' : 'validated',
        validationStatus: hashMatchStatus === 'mismatch' ? 'invalid' : cumulativeAnomaly ? 'invalid' : 'valid',
        canonicalPayloadHash: checkHash,
        n8nProvidedHash: n8nHash,
        hashMatchStatus,
        hederaTransactionId,
        hederaConsensusAt: hederaConsensusAt || null,
        // عدم تطابق الهاش له الأولوية باعتباره القضية الأشد خطورة/الأكثر ارتباطًا بالأمان عند تزامن الاثنين
        suspectReason: hashMatchStatus === 'mismatch'
          ? 'عدم تطابق الهاش المرسل من n8n مع الهاش المحسوب بالمنصة'
          : cumulativeAnomaly?.reason || null,
        suspectRuleCode: hashMatchStatus === 'mismatch' ? 'HASH_MISMATCH' : cumulativeAnomaly?.ruleCode || null,
        suspectSeverity: hashMatchStatus === 'mismatch' ? 'critical' : cumulativeAnomaly?.severity || null,
      },
    })

    if (deviceId) {
      await db.device.update({ where: { id: deviceId }, data: { lastSeenAt: new Date() } }).catch(() => {})
    }

    await db.auditEvent.create({
      data: {
        organizationId: project.organizationId,
        actor: 'n8n-water-meter-ingestion',
        action: 'reading.ingest_attested',
        resource: 'energy_reading',
        resourceId: reading.id,
        result: hashMatchStatus === 'match' && !cumulativeAnomaly ? 'success' : 'failure',
        metadata: JSON.stringify({ serialNumber, hederaTransactionId, hashMatchStatus, cumulativeAnomaly: cumulativeAnomaly?.ruleCode || null }),
      },
    }).catch(() => {})

    return NextResponse.json(
      {
        success: true,
        readingId: reading.id,
        hashMatchStatus,
        checkHash,
        hederaTransactionId,
        cumulativeCheck: cumulativeAnomaly
          ? { status: 'anomaly', ruleCode: cumulativeAnomaly.ruleCode, reason: cumulativeAnomaly.reason }
          : { status: 'ok' },
      },
      { status: 201 },
    )
  } catch (error: any) {
    console.error('Water meter ingestion error:', error)
    return NextResponse.json({ error: error.message || 'خطأ داخلي بالسيرفر' }, { status: 500 })
  }
}

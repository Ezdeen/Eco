import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { verifyApiKey, hasScope } from '@/lib/api-key'
import { computeCanonicalHash } from '@/lib/canonical-hash'
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware-utils'

// n8n sends the clear reading data TOGETHER WITH the hash it already computed and
// already anchored on Hedera. The platform's job here is NOT to be the source of the
// attestation — it is to verify n8n's hash matches, then store the evidence trail.
const inverterPayloadSchema = z.object({
  serialNumber: z.string().min(1),
  productionNow: z.number(),
  productionTotal: z.number(),
  timestamp: z.string(), // ISO 8601 — must be the exact string n8n used to compute the hash
  n8nHash: z.string().length(64), // Hash_08 — SHA-256 hex digest computed by n8n before sending to Hedera
  hederaTransactionId: z.string().min(1), // proof n8n already anchored this hash on Hedera
  hederaConsensusAt: z.string().optional(), // consensus timestamp returned by Hedera, if available yet
})

// POST /api/ingestion/inverter
// Auth: Authorization: Bearer esg_xxxxx  (API key with "ingestion:write" scope)
export async function POST(request: NextRequest) {
  try {
    const rateCheck = checkRateLimit(request, RATE_LIMITS.ingestion, 'ingestion-inverter')
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
    const parsed = inverterPayloadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'بيانات غير صالحة', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const {
      serialNumber,
      productionNow,
      productionTotal,
      timestamp,
      n8nHash,
      hederaTransactionId,
      hederaConsensusAt,
    } = parsed.data

    // Resolve device/project by serial number (checks both Device table and Project.inverterSerial)
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
        where: { inverterSerial: serialNumber },
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

    // === THE CORE VERIFICATION STEP ===
    // Recompute the hash from the clear data using the exact same canonical format n8n used.
    // If this doesn't match n8nHash, either n8n's workflow has a bug, or the payload was
    // tampered with in transit between n8n and the platform.
    const checkHash = computeCanonicalHash({ serialNumber, productionNow, productionTotal, timestamp })
    const hashMatchStatus = checkHash === n8nHash ? 'match' : 'mismatch'

    if (hashMatchStatus === 'mismatch') {
      console.error(
        `[Inverter Ingestion] HASH MISMATCH for ${serialNumber} at ${timestamp}. ` +
        `n8n sent: ${n8nHash}, platform computed: ${checkHash}`,
      )
    }

    // Idempotency: avoid double-inserting the same reading if n8n retries the request
    const existing = await db.energyReading.findFirst({
      where: { deviceId: deviceId || undefined, metricType: 'energy_export_kwh', intervalStart: measuredAt },
    })
    if (existing) {
      return NextResponse.json({
        success: true,
        duplicate: true,
        readingId: existing.id,
        hashMatchStatus: existing.hashMatchStatus,
      })
    }

    // === CUMULATIVE METER SANITY CHECK ===
    // A cumulative production meter can only stay flat (inverter idle/offline) or increase —
    // it can never decrease, and under normal operation with the sun up it should increase
    // between readings. A repeated identical cumulative value across readings usually signals
    // a data-source problem (e.g. n8n resending stale/test data) rather than a real meter
    // reading, so we flag it for review instead of silently accepting it as validated.
    const previousReading = await db.energyReading.findFirst({
      where: {
        deviceId: deviceId || undefined,
        metricType: 'energy_export_kwh',
        measuredAt: { lt: measuredAt },
      },
      orderBy: { measuredAt: 'desc' },
      select: { cumulativeValue: true, measuredAt: true },
    })

    let cumulativeAnomaly: { reason: string; ruleCode: string; severity: string } | null = null
    if (previousReading && previousReading.cumulativeValue !== null && previousReading.cumulativeValue !== undefined) {
      if (productionTotal < previousReading.cumulativeValue) {
        cumulativeAnomaly = {
          reason: `القيمة التراكمية (${productionTotal}) أقل من القراءة السابقة (${previousReading.cumulativeValue}) بتاريخ ${previousReading.measuredAt.toISOString()} — هذا غير ممكن فيزيائياً لعداد تراكمي إلا في حال استبدال العداد`,
          ruleCode: 'CUMULATIVE_DECREASED',
          severity: 'critical',
        }
      } else if (productionTotal === previousReading.cumulativeValue) {
        cumulativeAnomaly = {
          reason: `القيمة التراكمية (${productionTotal}) مطابقة تماماً للقراءة السابقة بتاريخ ${previousReading.measuredAt.toISOString()} — لا زيادة تُسجَّل، يُحتمل خلل بمصدر البيانات أو توقف الإنفيرتر`,
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
        metricType: 'energy_export_kwh',
        measuredAt,
        intervalStart: measuredAt,
        value: productionNow,
        unit: 'kWh',
        cumulativeValue: productionTotal,
        sourceEventId: `${serialNumber}:${measuredAt.toISOString()}`,
        qualityStatus: hashMatchStatus === 'mismatch' ? 'suspect' : cumulativeAnomaly ? 'suspect' : 'validated',
        validationStatus: hashMatchStatus === 'mismatch' ? 'invalid' : cumulativeAnomaly ? 'invalid' : 'valid',
        canonicalPayloadHash: checkHash,
        n8nProvidedHash: n8nHash,
        hashMatchStatus,
        hederaTransactionId,
        hederaConsensusAt: hederaConsensusAt || null,
        // Hash mismatch takes priority as the more severe/security-relevant issue when both occur
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
        actor: 'n8n-inverter-ingestion',
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
    console.error('Inverter ingestion error:', error)
    return NextResponse.json({ error: error.message || 'خطأ داخلي بالسيرفر' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/authorization'
import { computeCanonicalHash } from '@/lib/canonical-hash'

interface Params {
  params: Promise<{ id: string }>
}

// Hedera Mirror Node REST API — public, read-only, no credentials needed.
// https://docs.hedera.com/hedera/sdks-and-apis/rest-api
function mirrorNodeBaseUrl(network: string): string {
  return network === 'mainnet'
    ? 'https://mainnet-public.mirrornode.hedera.com'
    : 'https://testnet.mirrornode.hedera.com'
}

// GET /api/readings/[id]/verify-hedera
// This is the "auditor" workflow from the design: pull the reading as currently stored in
// the database, recompute its hash, then independently fetch what was ACTUALLY anchored on
// Hedera at the time (via the stored transactionId) and compare. A mismatch here proves the
// database row was altered after the fact — Hedera's copy cannot be changed.
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const auth = await requirePermission('reading:audit')
    if (!auth.authorized) return auth.response

    const { id } = await params

    const reading = await db.energyReading.findUnique({
      where: { id },
      include: { device: { select: { serialNumber: true } }, project: { select: { organizationId: true, hederaTopicId: true } } },
    })

    if (!reading) {
      return NextResponse.json({ error: 'القراءة غير موجودة' }, { status: 404 })
    }
    if (reading.project.organizationId !== auth.user.organizationId && auth.user.role !== 'platform_admin') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }
    if (!reading.hederaTransactionId) {
      return NextResponse.json(
        { error: 'هذه القراءة لم تُوثّق على Hedera بعد (لا يوجد رقم معاملة)' },
        { status: 400 },
      )
    }

    // Step 1: Recompute the hash from the data AS CURRENTLY STORED in the database.
    // If someone tampered with the row after ingestion, this will differ from the
    // originally-stored canonicalPayloadHash/n8nProvidedHash.
    const serialNumber = reading.device?.serialNumber
    if (!serialNumber) {
      return NextResponse.json({ error: 'لا يمكن تحديد الرقم التسلسلي لإعادة الحساب' }, { status: 400 })
    }

    const currentHash = computeCanonicalHash({
      serialNumber,
      productionNow: reading.value,
      productionTotal: reading.cumulativeValue ?? 0,
      timestamp: reading.measuredAt.toISOString(),
    })

    // Step 2: Fetch the ORIGINAL hash that was actually anchored on Hedera, independent of
    // whatever the database currently says. This is the tamper-proof reference point.
    const config = await db.integrationConfig.findUnique({ where: { name: 'hedera' } })
    const cfg = config?.config ? JSON.parse(config.config) : {}
    const network = cfg.network || 'testnet'

    const mirrorUrl = `${mirrorNodeBaseUrl(network)}/api/v1/transactions/${reading.hederaTransactionId}`

    let hederaOriginalMessage: string | null = null
    let hederaConsensusTimestamp: string | null = null
    let mirrorNodeError: string | null = null

    try {
      const res = await fetch(mirrorUrl)
      if (!res.ok) {
        mirrorNodeError = `Mirror Node returned ${res.status}`
      } else {
        const data = await res.json()
        const tx = data.transactions?.[0]
        hederaConsensusTimestamp = tx?.consensus_timestamp || null

        // For TopicMessageSubmitTransaction, the message content is fetched from the
        // topic messages endpoint, not the transaction endpoint directly.
        if (reading.project.hederaTopicId && hederaConsensusTimestamp) {
          const topicMsgUrl = `${mirrorNodeBaseUrl(network)}/api/v1/topics/${reading.project.hederaTopicId}/messages/${hederaConsensusTimestamp}`
          const msgRes = await fetch(topicMsgUrl)
          if (msgRes.ok) {
            const msgData = await msgRes.json()
            hederaOriginalMessage = msgData.message
              ? Buffer.from(msgData.message, 'base64').toString('utf8')
              : null
          }
        }
      }
    } catch (err: any) {
      mirrorNodeError = err?.message || 'فشل الاتصال بـ Hedera Mirror Node'
    }

    // The message n8n submitted to Hedera was the hash itself (Hash_08), so the "original hash"
    // is the decoded topic message content — compare it directly against currentHash.
    const hederaHash = hederaOriginalMessage?.trim() || null
    const tamperDetected = hederaHash !== null && hederaHash !== currentHash

    return NextResponse.json({
      readingId: reading.id,
      serialNumber,
      storedAtIngestion: {
        n8nHash: reading.n8nProvidedHash,
        checkHashAtIngestion: reading.canonicalPayloadHash,
        hashMatchAtIngestion: reading.hashMatchStatus,
      },
      currentDatabaseState: {
        productionNow: reading.value,
        productionTotal: reading.cumulativeValue,
        timestamp: reading.measuredAt.toISOString(),
        recomputedHash: currentHash,
      },
      hederaMirrorNode: {
        transactionId: reading.hederaTransactionId,
        consensusTimestamp: hederaConsensusTimestamp || reading.hederaConsensusAt,
        originalHash: hederaHash,
        error: mirrorNodeError,
      },
      verification: {
        tamperDetected,
        status: mirrorNodeError
          ? 'unable_to_verify'
          : tamperDetected
          ? 'TAMPERED — البيانات بقاعدة البيانات لا تطابق ما تم توثيقه على Hedera'
          : 'VERIFIED — البيانات مطابقة تماماً لما تم توثيقه على Hedera',
      },
    })
  } catch (error: any) {
    console.error('Hedera verification error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

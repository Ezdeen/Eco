import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectAccess, requirePermission } from '@/lib/authorization'
import { hashPayload } from '@/lib/impact-attestation'

// GET /api/attestations/batch/[id]
// يعرض "شهادة الإثبات" كاملة: نتيجة بوابة المراقبة، كل المدخلات مصنَّفة (مقاس/تقديري)،
// الصيغة الحسابية، الهاش، وحالة التوثيق على Hedera. كما يعيد حساب الهاش من الـ
// payloadSummary المخزَّن ويقارنه بـ batchHash المخزَّن — تحقق ذاتي إضافي (لو كانت
// القيمتان غير متطابقتين، هذا يعني تلاعبًا أو تلفًا في قاعدة البيانات نفسها).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission('attestation:submit')
    if (!auth.authorized) return auth.response
    const { user } = auth
    const { id } = await params

    const batch = await db.attestationBatch.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true, nameAr: true, code: true, organizationId: true } },
        impactUnits: { select: { id: true, status: true, amount: true, createdAt: true, retiredAt: true } },
      },
    })

    if (!batch) {
      return NextResponse.json({ error: 'ملف الإثبات غير موجود' }, { status: 404 })
    }
    if (batch.project.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'لا يمكنك الوصول لهذا المورد' }, { status: 403 })
    }
    const access = await requireProjectAccess(batch.projectId, 'attestation:submit')
    if (!access.authorized) return access.response

    let recomputedHash: string | null = null
    let hashIntegrityOk: boolean | null = null
    if (batch.payloadSummary) {
      recomputedHash = hashPayload(batch.payloadSummary)
      hashIntegrityOk = recomputedHash === batch.batchHash
    }

    return NextResponse.json({
      id: batch.id,
      project: batch.project,
      status: batch.status,
      batchHash: batch.batchHash,
      recomputedHash,
      hashIntegrityOk,
      itemCount: batch.itemCount,
      periodStart: batch.periodStart,
      periodEnd: batch.periodEnd,
      kgCO2eClaimed: batch.kgCO2eClaimed,
      payload: batch.payloadSummary ? JSON.parse(batch.payloadSummary) : null,
      eligibility: {
        status: batch.eligibilityStatus,
        normalPct: batch.eligibilityNormalPct,
        comparedReadingCount: batch.eligibilityReadingCount,
        distribution: batch.eligibilityDetails ? JSON.parse(batch.eligibilityDetails) : null,
      },
      hedera: {
        transactionId: batch.hederaTransactionId,
        consensusTimestamp: batch.consensusTimestamp,
        mirrorNodeUrl: batch.hederaTransactionId
          ? `https://hashscan.io/mainnet/transaction/${batch.hederaTransactionId}`
          : null,
      },
      impactUnits: batch.impactUnits,
      createdAt: batch.createdAt,
      submittedAt: batch.submittedAt,
      confirmedAt: batch.confirmedAt,
    })
  } catch (error) {
    console.error('Attestation batch detail GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

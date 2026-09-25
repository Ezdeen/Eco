import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectAccess, requirePermission } from '@/lib/authorization'
import { checkPeriodEligibility } from '@/lib/space-comparison'
import { createAttestationBatch, AttestationIneligibleError } from '@/lib/impact-attestation'

// GET /api/attestations/batch?projectId=...
// يعرض قائمة ملفات إثبات الكربون (AttestationBatch) لمشروع معيّن، أو لكل مشاريع
// المؤسسة إن لم يُحدَّد مشروع.
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('attestation:submit')
    if (!auth.authorized) return auth.response
    const { user } = auth

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId') || undefined

    if (projectId) {
      const access = await requireProjectAccess(projectId, 'attestation:submit')
      if (!access.authorized) return access.response
    }

    const batches = await db.attestationBatch.findMany({
      where: {
        ...(projectId ? { projectId } : {}),
        project: { organizationId: user.organizationId! },
      },
      select: {
        id: true,
        projectId: true,
        batchHash: true,
        status: true,
        itemCount: true,
        periodStart: true,
        periodEnd: true,
        kgCO2eClaimed: true,
        eligibilityStatus: true,
        eligibilityNormalPct: true,
        hederaTransactionId: true,
        consensusTimestamp: true,
        createdAt: true,
        submittedAt: true,
        confirmedAt: true,
        project: { select: { name: true, nameAr: true, code: true } },
        impactUnits: { select: { id: true, status: true, amount: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    return NextResponse.json({ batches })
  } catch (error) {
    console.error('Attestation batch GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/attestations/batch
// body: { projectId, periodStart, periodEnd, dryRun? }
//
// ينفّذ المسار الكامل: بوابة الأهلية (مقارنة أرضية-فضائية) → الحساب الكمي → تجميد
// payload → هاش → AttestationBatch + OutboxEvent لتوثيقه على Hedera.
// dryRun=true: يُرجع نتيجة فحص الأهلية والحساب دون إنشاء أي سجل — لمعاينة الأرقام
// قبل الإصدار الفعلي.
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('attestation:submit')
    if (!auth.authorized) return auth.response
    const { user } = auth

    const body = await request.json()
    const { projectId, periodStart, periodEnd, dryRun } = body as {
      projectId?: string
      periodStart?: string
      periodEnd?: string
      dryRun?: boolean
    }

    if (!projectId || !periodStart || !periodEnd) {
      return NextResponse.json(
        { error: 'projectId و periodStart و periodEnd مطلوبة' },
        { status: 400 },
      )
    }

    const access = await requireProjectAccess(projectId, 'attestation:submit')
    if (!access.authorized) return access.response

    const start = new Date(periodStart)
    const end = new Date(periodEnd)
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
      return NextResponse.json({ error: 'فترة زمنية غير صالحة' }, { status: 400 })
    }

    if (dryRun) {
      const eligibility = await checkPeriodEligibility(projectId, start, end)
      return NextResponse.json({ dryRun: true, eligibility })
    }

    try {
      const result = await createAttestationBatch(projectId, start, end, user.userId)
      return NextResponse.json(result, { status: 201 })
    } catch (err) {
      if (err instanceof AttestationIneligibleError) {
        // 422: الطلب مفهوم وسليم شكليًا، لكن الفترة غير مؤهلة موضوعيًا — نُرجع تفاصيل
        // الأهلية كاملة حتى تعرف الواجهة سبب الرفض بالضبط (وتعرضه للمستخدم).
        return NextResponse.json(
          { error: err.message, eligibility: err.eligibility },
          { status: 422 },
        )
      }
      throw err
    }
  } catch (error) {
    console.error('Attestation batch POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

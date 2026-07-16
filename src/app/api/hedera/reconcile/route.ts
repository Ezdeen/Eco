import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/authorization'
import { runReconciliation } from '@/lib/hedera'
import { db } from '@/lib/db'

// GET /api/hedera/reconcile - List reconciliation runs
export async function GET() {
  try {
    const auth = await requirePermission('attestation:submit')
    if (!auth.authorized) return auth.response

    const runs = await db.reconciliationRun.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ runs })
  } catch (error) {
    console.error('Reconcile GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/hedera/reconcile - Run reconciliation
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('attestation:submit')
    if (!auth.authorized) return auth.response

    const body = await request.json().catch(() => ({}))
    const { projectId, batchId } = body

    const result = await runReconciliation(projectId, batchId)

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('Reconcile POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

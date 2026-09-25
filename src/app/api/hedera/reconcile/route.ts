import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, projectScopeFilter } from '@/lib/authorization'
import { runReconciliation } from '@/lib/hedera'
import { db } from '@/lib/db'

// GET /api/hedera/reconcile - List reconciliation runs
export async function GET() {
  try {
    const auth = await requirePermission('attestation:submit')
    if (!auth.authorized) return auth.response
    const { user } = auth

    // IMPORTANT FIX: previously unscoped, returning ReconciliationRun rows for
    // every project across every organization. ReconciliationRun.projectId is
    // optional (some runs may be org-wide rather than tied to one project), so
    // we include both: runs for this user's own projects, and runs with no
    // project at all are excluded here since we cannot attribute them to this
    // organization without a schema linkage - if org-wide reconciliation runs
    // are needed, ReconciliationRun should gain an organizationId column.
    const scopedProjectIds = (
      await db.project.findMany({
        where: { organizationId: user.organizationId!, ...projectScopeFilter(user) },
        select: { id: true },
      })
    ).map((p) => p.id)

    const runs = await db.reconciliationRun.findMany({
      where: { projectId: { in: scopedProjectIds } },
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

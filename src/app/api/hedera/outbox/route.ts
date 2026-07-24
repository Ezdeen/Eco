import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/authorization'
import { processPendingOutboxEvents } from '@/lib/hedera'
import { db } from '@/lib/db'

// GET /api/hedera/outbox - List outbox events
//
// NOTE (scoping): OutboxEvent has no organizationId/projectId column in the
// schema (it's a low-level Hedera submission queue, not directly tied to a
// tenant), so the events/stats below are inherently platform-wide and cannot
// be scoped to "this organization" without a schema migration to add that
// linkage. Until such a migration exists, this endpoint should only be
// reachable by platform-level operators, not exposed to regular
// organization users as if it were their own data - `requirePermission`
// below currently only checks `attestation:submit`, which any org's user
// with that permission holds, so this should be tightened to an
// admin-only permission before use outside of internal operations tooling.
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('attestation:submit')
    if (!auth.authorized) return auth.response

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    const events = await db.outboxEvent.findMany({
      where: status ? { status } : undefined,
      take: 50,
      orderBy: { createdAt: 'desc' },
    })

    const stats = {
      total: await db.outboxEvent.count(),
      pending: await db.outboxEvent.count({ where: { status: 'pending' } }),
      confirmed: await db.outboxEvent.count({ where: { status: 'confirmed' } }),
      failed: await db.outboxEvent.count({ where: { status: 'failed' } }),
      processing: await db.outboxEvent.count({ where: { status: 'processing' } }),
    }

    return NextResponse.json({ events, stats })
  } catch (error) {
    console.error('Outbox GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/hedera/outbox?action=process - Process pending events
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('attestation:submit')
    if (!auth.authorized) return auth.response

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    if (action === 'process') {
      const result = await processPendingOutboxEvents()
      return NextResponse.json({ success: true, ...result })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Outbox POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

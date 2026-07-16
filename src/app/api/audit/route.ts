import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/authorization'

export async function GET() {
  try {
    const auth = await requirePermission('audit:read')
    if (!auth.authorized) return auth.response

    const events = await db.auditEvent.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { email: true, name: true, nameAr: true } },
        organization: { select: { name: true, nameAr: true, code: true } },
        project: { select: { name: true, nameAr: true, code: true } },
      },
    })

    const stats = {
      total: await db.auditEvent.count(),
      today: await db.auditEvent.count({
        where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      }),
      successful: await db.auditEvent.count({ where: { result: 'success' } }),
      failed: await db.auditEvent.count({ where: { result: 'failure' } }),
    }

    return NextResponse.json({ events, stats })
  } catch (error) {
    console.error('Audit API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

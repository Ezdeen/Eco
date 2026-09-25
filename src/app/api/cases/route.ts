import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/authorization'

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('project:read')
    if (!auth.authorized) return auth.response

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const status = searchParams.get('status')

    const where: any = {}
    if (projectId) where.projectId = projectId
    if (status) where.status = status

    const cases = await db.case.findMany({
      where,
      include: { project: { select: { name: true, nameAr: true, code: true } } },
      orderBy: { createdAt: 'desc' },
    })

    const stats = {
      total: cases.length,
      open: cases.filter((c) => c.status === 'open').length,
      inProgress: cases.filter((c) => c.status === 'in_progress').length,
      resolved: cases.filter((c) => c.status === 'resolved').length,
      critical: cases.filter((c) => c.priority === 'critical' && c.status !== 'closed').length,
      high: cases.filter((c) => c.priority === 'high' && c.status !== 'closed').length,
    }

    return NextResponse.json({ cases, stats })
  } catch (error) {
    console.error('Cases API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

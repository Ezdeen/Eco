import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/authorization'

// Notifications are personal (tied to a user) and/or project-scoped. A user must only ever
// see: (a) notifications addressed to them directly, or (b) notifications tied to a project
// in their own organization — never another organization's data, and never another user's
// personal notifications. This mirrors the org/project scoping used by /api/projects.
function buildVisibilityWhere(user: { userId: string; organizationId?: string }) {
  const orConditions: any[] = [{ userId: user.userId }]

  if (user.organizationId) {
    orConditions.push({
      project: { organizationId: user.organizationId },
    })
  }

  return { OR: orConditions }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth.authorized) return auth.response
    const { user } = auth

    const { searchParams } = new URL(request.url)
    const unreadOnly = searchParams.get('unreadOnly') === 'true'
    const limitParam = parseInt(searchParams.get('limit') || '50')
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50

    const where: any = { AND: [buildVisibilityWhere(user)] }
    if (unreadOnly) where.AND.push({ isRead: false })

    const notifications = await db.notification.findMany({
      where,
      include: {
        project: { select: { name: true, nameAr: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    // Stats should reflect the user's full visible set, not just the (possibly limited/
    // unreadOnly-filtered) page just fetched above — otherwise counts would be wrong
    // whenever unreadOnly=true or the list is truncated by `limit`.
    const allVisible = await db.notification.findMany({
      where: buildVisibilityWhere(user),
      select: { isRead: true, severity: true },
    })

    const stats = {
      total: allVisible.length,
      unread: allVisible.filter((n) => !n.isRead).length,
      bySeverity: {
        error: allVisible.filter((n) => n.severity === 'error').length,
        warning: allVisible.filter((n) => n.severity === 'warning').length,
        success: allVisible.filter((n) => n.severity === 'success').length,
        info: allVisible.filter((n) => n.severity === 'info').length,
      },
    }

    return NextResponse.json({ notifications, stats })
  } catch (error) {
    console.error('Notifications API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth.authorized) return auth.response
    const { user } = auth

    const body = await request.json()
    const { id, ids, isRead } = body

    if (typeof isRead !== 'boolean') {
      return NextResponse.json({ error: 'قيمة isRead غير صالحة' }, { status: 400 })
    }

    const targetIds: string[] = Array.isArray(ids) ? ids : id ? [id] : []
    if (targetIds.length === 0) {
      return NextResponse.json({ error: 'لم يتم تحديد أي إشعار' }, { status: 400 })
    }

    // Ownership check: only update notifications the user is actually allowed to see.
    // updateMany silently skips rows outside `where`, so this also prevents a user from
    // marking another organization's (or another user's) notification as read/unread
    // just by guessing its id.
    const result = await db.notification.updateMany({
      where: {
        id: { in: targetIds },
        ...buildVisibilityWhere(user),
      },
      data: { isRead },
    })

    if (result.count === 0) {
      return NextResponse.json(
        { error: 'لم يتم العثور على إشعارات يمكنك تعديلها' },
        { status: 404 },
      )
    }

    return NextResponse.json({ updated: result.count })
  } catch (error) {
    console.error('Update notification error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

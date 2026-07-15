import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const unreadOnly = searchParams.get('unreadOnly') === 'true'
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: any = {}
    if (unreadOnly) where.isRead = false

    const notifications = await db.notification.findMany({
      where,
      include: {
        project: { select: { name: true, nameAr: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    const stats = {
      total: notifications.length,
      unread: notifications.filter((n) => !n.isRead).length,
      bySeverity: {
        error: notifications.filter((n) => n.severity === 'error').length,
        warning: notifications.filter((n) => n.severity === 'warning').length,
        success: notifications.filter((n) => n.severity === 'success').length,
        info: notifications.filter((n) => n.severity === 'info').length,
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
    const body = await request.json()
    const { id, isRead } = body

    const notification = await db.notification.update({
      where: { id },
      data: { isRead },
    })

    return NextResponse.json(notification)
  } catch (error) {
    console.error('Update notification error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

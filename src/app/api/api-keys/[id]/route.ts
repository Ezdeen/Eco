import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/authorization'

interface Params {
  params: Promise<{ id: string }>
}

// DELETE /api/api-keys/[id] — Revoke a key immediately (does not delete the row, for audit history)
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requirePermission('settings:manage')
    if (!auth.authorized) return auth.response

    const { id } = await params

    const key = await db.apiKey.findUnique({ where: { id } })
    if (!key || key.organizationId !== auth.user.organizationId) {
      return NextResponse.json({ error: 'المفتاح غير موجود' }, { status: 404 })
    }

    await db.apiKey.update({
      where: { id },
      data: { isActive: false, revokedAt: new Date() },
    })

    await db.auditEvent.create({
      data: {
        organizationId: auth.user.organizationId,
        userId: auth.user.userId,
        actor: auth.user.email,
        action: 'apikey.revoke',
        resource: 'api_key',
        resourceId: id,
        result: 'success',
      },
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('ApiKey revoke error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

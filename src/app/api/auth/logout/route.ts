import { NextResponse } from 'next/server'
import { clearSessionCookie, getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function POST() {
  try {
    const user = await getCurrentUser()

    if (user) {
      // Log logout
      try {
        await db.auditEvent.create({
          data: {
            userId: user.userId,
            organizationId: user.organizationId,
            actor: user.email,
            action: 'auth.logout',
            resource: 'user',
            resourceId: user.userId,
            result: 'success',
          },
        })
      } catch {
        // ignore audit errors
      }
    }

    await clearSessionCookie()

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}

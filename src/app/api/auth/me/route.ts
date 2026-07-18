import { NextResponse } from 'next/server'
import { getSessionToken, verifyToken } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/auth/me - يتحقق من الجلسة الحالية عبر الكوكي فعلياً
export async function GET() {
  try {
    const token = await getSessionToken()
    if (!token) {
      return NextResponse.json({ user: null }, { status: 401 })
    }

    const session = await verifyToken(token)
    if (!session) {
      return NextResponse.json({ user: null }, { status: 401 })
    }

    // جلب أحدث بيانات المستخدم من قاعدة البيانات (مو من التوكن فقط)
    const user = await db.user.findUnique({
      where: { id: session.userId },
      include: {
        memberships: {
          where: { status: 'active' },
          include: { organization: true },
          take: 1,
        },
      },
    })

    if (!user) {
      return NextResponse.json({ user: null }, { status: 401 })
    }

    const membership = user.memberships[0]

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        nameAr: user.nameAr,
        role: membership?.role || user.role,
        preferredLang: user.preferredLang,
        preferredTz: user.preferredTz,
        mfaEnabled: user.mfaEnabled,
        membership: membership
          ? {
              id: membership.id,
              role: membership.role,
              organization: {
                id: membership.organization.id,
                name: membership.organization.name,
                nameAr: membership.organization.nameAr,
                code: membership.organization.code,
                currency: membership.organization.currency,
                timezone: membership.organization.timezone,
                language: membership.organization.language,
              },
            }
          : null,
      },
    })
  } catch (error) {
    console.error('Me route error:', error)
    return NextResponse.json({ user: null }, { status: 401 })
  }
}

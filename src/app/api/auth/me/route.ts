import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const session = await getCurrentUser()

    if (!session) {
      return NextResponse.json({ user: null }, { status: 200 })
    }

    // Fetch fresh user data from DB
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        email: true,
        name: true,
        nameAr: true,
        role: true,
        preferredLang: true,
        preferredTz: true,
        mfaEnabled: true,
      },
    })

    if (!user) {
      return NextResponse.json({ user: null }, { status: 200 })
    }

    // Get organization membership
    const membership = await db.userMembership.findFirst({
      where: { userId: user.id, status: 'active' },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            nameAr: true,
            code: true,
            currency: true,
            timezone: true,
            language: true,
          },
        },
      },
    })

    return NextResponse.json({
      user: {
        ...user,
        membership: membership
          ? {
              id: membership.id,
              role: membership.role,
              organization: membership.organization,
            }
          : null,
      },
    })
  } catch (error) {
    console.error('Get current user error:', error)
    return NextResponse.json({ user: null }, { status: 200 })
  }
}

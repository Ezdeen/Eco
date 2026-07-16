import { NextRequest, NextResponse } from 'next/server'
import { hashPassword, createToken, setSessionCookie } from '@/lib/auth'
import { db } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password, name, nameAr } = body

    // Validate
    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'البريد الإلكتروني وكلمة المرور والاسم مطلوبة' },
        { status: 400 },
      )
    }

    if (typeof email !== 'string' || typeof password !== 'string') {
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' },
        { status: 400 },
      )
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'صيغة البريد الإلكتروني غير صحيحة' },
        { status: 400 },
      )
    }

    // Check if user already exists
    const existing = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'هذا البريد الإلكتروني مسجّل بالفعل' },
        { status: 409 },
      )
    }

    // Hash password
    const passwordHash = await hashPassword(password)

    // Create user (viewer role by default)
    const user = await db.user.create({
      data: {
        email: email.toLowerCase().trim(),
        name,
        nameAr: nameAr || name,
        passwordHash,
        role: 'viewer',
        preferredLang: 'ar',
        preferredTz: 'Asia/Riyadh',
      },
    })

    // Try to attach to the default organization if it exists
    const defaultOrg = await db.organization.findFirst()
    let membership: { id: string; userId: string; organizationId: string; role: string; status: string } | null = null
    if (defaultOrg) {
      membership = await db.userMembership.create({
        data: {
          userId: user.id,
          organizationId: defaultOrg.id,
          role: 'viewer',
          status: 'active',
        },
      })
    }

    // Create session
    const session = {
      userId: user.id,
      email: user.email,
      name: user.nameAr || user.name || user.email,
      role: membership?.role || user.role,
      organizationId: membership?.organizationId,
      membershipId: membership?.id,
    }

    const token = await createToken(session)
    await setSessionCookie(token)

    // Log registration
    try {
      await db.auditEvent.create({
        data: {
          userId: user.id,
          organizationId: membership?.organizationId,
          actor: user.email,
          action: 'auth.register',
          resource: 'user',
          resourceId: user.id,
          result: 'success',
          ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
        },
      })
    } catch {
      // ignore
    }

    return NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.nameAr || user.name,
          role: user.role,
          organizationId: membership?.organizationId,
        },
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('Register error:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء إنشاء الحساب' }, { status: 500 })
  }
}

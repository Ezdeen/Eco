import { NextRequest, NextResponse } from 'next/server'
import { hashPassword, createToken, setSessionCookie } from '@/lib/auth'
import { db } from '@/lib/db'
import { registerSchema } from '@/lib/validation'
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware-utils'

export async function POST(request: NextRequest) {
  try {
    // Rate limiting: 3 registrations per hour per IP
    const rateCheck = checkRateLimit(request, RATE_LIMITS.register, 'register')
    if (!rateCheck.allowed && rateCheck.response) {
      return new NextResponse(rateCheck.response.body, {
        status: rateCheck.response.status,
        headers: rateCheck.response.headers,
      })
    }

    const body = await request.json()

    // Validate body with Zod
    const parsed = registerSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'بيانات غير صالحة', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const { email, password, name, nameAr } = parsed.data

    // === Invite-only mode: require inviteToken in production ===
    // In development, allow open registration for testing
    // In production, require a valid invite token from an org_admin
    const inviteToken = (body as any).inviteToken as string | undefined
    const isProduction = process.env.NODE_ENV === 'production'
    const allowOpenSignup = process.env.ALLOW_OPEN_SIGNUP === 'true'

    if (isProduction && !allowOpenSignup) {
      if (!inviteToken) {
        return NextResponse.json(
          { error: 'التسجيل يتطلب دعوة من مدير مؤسسة. يرجى التواصل مع المسؤول للحصول على رمز دعوة.' },
          { status: 403 },
        )
      }

      // Verify invite token (stored as a membership with status='invited')
      const invite = await db.userMembership.findFirst({
        where: {
          status: 'invited',
          // The invite token is the membership ID itself (cuid)
          id: inviteToken,
        },
        include: {
          user: { select: { email: true } },
        },
      })

      if (!invite) {
        return NextResponse.json(
          { error: 'رمز الدعوة غير صالح أو منتهي الصلاحية' },
          { status: 403 },
        )
      }

      // Check if the invited email matches
      if (invite.user.email !== email.toLowerCase().trim()) {
        return NextResponse.json(
          { error: 'البريد الإلكتروني لا يتطابق مع الدعوة' },
          { status: 403 },
        )
      }
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

    // Create user (data_entry role by default — least-privilege default)
    const user = await db.user.create({
      data: {
        email: email.toLowerCase().trim(),
        name,
        nameAr: nameAr || name,
        passwordHash,
        role: 'data_entry',
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
          role: 'data_entry',
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

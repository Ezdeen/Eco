import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, createToken, setSessionCookie } from '@/lib/auth'
import { db } from '@/lib/db'
import { loginSchema } from '@/lib/validation'
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware-utils'

export async function POST(request: NextRequest) {
  try {
    // Rate limiting: 5 login attempts per 15 minutes per IP
    const rateCheck = checkRateLimit(request, RATE_LIMITS.login, 'login')
    if (!rateCheck.allowed && rateCheck.response) {
      return new NextResponse(rateCheck.response.body, {
        status: rateCheck.response.status,
        headers: rateCheck.response.headers,
      })
    }

    const body = await request.json()

    // Validate body with Zod
    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'بيانات غير صالحة', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const { email, password } = parsed.data

    // Authenticate
    const session = await authenticateUser(email, password)

    if (!session) {
      // Log failed attempt
      try {
        const user = await db.user.findUnique({
          where: { email: email.toLowerCase().trim() },
        })
        if (user) {
          await db.auditEvent.create({
            data: {
              userId: user.id,
              actor: email,
              action: 'auth.login.failed',
              resource: 'user',
              resourceId: user.id,
              result: 'failure',
              ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
              userAgent: request.headers.get('user-agent') || 'unknown',
              metadata: JSON.stringify({ reason: 'invalid_password' }),
            },
          })
        }
      } catch {
        // ignore audit errors
      }

      return NextResponse.json(
        { error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' },
        { status: 401 },
      )
    }

    // Create JWT token
    const token = await createToken(session)
    await setSessionCookie(token)

    // Log successful login
    try {
      await db.auditEvent.create({
        data: {
          userId: session.userId,
          organizationId: session.organizationId,
          actor: session.email,
          action: 'auth.login.success',
          resource: 'user',
          resourceId: session.userId,
          result: 'success',
          ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
        },
      })
    } catch {
      // ignore audit errors
    }

    return NextResponse.json({
      success: true,
      user: {
        id: session.userId,
        email: session.email,
        name: session.name,
        role: session.role,
        organizationId: session.organizationId,
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء تسجيل الدخول' }, { status: 500 })
  }
}

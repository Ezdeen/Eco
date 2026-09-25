import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser, createToken, setSessionCookie } from '@/lib/auth'
import { db } from '@/lib/db'
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware-utils'

// POST /api/auth/login - تسجيل دخول حقيقي بالتحقق من قاعدة البيانات
export async function POST(request: NextRequest) {
  try {
    // Rate limiting: منع محاولات القوة الغاشمة (brute-force)
    const rateCheck = checkRateLimit(request, RATE_LIMITS.login, 'login')
    if (!rateCheck.allowed && rateCheck.response) {
      return new NextResponse(rateCheck.response.body, {
        status: rateCheck.response.status,
        headers: rateCheck.response.headers,
      })
    }

    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json(
        { error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' },
        { status: 400 },
      )
    }

    const session = await authenticateUser(email, password)

    if (!session) {
      // تسجيل محاولة فاشلة بدون كشف سبب الفشل (أمان)
      return NextResponse.json(
        { error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' },
        { status: 401 },
      )
    }

    const token = await createToken(session)
    await setSessionCookie(token)

    // تسجيل الدخول الناجح بسجل التدقيق
    try {
      await db.auditEvent.create({
        data: {
          userId: session.userId,
          organizationId: session.organizationId,
          actor: session.email,
          action: 'auth.login',
          resource: 'user',
          resourceId: session.userId,
          result: 'success',
          ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
        },
      })
    } catch {
      // تجاهل أخطاء سجل التدقيق حتى لا تمنع تسجيل الدخول
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

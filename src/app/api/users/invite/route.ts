import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/authorization'
import { z } from 'zod'

// POST /api/users/invite — Invite a user to the organization (org_admin only)
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('user:manage')
    if (!auth.authorized) return auth.response

    const { user } = auth
    const body = await request.json()

    const schema = z.object({
      email: z.string().email('بريد إلكتروني غير صالح'),
      name: z.string().min(1, 'الاسم مطلوب'),
      nameAr: z.string().optional(),
      role: z.enum(['org_admin', 'esg_manager', 'project_manager', 'operator', 'auditor', 'technician', 'viewer']).default('viewer'),
    })

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'بيانات غير صالحة', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const { email, name, nameAr, role } = parsed.data

    // Check if user already exists
    const existingUser = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    })

    if (existingUser) {
      // Check if already a member
      const existingMembership = await db.userMembership.findUnique({
        where: {
          userId_organizationId: {
            userId: existingUser.id,
            organizationId: user.organizationId!,
          },
        },
      })

      if (existingMembership) {
        return NextResponse.json(
          { error: 'هذا المستخدم عضو بالفعل في المؤسسة' },
          { status: 409 },
        )
      }

      // Create membership with 'invited' status
      const membership = await db.userMembership.create({
        data: {
          userId: existingUser.id,
          organizationId: user.organizationId!,
          role,
          status: 'invited',
        },
      })

      // Audit log
      await db.auditEvent.create({
        data: {
          organizationId: user.organizationId,
          userId: user.userId,
          actor: user.email,
          action: 'user.invite',
          resource: 'user',
          resourceId: existingUser.id,
          result: 'success',
          metadata: JSON.stringify({ email, role, inviteToken: membership.id }),
        },
      })

      return NextResponse.json({
        success: true,
        inviteToken: membership.id,
        message: `تمت دعوة ${email} بنجاح. شارك رمز الدعوة مع المستخدم للتسجيل.`,
      }, { status: 201 })
    }

    // User doesn't exist — create a placeholder user with 'invited' membership
    const newUser = await db.user.create({
      data: {
        email: email.toLowerCase().trim(),
        name,
        nameAr: nameAr || name,
        // No passwordHash — user will set it during registration
        role,
        preferredLang: 'ar',
        preferredTz: 'Asia/Riyadh',
      },
    })

    const membership = await db.userMembership.create({
      data: {
        userId: newUser.id,
        organizationId: user.organizationId!,
        role,
        status: 'invited',
      },
    })

    // Audit log
    await db.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        userId: user.userId,
        actor: user.email,
        action: 'user.invite_new',
        resource: 'user',
        resourceId: newUser.id,
        result: 'success',
        metadata: JSON.stringify({ email, role, inviteToken: membership.id }),
      },
    })

    return NextResponse.json({
      success: true,
      inviteToken: membership.id,
      message: `تمت دعوة ${email} بنجاح. شارك رمز الدعوة مع المستخدم للتسجيل.`,
    }, { status: 201 })
  } catch (error) {
    console.error('Invite user error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

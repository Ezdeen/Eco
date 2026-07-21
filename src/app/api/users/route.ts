import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/authorization'
import { hashPassword } from '@/lib/auth'

// GET /api/users - List all users in the organization
export async function GET() {
  try {
    const auth = await requirePermission('user:manage')
    if (!auth.authorized) return auth.response

    const { user } = auth

    const memberships = await db.userMembership.findMany({
      where: { organizationId: user.organizationId! },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            nameAr: true,
            role: true,
            mfaEnabled: true,
            preferredLang: true,
            preferredTz: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      users: memberships.map((m) => ({
        id: m.user.id,
        email: m.user.email,
        name: m.user.name,
        nameAr: m.user.nameAr,
        globalRole: m.user.role,
        membershipId: m.id,
        role: m.role,
        status: m.status,
        mfaEnabled: m.user.mfaEnabled,
        preferredLang: m.user.preferredLang,
        preferredTz: m.user.preferredTz,
        joinedAt: m.createdAt,
      })),
      total: memberships.length,
    })
  } catch (error) {
    console.error('Users API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/users - Add a new member to the organization
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('user:manage')
    if (!auth.authorized) return auth.response

    const { user } = auth
    const body = await request.json()
    const { email, name, nameAr, password, role } = body

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'البريد الإلكتروني والاسم وكلمة المرور مطلوبة' },
        { status: 400 },
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' },
        { status: 400 },
      )
    }

    // Valid roles for assignment
    const VALID_ROLES = ['org_admin', 'project_manager', 'data_entry']
    const assignedRole = VALID_ROLES.includes(role) ? role : 'data_entry'

    // Check if user already exists
    const existingUser = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    })

    if (existingUser) {
      // Check if already a member of this org
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

      // Add existing user to organization
      const membership = await db.userMembership.create({
        data: {
          userId: existingUser.id,
          organizationId: user.organizationId!,
          role: assignedRole,
          status: 'active',
        },
      })

      // Audit log
      await db.auditEvent.create({
        data: {
          organizationId: user.organizationId,
          userId: user.userId,
          actor: user.email,
          action: 'user.add_existing',
          resource: 'user',
          resourceId: existingUser.id,
          result: 'success',
          metadata: JSON.stringify({ email, role: assignedRole }),
        },
      })

      return NextResponse.json({
        success: true,
        user: {
          id: existingUser.id,
          email: existingUser.email,
          name: existingUser.name,
          nameAr: existingUser.nameAr,
          membershipId: membership.id,
          role: membership.role,
          status: membership.status,
        },
      }, { status: 201 })
    }

    // Create new user
    const passwordHash = await hashPassword(password)
    const newUser = await db.user.create({
      data: {
        email: email.toLowerCase().trim(),
        name,
        nameAr: nameAr || name,
        passwordHash,
        role: assignedRole,
        preferredLang: 'ar',
        preferredTz: 'Asia/Riyadh',
      },
    })

    const membership = await db.userMembership.create({
      data: {
        userId: newUser.id,
        organizationId: user.organizationId!,
        role: assignedRole,
        status: 'active',
      },
    })

    // Audit log
    await db.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        userId: user.userId,
        actor: user.email,
        action: 'user.create',
        resource: 'user',
        resourceId: newUser.id,
        result: 'success',
        metadata: JSON.stringify({ email, role: assignedRole }),
      },
    })

    return NextResponse.json({
      success: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        nameAr: newUser.nameAr,
        membershipId: membership.id,
        role: membership.role,
        status: membership.status,
      },
    }, { status: 201 })
  } catch (error) {
    console.error('Create user error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

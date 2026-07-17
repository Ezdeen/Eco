import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/authorization'

interface Params {
  params: Promise<{ id: string }>
}

// PATCH /api/users/[id] - Change role or status
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const auth = await requirePermission('user:manage')
    if (!auth.authorized) return auth.response

    const { user } = auth
    const { id } = await params
    const body = await request.json()
    const { role, status } = body

    // Find the membership within this organization
    const membership = await db.userMembership.findFirst({
      where: {
        userId: id,
        organizationId: user.organizationId!,
      },
    })

    if (!membership) {
      return NextResponse.json(
        { error: 'المستخدم غير موجود في هذه المؤسسة' },
        { status: 404 },
      )
    }

    // Prevent self-demotion (org admin can't remove their own admin role)
    if (id === user.userId && role && role !== 'org_admin') {
      return NextResponse.json(
        { error: 'لا يمكنك تغيير دورك الخاص من مدير المؤسسة' },
        { status: 400 },
      )
    }

    const updateData: any = {}
    if (role) {
      const VALID_ROLES = ['org_admin', 'esg_manager', 'project_manager', 'operator', 'auditor', 'technician', 'viewer']
      if (!VALID_ROLES.includes(role)) {
        return NextResponse.json(
          { error: 'دور غير صالح' },
          { status: 400 },
        )
      }
      updateData.role = role

      // Also update the user's global role
      await db.user.update({
        where: { id },
        data: { role },
      })
    }

    if (status) {
      const VALID_STATUSES = ['active', 'suspended', 'invited']
      if (!VALID_STATUSES.includes(status)) {
        return NextResponse.json(
          { error: 'حالة غير صالحة' },
          { status: 400 },
        )
      }
      updateData.status = status
    }

    const updated = await db.userMembership.update({
      where: { id: membership.id },
      data: updateData,
    })

    // Audit log
    await db.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        userId: user.userId,
        actor: user.email,
        action: 'user.update',
        resource: 'user',
        resourceId: id,
        result: 'success',
        metadata: JSON.stringify({ role, status, previousRole: membership.role }),
      },
    })

    return NextResponse.json({ success: true, membership: updated })
  } catch (error) {
    console.error('Update user error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/users/[id] - Remove user from organization
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requirePermission('user:manage')
    if (!auth.authorized) return auth.response

    const { user } = auth
    const { id } = await params

    // Prevent self-removal
    if (id === user.userId) {
      return NextResponse.json(
        { error: 'لا يمكنك إزالة نفسك من المؤسسة' },
        { status: 400 },
      )
    }

    const membership = await db.userMembership.findFirst({
      where: {
        userId: id,
        organizationId: user.organizationId!,
      },
    })

    if (!membership) {
      return NextResponse.json(
        { error: 'المستخدم غير موجود في هذه المؤسسة' },
        { status: 404 },
      )
    }

    await db.userMembership.delete({
      where: { id: membership.id },
    })

    // Audit log
    await db.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        userId: user.userId,
        actor: user.email,
        action: 'user.remove',
        resource: 'user',
        resourceId: id,
        result: 'success',
        metadata: JSON.stringify({ previousRole: membership.role }),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete user error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

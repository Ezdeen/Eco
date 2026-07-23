import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectAccess } from '@/lib/authorization'
import { z } from 'zod'

interface Params {
  params: Promise<{ id: string }>
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft:          ['under_review', 'approved', 'active'],
  under_review:   ['draft', 'approved', 'active'],
  approved:       ['active', 'draft'],
  active:         ['suspended', 'decommissioned'],
  suspended:      ['active', 'decommissioned'],
  decommissioned: [],
}

const statusUpdateSchema = z.object({
  status: z.enum(['draft', 'under_review', 'approved', 'active', 'suspended', 'decommissioned']),
  reason: z.string().trim().max(500).optional(),
})

/**
 * PATCH /api/projects/[id]/status
 * تغيير حالة المشروع مع فحص انتقال الحالة المسموح به.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const auth = await requireProjectAccess(id, 'project:update')
    if (!auth.authorized) return auth.response
    const { user } = auth

    const body = await request.json()
    const parsed = statusUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'بيانات الحالة غير صحيحة', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const { status: newStatus, reason } = parsed.data

    const existing = await db.project.findUnique({
      where: { id },
      select: { id: true, organizationId: true, code: true, name: true, status: true, commissionedAt: true },
    })

    if (!existing) return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })

    if (existing.status === newStatus) {
      return NextResponse.json({ success: true, message: 'المشروع في هذه الحالة مسبقًا', project: existing })
    }

    const allowed = ALLOWED_TRANSITIONS[existing.status] ?? []
    if (!allowed.includes(newStatus)) {
      return NextResponse.json(
        {
          error: `غير مسموح بالانتقال من "${existing.status}" إلى "${newStatus}" مباشرةً`,
          currentStatus: existing.status,
          requestedStatus: newStatus,
          allowedTransitions: allowed,
        },
        { status: 400 },
      )
    }

    const updateData: { status: string; commissionedAt?: Date } = { status: newStatus }
    if (newStatus === 'active' && !existing.commissionedAt) {
      updateData.commissionedAt = new Date()
    }

    const updated = await db.$transaction(async (tx) => {
      const project = await tx.project.update({ where: { id }, data: updateData })

      await tx.auditEvent.create({
        data: {
          organizationId: existing.organizationId,
          projectId: id,
          userId: user.userId,
          actor: user.email,
          action: 'project.status_change',
          resource: 'project',
          resourceId: id,
          result: 'success',
          metadata: JSON.stringify({
            code: existing.code,
            previousStatus: existing.status,
            newStatus,
            reason: reason || null,
          }),
        },
      })

      return project
    })

    return NextResponse.json({
      success: true,
      project: updated,
      message: `تم تغيير حالة المشروع إلى "${newStatus}"`,
    })
  } catch (error) {
    console.error('Status change error:', error)
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2025') {
      return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })
    }
    return NextResponse.json({ error: 'حدث خطأ أثناء تغيير حالة المشروع', details: String(error) }, { status: 500 })
  }
}

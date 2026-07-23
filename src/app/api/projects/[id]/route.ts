import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectAccess } from '@/lib/authorization'
import { updateProjectSchema } from '@/lib/validation'

interface Params {
  params: Promise<{ id: string }>
}

// GET single project with full details
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const auth = await requireProjectAccess(id, 'project:read')
    if (!auth.authorized) return auth.response

    const project = await db.project.findUnique({
      where: { id },
      include: {
        organization: { select: { name: true, nameAr: true, code: true } },
        sites: true,
        assets: { include: { solarProfile: true } },
        devices: true,
        _count: { select: { readings: true, cases: true, attestations: true, reports: true } },
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })
    }

    return NextResponse.json({ project })
  } catch (error) {
    console.error('Get project error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH - تحديث بيانات المشروع
 * يدعم تحديث كل الحقول القابلة للتعديل بما فيها status و commissionedAt.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const auth = await requireProjectAccess(id, 'project:update')
    if (!auth.authorized) return auth.response
    const { user } = auth

    const existing = await db.project.findUnique({
      where: { id },
      select: { id: true, organizationId: true, code: true, status: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })
    }

    const body = await request.json()
    const parsed = updateProjectSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'بيانات التحديث غير صحيحة', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const data = parsed.data

    if (data.code && data.code !== existing.code) {
      const duplicate = await db.project.findUnique({
        where: { organizationId_code: { organizationId: existing.organizationId, code: data.code } },
        select: { id: true },
      })
      if (duplicate && duplicate.id !== id) {
        return NextResponse.json({ error: 'رمز المشروع مستخدم مسبقًا', field: 'code' }, { status: 400 })
      }
    }

    if (data.managerId) {
      const managerMembership = await db.userMembership.findFirst({
        where: { userId: data.managerId, organizationId: existing.organizationId, status: 'active' },
        select: { id: true },
      })
      if (!managerMembership) {
        return NextResponse.json({ error: 'مدير المشروع غير موجود', field: 'managerId' }, { status: 400 })
      }
    }

    const updateData: Record<string, unknown> = {}
    const directFields: Array<keyof typeof data> = [
      'name', 'nameAr', 'code', 'projectType',
      'country', 'city', 'timezone', 'currency',
      'sponsorName', 'sponsorPhone', 'managerId',
      'inverterSerial', 'inverterType',
      'treeSpecies', 'treeCount', 'plantedAreaM2', 'plantingDate',
      'survivalRateTarget',
      'iotSensorType', 'iotSensorModel', 'iotSensorSerial',
      'iotGatewayId', 'iotProtocol', 'iotDataFrequency',
      'capacityKwp', 'tariffRetail', 'tariffFeedIn',
      'latitude', 'longitude',
      'status', 'commissionedAt',
    ]

    for (const field of directFields) {
      if (field in (body ?? {})) {
        const value = data[field]
        if (field === 'plantingDate' || field === 'commissionedAt') {
          updateData[field] = value ? new Date(value as string) : null
          continue
        }
        updateData[field] = value ?? null
      }
    }

    const VALID_STATUSES = ['draft', 'under_review', 'approved', 'active', 'suspended', 'decommissioned']
    if (typeof updateData.status === 'string' && !VALID_STATUSES.includes(updateData.status)) {
      return NextResponse.json({ error: `حالة غير صالحة: ${updateData.status}`, field: 'status' }, { status: 400 })
    }

    if (updateData.status === 'active' && existing.status !== 'active') {
      if (!updateData.commissionedAt) updateData.commissionedAt = new Date()
    }

    if (updateData.status === 'active' && updateData.commissionedAt === null) {
      return NextResponse.json({ error: 'لا يمكن تفعيل مشروع بدون تاريخ تشغيل', field: 'commissionedAt' }, { status: 400 })
    }

    const updated = await db.$transaction(async (tx) => {
      const project = await tx.project.update({ where: { id }, data: updateData })

      if (
        updateData.country !== undefined || updateData.city !== undefined ||
        updateData.latitude !== undefined || updateData.longitude !== undefined ||
        updateData.timezone !== undefined
      ) {
        await tx.site.updateMany({
          where: { projectId: id },
          data: {
            ...(updateData.country !== undefined ? { country: updateData.country as string | null } : {}),
            ...(updateData.city !== undefined ? { city: updateData.city as string | null } : {}),
            ...(updateData.latitude !== undefined ? { latitude: updateData.latitude as number | null } : {}),
            ...(updateData.longitude !== undefined ? { longitude: updateData.longitude as number | null } : {}),
            ...(updateData.timezone !== undefined ? { timezone: updateData.timezone as string | null } : {}),
          },
        })
      }

      const changedFields = Object.keys(updateData)
      await tx.auditEvent.create({
        data: {
          organizationId: existing.organizationId,
          projectId: id,
          userId: user.userId,
          actor: user.email,
          action: 'project.update',
          resource: 'project',
          resourceId: id,
          result: 'success',
          metadata: JSON.stringify({
            changedFields,
            ...(updateData.status ? { newStatus: updateData.status, previousStatus: existing.status } : {}),
          }),
        },
      })

      return project
    })

    return NextResponse.json({ success: true, project: updated })
  } catch (error) {
    console.error('Update project error:', error)
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2025') {
      return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })
    }
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2002') {
      return NextResponse.json({ error: 'قيمة مكررة', field: 'code' }, { status: 400 })
    }
    return NextResponse.json({ error: 'حدث خطأ أثناء تحديث المشروع', details: String(error) }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const auth = await requireProjectAccess(id, 'project:delete')
    if (!auth.authorized) return auth.response
    const { user } = auth

    const existing = await db.project.findUnique({
      where: { id },
      select: {
        id: true, organizationId: true, code: true,
        _count: { select: { attestations: true, impactUnits: true } },
      },
    })

    if (!existing) return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })

    if (existing._count.attestations > 0 || existing._count.impactUnits > 0) {
      return NextResponse.json(
        { error: 'لا يمكن حذف مشروع له توثيقات أو وحدات أثر. استخدم "تقاعد" بدلاً من الحذف.' },
        { status: 400 },
      )
    }

    await db.$transaction(async (tx) => {
      await tx.energyReading.deleteMany({ where: { projectId: id } })
      await tx.case.deleteMany({ where: { projectId: id } })
      await tx.report.deleteMany({ where: { projectId: id } })
      await tx.auditEvent.deleteMany({ where: { projectId: id } })
      await tx.notification.deleteMany({ where: { projectId: id } })
      await tx.ingestionBatch.deleteMany({ where: { projectId: id } })
      await tx.device.deleteMany({ where: { projectId: id } })
      await tx.asset.deleteMany({ where: { projectId: id } })
      await tx.site.deleteMany({ where: { projectId: id } })
      await tx.project.delete({ where: { id } })

      await tx.auditEvent.create({
        data: {
          organizationId: existing.organizationId,
          userId: user.userId,
          actor: user.email,
          action: 'project.delete',
          resource: 'project',
          resourceId: id,
          result: 'success',
          metadata: JSON.stringify({ code: existing.code }),
        },
      })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete project error:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء حذف المشروع', details: String(error) }, { status: 500 })
  }
}

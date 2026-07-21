import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectAccess } from '@/lib/authorization'

interface Params {
  params: Promise<{ id: string }>
}

// GET single project with full details
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    // Authorization: require project read access
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

// PATCH - update project
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    // Authorization: require project update access
    const auth = await requireProjectAccess(id, 'project:update')
    if (!auth.authorized) return auth.response
    const { user } = auth

    const body = await request.json()
    const {
      name,
      nameAr,
      code,
      country,
      city,
      latitude,
      longitude,
      capacityKwp,
      currency,
      sponsorName,
      sponsorPhone,
      managerId,
      inverterSerial,
      inverterType,
      status,
      projectType,
      timezone,
      tariffRetail,
      tariffFeedIn,
      // Afforestation
      treeSpecies,
      treeCount,
      plantedAreaM2,
      plantingDate,
      survivalRateTarget,
      // IoT
      iotSensorType,
      iotSensorModel,
      iotSensorSerial,
      iotGatewayId,
      iotProtocol,
      iotDataFrequency,
    } = body

    const existing = await db.project.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })
    }

    // Check code uniqueness if changed
    if (code && code !== existing.code) {
      const conflict = await db.project.findFirst({
        where: {
          organizationId: existing.organizationId,
          code,
          id: { not: id },
        },
      })
      if (conflict) {
        return NextResponse.json(
          { error: 'رمز المشروع مستخدم في مشروع آخر' },
          { status: 409 },
        )
      }
    }

    // Check inverter serial uniqueness if changed
    if (inverterSerial && inverterSerial !== existing.inverterSerial) {
      const conflict = await db.project.findFirst({
        where: { inverterSerial, id: { not: id } },
      })
      if (conflict) {
        return NextResponse.json(
          { error: 'سيريال نمبر الإنفرتر مستخدم في مشروع آخر' },
          { status: 409 },
        )
      }
    }

    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (nameAr !== undefined) updateData.nameAr = nameAr
    if (code !== undefined) updateData.code = code
    if (country !== undefined) updateData.country = country
    if (city !== undefined) updateData.city = city
    if (latitude !== undefined) updateData.latitude = parseFloat(latitude)
    if (longitude !== undefined) updateData.longitude = parseFloat(longitude)
    if (capacityKwp !== undefined) updateData.capacityKwp = capacityKwp ? parseFloat(capacityKwp) : null
    if (currency !== undefined) updateData.currency = currency
    if (sponsorName !== undefined) updateData.sponsorName = sponsorName || null
    if (sponsorPhone !== undefined) updateData.sponsorPhone = sponsorPhone || null
    if (managerId !== undefined) {
      if (managerId) {
        const managerMembership = await db.userMembership.findFirst({
          where: { userId: managerId, organizationId: user.organizationId!, role: 'project_manager', status: 'active' },
        })
        if (!managerMembership) {
          return NextResponse.json(
            { error: 'مدير المشروع المحدد غير صالح أو ليس له دور مدير مشروع فعّال في هذه المؤسسة' },
            { status: 400 },
          )
        }
      }
      updateData.managerId = managerId || null
    }
    if (inverterSerial !== undefined) updateData.inverterSerial = inverterSerial || null
    if (inverterType !== undefined) updateData.inverterType = inverterType || null
    if (status !== undefined) updateData.status = status
    if (projectType !== undefined) updateData.projectType = projectType
    if (timezone !== undefined) updateData.timezone = timezone
    if (tariffRetail !== undefined) updateData.tariffRetail = tariffRetail ? parseFloat(tariffRetail) : null
    if (tariffFeedIn !== undefined) updateData.tariffFeedIn = tariffFeedIn ? parseFloat(tariffFeedIn) : null
    // Afforestation fields
    if (treeSpecies !== undefined) updateData.treeSpecies = treeSpecies || null
    if (treeCount !== undefined) updateData.treeCount = treeCount ? parseInt(treeCount) : null
    if (plantedAreaM2 !== undefined) updateData.plantedAreaM2 = plantedAreaM2 ? parseFloat(plantedAreaM2) : null
    if (plantingDate !== undefined) updateData.plantingDate = plantingDate ? new Date(plantingDate) : null
    if (survivalRateTarget !== undefined) updateData.survivalRateTarget = survivalRateTarget !== null ? parseFloat(survivalRateTarget) : null
    // IoT fields
    if (iotSensorType !== undefined) updateData.iotSensorType = iotSensorType || null
    if (iotSensorModel !== undefined) updateData.iotSensorModel = iotSensorModel || null
    if (iotSensorSerial !== undefined) updateData.iotSensorSerial = iotSensorSerial || null
    if (iotGatewayId !== undefined) updateData.iotGatewayId = iotGatewayId || null
    if (iotProtocol !== undefined) updateData.iotProtocol = iotProtocol || null
    if (iotDataFrequency !== undefined) updateData.iotDataFrequency = iotDataFrequency || null

    const project = await db.project.update({
      where: { id },
      data: updateData,
    })

    // Log audit event
    try {
      await db.auditEvent.create({
        data: {
          organizationId: existing.organizationId,
          projectId: id,
          userId: user.userId,
          actor: user.email,
          action: 'project.update',
          resource: 'project',
          resourceId: id,
          result: 'success',
          metadata: JSON.stringify({ updatedFields: Object.keys(updateData) }),
        },
      })
    } catch {}

    return NextResponse.json({ success: true, project })
  } catch (error) {
    console.error('Update project error:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء تحديث المشروع' }, { status: 500 })
  }
}

// DELETE - delete project
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    // Authorization: require project delete access
    const auth = await requireProjectAccess(id, 'project:delete')
    if (!auth.authorized) return auth.response
    const { user } = auth

    const existing = await db.project.findUnique({
      where: { id },
      select: {
        id: true,
        organizationId: true,
        name: true,
        code: true,
        _count: { select: { readings: true, attestations: true, reports: true, impactUnits: true } },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })
    }

    // Prevent deletion if project has attestations or impact units (data integrity)
    if (existing._count.attestations > 0) {
      return NextResponse.json(
        { error: 'لا يمكن حذف المشروع لوجود توثيقات Hedera مرتبطة به. يرجى إيقاف المشروع بدلاً من حذفه.' },
        { status: 409 },
      )
    }

    if (existing._count.impactUnits > 0) {
      return NextResponse.json(
        { error: 'لا يمكن حذف المشروع لوجود وحدات أثر مرتبطة به. يرجى إيقاف المشروع بدلاً من حذفه.' },
        { status: 409 },
      )
    }

    // Delete project (cascade will handle related records)
    await db.project.delete({ where: { id } })

    // Log audit event
    try {
      await db.auditEvent.create({
        data: {
          organizationId: existing.organizationId,
          userId: user.userId,
          actor: user.email,
          action: 'project.delete',
          resource: 'project',
          resourceId: id,
          result: 'success',
          metadata: JSON.stringify({ name: existing.name, code: existing.code }),
        },
      })
    } catch {}

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete project error:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء حذف المشروع' }, { status: 500 })
  }
}

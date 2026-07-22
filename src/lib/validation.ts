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
    const auth = await requireProjectAccess(id, 'project:update')
    if (!auth.authorized) return auth.response
    const { user } = auth

    const body = await request.json()

    // Validate with Zod schema
    const parsed = updateProjectSchema.safeParse(body)
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors
      const firstField = Object.keys(fieldErrors)[0]
      const firstMessage = firstField ? (fieldErrors as any)[firstField]?.[0] : 'بيانات غير صالحة'
      return NextResponse.json(
        {
          error: `بيانات غير صالحة${firstField ? ` ${firstField}: ${firstMessage}` : ''}`,
          details: parsed.error.flatten(),
          field: firstField,
        },
        { status: 400 },
      )
    }

    const data = parsed.data

    // Build update object - only include fields that were provided
    const updateData: any = {}

    if (data.name !== undefined) updateData.name = data.name
    if ('nameAr' in data) updateData.nameAr = data.nameAr || null
    if (data.code !== undefined) updateData.code = data.code
    if (data.status !== undefined) updateData.status = data.status
    if (data.projectType !== undefined) updateData.projectType = data.projectType
    if (data.country !== undefined) updateData.country = data.country
    if (data.city !== undefined) updateData.city = data.city
    if ('latitude' in data) updateData.latitude = data.latitude ? parseFloat(String(data.latitude)) : null
    if ('longitude' in data) updateData.longitude = data.longitude ? parseFloat(String(data.longitude)) : null
    if ('timezone' in data) updateData.timezone = data.timezone || 'Asia/Riyadh'
    if ('capacityKwp' in data) updateData.capacityKwp = data.capacityKwp ? parseFloat(String(data.capacityKwp)) : null
    if (data.currency !== undefined) updateData.currency = data.currency
    if ('tariffRetail' in data) updateData.tariffRetail = data.tariffRetail ? parseFloat(String(data.tariffRetail)) : null
    if ('tariffFeedIn' in data) updateData.tariffFeedIn = data.tariffFeedIn ? parseFloat(String(data.tariffFeedIn)) : null
    if ('sponsorName' in data) updateData.sponsorName = data.sponsorName || null
    if ('sponsorPhone' in data) updateData.sponsorPhone = data.sponsorPhone || null
    if ('managerId' in data) updateData.managerId = data.managerId || null
    if ('inverterSerial' in data) updateData.inverterSerial = data.inverterSerial || null
    if ('inverterType' in data) updateData.inverterType = data.inverterType || null
    // Afforestation fields
    if ('treeSpecies' in data) updateData.treeSpecies = data.treeSpecies || null
    if ('treeCount' in data) updateData.treeCount = data.treeCount ? parseInt(String(data.treeCount), 10) : null
    if ('plantedAreaM2' in data) updateData.plantedAreaM2 = data.plantedAreaM2 != null ? parseFloat(String(data.plantedAreaM2)) : null
    if ('plantingDate' in data) updateData.plantingDate = data.plantingDate ? new Date(data.plantingDate) : null
    if ('survivalRateTarget' in data) updateData.survivalRateTarget = data.survivalRateTarget != null ? parseFloat(String(data.survivalRateTarget)) : null
    // IoT fields
    if ('iotSensorType' in data) updateData.iotSensorType = data.iotSensorType || null
    if ('iotSensorModel' in data) updateData.iotSensorModel = data.iotSensorModel || null
    if ('iotSensorSerial' in data) updateData.iotSensorSerial = data.iotSensorSerial || null
    if ('iotGatewayId' in data) updateData.iotGatewayId = data.iotGatewayId || null
    if ('iotProtocol' in data) updateData.iotProtocol = data.iotProtocol || null
    if ('iotDataFrequency' in data) updateData.iotDataFrequency = data.iotDataFrequency || null

    const project = await db.project.update({
      where: { id },
      data: updateData,
    })

    // Log audit event
    try {
      await db.auditEvent.create({
        data: {
          organizationId: project.organizationId,
          projectId: project.id,
          userId: user.userId,
          actor: user.email,
          action: 'project.update',
          resource: 'project',
          resourceId: project.id,
          result: 'success',
          metadata: JSON.stringify({ fields: Object.keys(updateData) }),
        },
      })
    } catch {}

    return NextResponse.json({ success: true, project })
  } catch (error) {
    console.error('Update project error:', error)
    return NextResponse.json(
      { error: 'حدث خطأ أثناء تحديث المشروع', details: String(error) },
      { status: 500 },
    )
  }
}

// DELETE - delete project
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const auth = await requireProjectAccess(id, 'project:delete')
    if (!auth.authorized) return auth.response
    const { user } = auth

    const project = await db.project.findUnique({ where: { id } })
    if (!project) {
      return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })
    }

    await db.project.delete({ where: { id } })

    // Log audit event
    try {
      await db.auditEvent.create({
        data: {
          organizationId: project.organizationId,
          userId: user.userId,
          actor: user.email,
          action: 'project.delete',
          resource: 'project',
          resourceId: id,
          result: 'success',
          metadata: JSON.stringify({ code: project.code, name: project.name }),
        },
      })
    } catch {}

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete project error:', error)
    return NextResponse.json(
      { error: 'حدث خطأ أثناء حذف المشروع', details: String(error) },
      { status: 500 },
    )
  }
}

import { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'

import { requireProjectAccess } from '@/lib/authorization'
import { db } from '@/lib/db'
import { updateProjectSchema } from '@/lib/validation'

interface RouteContext {
  params: Promise<{ id: string }>
}

const PROJECT_STATUSES = [
  'draft',
  'under_review',
  'approved',
  'active',
  'suspended',
  'decommissioned',
] as const

type ProjectStatus = (typeof PROJECT_STATUSES)[number]
type UpdateProjectInput = ReturnType<typeof updateProjectSchema.parse>
type ProjectUpdateData = Partial<
  Record<(typeof PROJECT_UPDATE_FIELDS)[number], string | number | Date | null>
>

const DATE_FIELDS = new Set<keyof UpdateProjectInput>([
  'plantingDate',
  'commissionedAt',
])

const PROJECT_UPDATE_FIELDS = [
  'name',
  'nameAr',
  'code',
  'projectType',
  'country',
  'city',
  'timezone',
  'currency',
  'sponsorName',
  'sponsorPhone',
  'managerId',
  'inverterSerial',
  'inverterType',
  'treeSpecies',
  'treeCount',
  'plantedAreaM2',
  'plantingDate',
  'survivalRateTarget',
  'iotSensorType',
  'iotSensorModel',
  'iotSensorSerial',
  'iotGatewayId',
  'iotProtocol',
  'iotDataFrequency',
  'capacityKwp',
  'tariffRetail',
  'tariffFeedIn',
  'latitude',
  'longitude',
  'status',
  'commissionedAt',
] as const satisfies ReadonlyArray<keyof UpdateProjectInput>

const SITE_FIELDS = [
  'country',
  'city',
  'latitude',
  'longitude',
  'timezone',
] as const

function errorResponse(message: string, status: number, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status })
}

function isProjectStatus(value: unknown): value is ProjectStatus {
  return (
    typeof value === 'string' &&
    PROJECT_STATUSES.includes(value as ProjectStatus)
  )
}

function isPrismaError(
  error: unknown,
  code: string,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === code
  )
}

async function readJson(request: NextRequest): Promise<
  | { ok: true; value: unknown }
  | { ok: false; response: NextResponse }
> {
  try {
    return { ok: true, value: await request.json() }
  } catch {
    return {
      ok: false,
      response: errorResponse('صيغة JSON غير صالحة', 400),
    }
  }
}

function buildProjectUpdateData(
  body: Record<string, unknown>,
  data: UpdateProjectInput,
): ProjectUpdateData {
  const updateData: ProjectUpdateData = {}

  for (const field of PROJECT_UPDATE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) {
      continue
    }

    const value = data[field]

    if (DATE_FIELDS.has(field)) {
      updateData[field] = value
        ? new Date(value as string)
        : null
      continue
    }

    updateData[field] = value ?? null
  }

  return updateData
}

export async function GET(
  _request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id } = await params
    const auth = await requireProjectAccess(id, 'project:read')

    if (!auth.authorized) {
      return auth.response
    }

    const project = await db.project.findUnique({
      where: { id },
      include: {
        organization: {
          select: {
            name: true,
            nameAr: true,
            code: true,
          },
        },
        manager: {
          select: {
            id: true,
            name: true,
            nameAr: true,
            email: true,
          },
        },
        sites: true,
        assets: {
          include: {
            solarProfile: true,
          },
        },
        devices: true,
        _count: {
          select: {
            readings: true,
            cases: true,
            attestations: true,
            reports: true,
          },
        },
      },
    })

    if (!project) {
      return errorResponse('المشروع غير موجود', 404)
    }

    return NextResponse.json({ project })
  } catch (error) {
    console.error('Failed to get project:', error)
    return errorResponse('حدث خطأ أثناء جلب المشروع', 500)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id } = await params
    const auth = await requireProjectAccess(id, 'project:update')

    if (!auth.authorized) {
      return auth.response
    }

    const existingProject = await db.project.findUnique({
      where: { id },
      select: {
        id: true,
        organizationId: true,
        code: true,
        status: true,
        commissionedAt: true,
      },
    })

    if (!existingProject) {
      return errorResponse('المشروع غير موجود', 404)
    }

    const json = await readJson(request)

    if (!json.ok) {
      return json.response
    }

    if (
      typeof json.value !== 'object' ||
      json.value === null ||
      Array.isArray(json.value)
    ) {
      return errorResponse('يجب أن يكون جسم الطلب كائن JSON', 400)
    }

    const body = json.value as Record<string, unknown>
    const parsed = updateProjectSchema.safeParse(body)

    if (!parsed.success) {
      return errorResponse('بيانات التحديث غير صحيحة', 400, {
        details: parsed.error.flatten(),
      })
    }

    const data = parsed.data

    if (data.status !== undefined && !isProjectStatus(data.status)) {
      return errorResponse('حالة المشروع غير صالحة', 400, {
        field: 'status',
      })
    }

    if (data.code && data.code !== existingProject.code) {
      const duplicateProject = await db.project.findUnique({
        where: {
          organizationId_code: {
            organizationId: existingProject.organizationId,
            code: data.code,
          },
        },
        select: { id: true },
      })

      if (duplicateProject) {
        return errorResponse('رمز المشروع مستخدم مسبقًا', 409, {
          field: 'code',
        })
      }
    }

    if (data.managerId) {
      const managerMembership = await db.userMembership.findFirst({
        where: {
          userId: data.managerId,
          organizationId: existingProject.organizationId,
          status: 'active',
        },
        select: { id: true },
      })

      if (!managerMembership) {
        return errorResponse(
          'مدير المشروع غير موجود داخل المؤسسة أو أن عضويته غير نشطة',
          400,
          { field: 'managerId' },
        )
      }
    }

    const updateData = buildProjectUpdateData(body, data)

    if (Object.keys(updateData).length === 0) {
      return errorResponse('لم يتم تقديم أي حقول قابلة للتحديث', 400)
    }

    const nextStatus =
      typeof updateData.status === 'string'
        ? updateData.status
        : existingProject.status

    const explicitlyClearsCommissioningDate =
      Object.prototype.hasOwnProperty.call(updateData, 'commissionedAt') &&
      updateData.commissionedAt === null

    if (nextStatus === 'active') {
      if (explicitlyClearsCommissioningDate) {
        return errorResponse(
          'لا يمكن إزالة تاريخ التشغيل من مشروع نشط',
          400,
          { field: 'commissionedAt' },
        )
      }

      if (
        !existingProject.commissionedAt &&
        updateData.commissionedAt === undefined
      ) {
        updateData.commissionedAt = new Date()
      }
    }

    const changedFields = Object.keys(updateData)

    const updatedProject = await db.$transaction(async (tx) => {
      const project = await tx.project.update({
        where: { id },
        data: updateData as Prisma.ProjectUncheckedUpdateInput,
      })

      const shouldSynchronizeSites = SITE_FIELDS.some(
        (field) => updateData[field] !== undefined,
      )

      if (shouldSynchronizeSites) {
        await tx.site.updateMany({
          where: { projectId: id },
          data: {
            ...(updateData.country !== undefined
              ? { country: updateData.country as string | null }
              : {}),
            ...(updateData.city !== undefined
              ? { city: updateData.city as string | null }
              : {}),
            ...(updateData.latitude !== undefined
              ? { latitude: updateData.latitude as number | null }
              : {}),
            ...(updateData.longitude !== undefined
              ? { longitude: updateData.longitude as number | null }
              : {}),
            ...(updateData.timezone !== undefined
              ? { timezone: updateData.timezone as string }
              : {}),
          },
        })
      }

      await tx.auditEvent.create({
        data: {
          organizationId: existingProject.organizationId,
          projectId: id,
          userId: auth.user.userId,
          actor: auth.user.email,
          action: 'project.update',
          resource: 'project',
          resourceId: id,
          result: 'success',
          metadata: JSON.stringify({
            changedFields,
            ...(updateData.status !== undefined
              ? {
                  previousStatus: existingProject.status,
                  newStatus: updateData.status,
                }
              : {}),
          }),
        },
      })

      return project
    })

    return NextResponse.json({
      success: true,
      project: updatedProject,
    })
  } catch (error) {
    console.error('Failed to update project:', error)

    if (isPrismaError(error, 'P2025')) {
      return errorResponse('المشروع غير موجود', 404)
    }

    if (isPrismaError(error, 'P2002')) {
      return errorResponse('رمز المشروع مستخدم مسبقًا', 409, {
        field: 'code',
      })
    }

    return errorResponse('حدث خطأ أثناء تحديث المشروع', 500)
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id } = await params
    const auth = await requireProjectAccess(id, 'project:delete')

    if (!auth.authorized) {
      return auth.response
    }

    const existingProject = await db.project.findUnique({
      where: { id },
      select: {
        id: true,
        organizationId: true,
        code: true,
        _count: {
          select: {
            attestations: true,
            impactUnits: true,
          },
        },
      },
    })

    if (!existingProject) {
      return errorResponse('المشروع غير موجود', 404)
    }

    const hasProtectedRecords =
      existingProject._count.attestations > 0 ||
      existingProject._count.impactUnits > 0

    if (hasProtectedRecords) {
      return errorResponse(
        'لا يمكن حذف مشروع يحتوي على توثيقات أو وحدات أثر. استخدم إيقاف المشروع بدلًا من الحذف.',
        409,
      )
    }

    await db.$transaction(async (tx) => {
      /*
       * نحذف سجلّات التدقيق المرتبطة بالمشروع أولًا لأن علاقة AuditEvent
       * لا تحتوي على onDelete: Cascade في مخطط Prisma.
       * بقية العلاقات يفترض أن تُحذف عبر Cascade حسب المخطط.
       */
      await tx.auditEvent.deleteMany({
        where: { projectId: id },
      })

      await tx.project.delete({
        where: { id },
      })

      await tx.auditEvent.create({
        data: {
          organizationId: existingProject.organizationId,
          userId: auth.user.userId,
          actor: auth.user.email,
          action: 'project.delete',
          resource: 'project',
          resourceId: id,
          result: 'success',
          metadata: JSON.stringify({
            code: existingProject.code,
          }),
        },
      })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete project:', error)

    if (isPrismaError(error, 'P2025')) {
      return errorResponse('المشروع غير موجود', 404)
    }

    return errorResponse('حدث خطأ أثناء حذف المشروع', 500)
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission, projectScopeFilter } from '@/lib/authorization'
import { createProjectSchema } from '@/lib/validation'

export async function GET() {
  try {
    const auth = await requirePermission('project:read')
    if (!auth.authorized) return auth.response

    const { user } = auth

    if (!user.organizationId) {
      return NextResponse.json(
        { error: 'المستخدم غير مرتبط بأي مؤسسة' },
        { status: 400 },
      )
    }

    const projects = await db.project.findMany({
      where: {
        organizationId: user.organizationId,
        ...projectScopeFilter(user),
      },
      include: {
        organization: { select: { name: true, nameAr: true, code: true } },
        manager: { select: { id: true, name: true, nameAr: true, email: true } },
        sites: true,
        assets: { include: { solarProfile: true } },
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
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ projects })
  } catch (error) {
    console.error('List projects error:', error)
    return NextResponse.json(
      { error: 'حدث خطأ أثناء جلب المشاريع' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('project:create')
    if (!auth.authorized) return auth.response

    const { user } = auth

    if (!user.organizationId) {
      return NextResponse.json(
        { error: 'المستخدم غير مرتبط بأي مؤسسة. يجب إنشاء Organization وعضوية UserMembership أولًا.' },
        { status: 400 },
      )
    }

    const body = await request.json()
    const parsed = createProjectSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'بيانات المشروع غير صحيحة',
          details: parsed.error.flatten(),
        },
        { status: 400 },
      )
    }

    const data = parsed.data

    const org = await db.organization.findUnique({
      where: { id: user.organizationId },
      select: { id: true, name: true, nameAr: true, code: true },
    })

    if (!org) {
      return NextResponse.json(
        { error: 'المؤسسة المرتبطة بالمستخدم غير موجودة. أعد seed لبيانات Organization وUserMembership.' },
        { status: 400 },
      )
    }

    const existingProject = await db.project.findUnique({
      where: {
        organizationId_code: {
          organizationId: org.id,
          code: data.code,
        },
      },
      select: { id: true },
    })

    if (existingProject) {
      return NextResponse.json(
        {
          error: 'رمز المشروع مستخدم مسبقًا داخل نفس المؤسسة',
          field: 'code',
        },
        { status: 400 },
      )
    }

    if (data.managerId) {
      const managerMembership = await db.userMembership.findFirst({
        where: {
          userId: data.managerId,
          organizationId: org.id,
          status: 'active',
        },
        select: { id: true },
      })

      if (!managerMembership) {
        return NextResponse.json(
          {
            error: 'مدير المشروع المحدد غير موجود داخل هذه المؤسسة',
            field: 'managerId',
          },
          { status: 400 },
        )
      }
    }

    const isAfforestation = data.projectType === 'afforestation'
    const isSmartIrrigation = data.projectType === 'smart_irrigation'
    const latitude = data.latitude ?? null
    const longitude = data.longitude ?? null
    const timezone = data.timezone || 'Asia/Riyadh'
    const currency = data.currency || 'SAR'
    const siteName = `${data.code} Site`

    const project = await db.$transaction(async (tx) => {
      const createdProject = await tx.project.create({
        data: {
          organizationId: org.id,
          name: data.name,
          nameAr: data.nameAr ?? null,
          code: data.code,
          projectType: data.projectType,
          country: data.country ?? null,
          city: data.city ?? null,
          latitude,
          longitude,
          timezone,
          currency,
          capacityKwp: data.capacityKwp ?? null,
          tariffRetail: data.tariffRetail ?? null,
          tariffFeedIn: data.tariffFeedIn ?? null,
          sponsorName: data.sponsorName ?? null,
          sponsorPhone: data.sponsorPhone ?? null,
          managerId: data.managerId ?? null,
          inverterSerial: data.inverterSerial ?? null,
          inverterType: data.inverterType ?? null,
          treeSpecies: data.treeSpecies ?? null,
          treeCount: data.treeCount ?? null,
          plantedAreaM2: data.plantedAreaM2 ?? null,
          plantingDate: data.plantingDate ? new Date(data.plantingDate) : null,
          survivalRateTarget: data.survivalRateTarget ?? null,
          iotSensorType: data.iotSensorType ?? null,
          iotSensorModel: data.iotSensorModel ?? null,
          iotSensorSerial: data.iotSensorSerial ?? null,
          iotGatewayId: data.iotGatewayId ?? null,
          iotProtocol: data.iotProtocol ?? null,
          iotDataFrequency: data.iotDataFrequency ?? null,
          waterMeterSerial: data.waterMeterSerial ?? null,
          waterMeterType: data.waterMeterType ?? null,
          cropType: data.cropType ?? null,
          irrigatedAreaM2: data.irrigatedAreaM2 ?? null,
          irrigationMethod: data.irrigationMethod ?? null,
          soilType: data.soilType ?? null,
          waterSourceType: data.waterSourceType ?? null,
          dailyWaterBudgetM3: data.dailyWaterBudgetM3 ?? null,
          baselineWaterUseLM2Day: data.baselineWaterUseLM2Day ?? null,
          waterTariffPerM3: data.waterTariffPerM3 ?? null,
          pumpEnergyKwhPerM3: data.pumpEnergyKwhPerM3 ?? null,
        },
      })

      const site = await tx.site.create({
        data: {
          projectId: createdProject.id,
          name: siteName,
          nameAr: data.nameAr ?? null,
          country: data.country ?? null,
          city: data.city ?? null,
          latitude,
          longitude,
          timezone,
        },
      })

      if (isAfforestation) {
        const asset = await tx.asset.create({
          data: {
            projectId: createdProject.id,
            siteId: site.id,
            name: `${data.code} Trees Area`,
            assetType: 'afforestation',
            status: 'active',
          },
        })

        if (data.iotSensorSerial) {
          await tx.device.create({
            data: {
              projectId: createdProject.id,
              siteId: site.id,
              assetId: asset.id,
              name: `${data.code}-IOT-${data.iotSensorType || '001'}`,
              manufacturer: data.iotSensorModel ? data.iotSensorModel.split(' ')[0] : 'Generic',
              model: data.iotSensorModel || 'IoT Sensor',
              serialNumber: data.iotSensorSerial,
              protocol: data.iotProtocol || 'lora',
              status: 'registered',
            },
          })
        }

        // بقية مستشعرات الشبكة المُدخلة دفعة واحدة عند الإنشاء
        for (const [index, sensor] of (data.additionalIotSensors ?? []).entries()) {
          await tx.device.create({
            data: {
              projectId: createdProject.id,
              siteId: site.id,
              assetId: asset.id,
              name: `${data.code}-IOT-${String(index + 2).padStart(2, '0')}-${sensor.sensorType || 'sensor'}`,
              manufacturer: sensor.model ? sensor.model.split(' ')[0] : 'Generic',
              model: sensor.model || 'IoT Sensor',
              serialNumber: sensor.serial,
              protocol: sensor.protocol || 'lora',
              status: 'registered',
            },
          })
        }
      } else if (isSmartIrrigation) {
        // مشروع ري ذكي: أصل واحد يمثل الحقل/المساحة المروية، وعداد المياه الذكي الرئيسي
        // (إن أُدخل) يُسجَّل كجهاز Device مستقل بنفس آلية تسجيل الإنفرتر لمشاريع الطاقة
        // الشمسية بالضبط - سيريال نمبر فريد + بروتوكول اتصال، حتى تتحقق منه نقطة الاستيعاب
        // /api/integrations/water-meter (hash + Hedera) لاحقًا. بالإضافة لجهاز IoT اختياري
        // يمثل المجس الأول في شبكة مجسات الرطوبة (يمكن إضافة بقية المجسات لاحقًا كأجهزة
        // مستقلة من قسم "الأجهزة").
        const asset = await tx.asset.create({
          data: {
            projectId: createdProject.id,
            siteId: site.id,
            name: `${data.code} Irrigated Field`,
            assetType: 'irrigated_field',
            status: 'active',
          },
        })

        if (data.waterMeterSerial) {
          await tx.device.create({
            data: {
              projectId: createdProject.id,
              siteId: site.id,
              assetId: asset.id,
              name: `${data.code}-WM`,
              manufacturer: 'Generic',
              model: data.waterMeterType || 'ultrasonic',
              serialNumber: data.waterMeterSerial,
              protocol: 'mbus',
              status: 'registered',
            },
          })
        }

        if (data.iotSensorSerial) {
          await tx.device.create({
            data: {
              projectId: createdProject.id,
              siteId: site.id,
              assetId: asset.id,
              name: `${data.code}-MOIST-${data.iotSensorType || '001'}`,
              manufacturer: data.iotSensorModel ? data.iotSensorModel.split(' ')[0] : 'Generic',
              model: data.iotSensorModel || 'Soil Moisture Sensor',
              serialNumber: data.iotSensorSerial,
              protocol: data.iotProtocol || 'lora',
              status: 'registered',
            },
          })
        }

        // بقية عُقد شبكة مجسات الرطوبة المُدخلة دفعة واحدة عند الإنشاء
        for (const [index, sensor] of (data.additionalIotSensors ?? []).entries()) {
          await tx.device.create({
            data: {
              projectId: createdProject.id,
              siteId: site.id,
              assetId: asset.id,
              name: `${data.code}-MOIST-${String(index + 2).padStart(2, '0')}-${sensor.sensorType || 'sensor'}`,
              manufacturer: sensor.model ? sensor.model.split(' ')[0] : 'Generic',
              model: sensor.model || 'Soil Moisture Sensor',
              serialNumber: sensor.serial,
              protocol: sensor.protocol || 'lora',
              status: 'registered',
            },
          })
        }
      } else {
        const asset = await tx.asset.create({
          data: {
            projectId: createdProject.id,
            siteId: site.id,
            name: `${data.code} Solar Array`,
            assetType: 'solar_array',
            status: 'active',
          },
        })

        if (data.capacityKwp && data.capacityKwp > 0) {
          await tx.solarAssetProfile.create({
            data: {
              assetId: asset.id,
              capacityKwp: data.capacityKwp,
            },
          })
        }

        if (data.inverterSerial) {
          await tx.device.create({
            data: {
              projectId: createdProject.id,
              siteId: site.id,
              assetId: asset.id,
              name: `${data.code}-INV`,
              manufacturer: 'Generic',
              model: data.inverterType || 'Inverter',
              serialNumber: data.inverterSerial,
              protocol: 'modbus_tcp',
              status: 'registered',
            },
          })
        }
      }

      await tx.auditEvent.create({
        data: {
          organizationId: org.id,
          projectId: createdProject.id,
          userId: user.userId,
          actor: user.email,
          action: 'project.create',
          resource: 'project',
          resourceId: createdProject.id,
          result: 'success',
          metadata: JSON.stringify({
            code: data.code,
            name: data.name,
            projectType: data.projectType,
          }),
        },
      })

      return createdProject
    })

    return NextResponse.json(
      { success: true, project },
      { status: 201 },
    )
  } catch (error) {
    console.error('Create project error:', error)

    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'توجد قيمة مكررة في قاعدة البيانات، تحقق من رمز المشروع أو رقم الجهاز' },
        { status: 400 },
      )
    }

    return NextResponse.json(
      { error: 'حدث خطأ أثناء إنشاء المشروع', details: String(error) },
      { status: 500 },
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requirePermission } from '@/lib/authorization'
import { createProjectSchema } from '@/lib/validation'

export async function GET(request: NextRequest) {
  try {
    // Authorization: require authentication
    const auth = await requireAuth()
    if (!auth.authorized) return auth.response
    const { user } = auth

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    const projects = await db.project.findMany({
      where: {
        organizationId: user.organizationId!,
        ...(status ? { status } : {}),
      },
      include: {
        sites: true,
        assets: { include: { solarProfile: true } },
        devices: true,
        _count: { select: { readings: true, cases: true, attestations: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const result = projects.map((p) => ({
      id: p.id,
      name: p.name,
      nameAr: p.nameAr,
      code: p.code,
      status: p.status,
      projectType: p.projectType,
      country: p.country,
      city: p.city,
      latitude: p.latitude,
      longitude: p.longitude,
      timezone: p.timezone,
      commissionedAt: p.commissionedAt,
      capacityKwp: p.capacityKwp,
      currency: p.currency,
      tariffRetail: p.tariffRetail,
      tariffFeedIn: p.tariffFeedIn,
      methodology: p.methodology,
      sponsorName: p.sponsorName,
      sponsorPhone: p.sponsorPhone,
      inverterSerial: p.inverterSerial,
      inverterType: p.inverterType,
      // Afforestation
      treeSpecies: p.treeSpecies,
      treeCount: p.treeCount,
      plantedAreaM2: p.plantedAreaM2,
      plantingDate: p.plantingDate,
      survivalRateTarget: p.survivalRateTarget,
      // IoT
      iotSensorType: p.iotSensorType,
      iotSensorModel: p.iotSensorModel,
      iotSensorSerial: p.iotSensorSerial,
      iotGatewayId: p.iotGatewayId,
      iotProtocol: p.iotProtocol,
      iotDataFrequency: p.iotDataFrequency,
      sitesCount: p.sites.length,
      assetsCount: p.assets.length,
      devicesCount: p.devices.length,
      readingsCount: p._count.readings,
      casesCount: p._count.cases,
      attestationsCount: p._count.attestations,
      createdAt: p.createdAt,
    }))

    return NextResponse.json({ projects: result, total: result.length })
  } catch (error) {
    console.error('Projects API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authorization: require project:create permission
    const auth = await requirePermission('project:create')
    if (!auth.authorized) return auth.response
    const { user } = auth

    const body = await request.json()

    // Validate body with Zod
    const parsed = createProjectSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'بيانات غير صالحة', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
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
      inverterSerial,
      inverterType,
      projectType,
      timezone,
      tariffRetail,
      tariffFeedIn,
      // Afforestation fields
      treeSpecies,
      treeCount,
      plantedAreaM2,
      plantingDate,
      survivalRateTarget,
      // IoT fields
      iotSensorType,
      iotSensorModel,
      iotSensorSerial,
      iotGatewayId,
      iotProtocol,
      iotDataFrequency,
    } = parsed.data

    // Type-specific validation
    const SOLAR_TYPES = ['grid_tied', 'hybrid', 'off_grid']
    const isSolar = SOLAR_TYPES.includes(projectType)
    const isAfforestation = projectType === 'afforestation'

    if (isSolar && !inverterSerial) {
      return NextResponse.json(
        { error: 'سيريال نمبر الإنفرتر مطلوب لمشاريع الطاقة الشمسية' },
        { status: 400 },
      )
    }

    if (isAfforestation) {
      if (!treeSpecies) {
        return NextResponse.json(
          { error: 'نوع الأشجار مطلوب لمشاريع التشجير' },
          { status: 400 },
        )
      }
      if (!treeCount || parseInt(String(treeCount)) <= 0) {
        return NextResponse.json(
          { error: 'عدد الأشجار يجب أن يكون رقمًا موجبًا' },
          { status: 400 },
        )
      }
      if (!plantedAreaM2 || parseFloat(String(plantedAreaM2)) <= 0) {
        return NextResponse.json(
          { error: 'المساحة المزروعة يجب أن تكون رقمًا موجبًا' },
          { status: 400 },
        )
      }
    }

    const org = await db.organization.findFirst({
      where: { id: user.organizationId },
    })
    if (!org) return NextResponse.json({ error: 'No organization' }, { status: 404 })

    // Check code uniqueness within organization
    const existing = await db.project.findFirst({
      where: { organizationId: org.id, code },
    })
    if (existing) {
      return NextResponse.json(
        { error: 'رمز المشروع مستخدم بالفعل في المؤسسة' },
        { status: 409 },
      )
    }

    // Check inverter serial uniqueness (only for solar projects)
    if (isSolar && inverterSerial) {
      const existingInverter = await db.project.findFirst({
        where: { inverterSerial },
      })
      if (existingInverter) {
        return NextResponse.json(
          { error: 'سيريال نمبر الإنفرتر مستخدم في مشروع آخر' },
          { status: 409 },
        )
      }
    }

    // Check IoT sensor serial uniqueness (for afforestation)
    if (isAfforestation && iotSensorSerial) {
      const existingSensor = await db.device.findFirst({
        where: { serialNumber: iotSensorSerial },
      })
      if (existingSensor) {
        return NextResponse.json(
          { error: 'سيريال نمبر المستشعر مستخدم في جهاز آخر' },
          { status: 409 },
        )
      }
    }

    // Create project
    const project = await db.project.create({
      data: {
        organizationId: org.id,
        name,
        nameAr: nameAr || name,
        code,
        status: 'draft',
        projectType: projectType || 'grid_tied',
        country,
        city,
        latitude: parseFloat(String(latitude)),
        longitude: parseFloat(String(longitude)),
        timezone: timezone || 'Asia/Riyadh',
        capacityKwp: capacityKwp ? parseFloat(String(capacityKwp)) : null,
        currency: currency || 'SAR',
        tariffRetail: tariffRetail ? parseFloat(String(tariffRetail)) : null,
        tariffFeedIn: tariffFeedIn ? parseFloat(String(tariffFeedIn)) : null,
        methodology: 'ghg_protocol_scope2',
        sponsorName: sponsorName || null,
        sponsorPhone: sponsorPhone || null,
        inverterSerial: isSolar ? inverterSerial : null,
        inverterType: isSolar ? (inverterType || 'string') : null,
        // Afforestation fields
        treeSpecies: isAfforestation ? treeSpecies : null,
        treeCount: isAfforestation && treeCount ? parseInt(String(treeCount)) : null,
        plantedAreaM2: isAfforestation && plantedAreaM2 ? parseFloat(String(plantedAreaM2)) : null,
        plantingDate: isAfforestation && plantingDate ? new Date(plantingDate) : null,
        survivalRateTarget: isAfforestation && survivalRateTarget ? parseFloat(String(survivalRateTarget)) : null,
        // IoT fields
        iotSensorType: isAfforestation ? (iotSensorType || null) : null,
        iotSensorModel: isAfforestation ? (iotSensorModel || null) : null,
        iotSensorSerial: isAfforestation ? (iotSensorSerial || null) : null,
        iotGatewayId: isAfforestation ? (iotGatewayId || null) : null,
        iotProtocol: isAfforestation ? (iotProtocol || null) : null,
        iotDataFrequency: isAfforestation ? (iotDataFrequency || null) : null,
      },
    })

    // Create a default site
    const site = await db.site.create({
      data: {
        projectId: project.id,
        name: `${name} - الموقع الرئيسي`,
        nameAr: `${nameAr || name} - الموقع الرئيسي`,
        country,
        city,
        latitude: parseFloat(String(latitude)),
        longitude: parseFloat(String(longitude)),
        timezone: timezone || 'Asia/Riyadh',
      },
    })

    if (isSolar) {
      // Create default asset (solar array)
      const asset = await db.asset.create({
        data: {
          projectId: project.id,
          siteId: site.id,
          name: `${code} Array A`,
          assetType: 'solar_array',
          status: 'active',
        },
      })

      if (capacityKwp) {
        await db.solarAssetProfile.create({
          data: {
            assetId: asset.id,
            capacityKwp: parseFloat(String(capacityKwp)),
            panelAreaM2: parseFloat(String(capacityKwp)) * 5,
            tiltDegrees: 25,
            azimuthDegrees: 180,
            technology: 'mono_si',
            moduleEfficiency: 0.21,
            systemLosses: 0.14,
            inverterEfficiency: 0.97,
          },
        })
      }

      // Register the inverter device
      await db.device.create({
        data: {
          projectId: project.id,
          siteId: site.id,
          assetId: asset.id,
          name: `${code}-INV-001`,
          manufacturer: 'Generic',
          model: 'Inverter',
          serialNumber: inverterSerial!,
          protocol: 'http_api',
          status: 'registered',
        },
      })
    }

    if (isAfforestation) {
      // Create an afforestation asset
      const asset = await db.asset.create({
        data: {
          projectId: project.id,
          siteId: site.id,
          name: `${code} Trees Area`,
          assetType: 'afforestation', // new asset type
          status: 'active',
        },
      })

      // Register the IoT sensor device if serial provided
      if (iotSensorSerial) {
        await db.device.create({
          data: {
            projectId: project.id,
            siteId: site.id,
            assetId: asset.id,
            name: `${code}-IOT-${iotSensorType || '001'}`,
            manufacturer: iotSensorModel ? iotSensorModel.split(' ')[0] : 'Generic',
            model: iotSensorModel || 'IoT Sensor',
            serialNumber: iotSensorSerial,
            protocol: iotProtocol || 'lora',
            status: 'registered',
          },
        })
      }
    }

    // Log audit event
    try {
      await db.auditEvent.create({
        data: {
          organizationId: org.id,
          projectId: project.id,
          userId: user.userId,
          actor: user.email,
          action: 'project.create',
          resource: 'project',
          resourceId: project.id,
          result: 'success',
          metadata: JSON.stringify({ code, name }),
        },
      })
    } catch {}

    return NextResponse.json(
      { success: true, project },
      { status: 201 },
    )
  } catch (error) {
    console.error('Create project error:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء إنشاء المشروع' }, { status: 500 })
  }
}

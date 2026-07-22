import { NextRequest, NextResponse } from 'next/server'

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
    return NextResponse.json(
      { error: 'حدث خطأ أثناء إنشاء المشروع', details: String(error) },
      { status: 500 },
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/authorization'
import { testHederaConnection } from '@/lib/hedera'
import { decryptSecret } from '@/lib/crypto'
import { testNasaPowerConnection } from '@/lib/space-data/nasa-power'
import { testGeeConnection } from '@/lib/space-data/google-earth-engine'
import { testCamsConnection } from '@/lib/space-data/cams'

interface Params {
  params: Promise<{ id: string }>
}

// POST /api/integration-config/[id]/test — Test the live connection for a given integration
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const auth = await requirePermission('settings:manage')
    if (!auth.authorized) return auth.response

    const { user } = auth
    const { id } = await params

    const existing = await db.integrationConfig.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Integration config not found' }, { status: 404 })
    }

    let result: { success: boolean; message: string }

    switch (existing.name) {
      case 'hedera':
        result = await testHederaConnection()
        break
      case 'space_nasa_power':
        result = await testNasaPowerConnection()
        break
      case 'space_gee': {
        if (!existing.encryptedSecret) {
          result = { success: false, message: 'يلزم إدخال ملف Service Account JSON أولاً' }
          break
        }
        try {
          const serviceAccount = JSON.parse(decryptSecret(existing.encryptedSecret))
          result = await testGeeConnection(serviceAccount)
        } catch {
          result = { success: false, message: 'محتوى Service Account JSON غير صالح' }
        }
        break
      }
      case 'space_cams': {
        const cfg = existing.config ? JSON.parse(existing.config) : {}
        if (!cfg.username) {
          result = { success: false, message: 'يلزم إدخال البريد الإلكتروني المسجَّل في soda-pro.com أولاً' }
          break
        }
        result = await testCamsConnection({ username: cfg.username })
        break
      }
      default:
        result = {
          success: false,
          message: `اختبار الاتصال غير مدعوم بعد لهذا التكامل (${existing.name})`,
        }
    }

    // Persist test result
    await db.integrationConfig.update({
      where: { id },
      data: {
        lastTestedAt: new Date(),
        lastTestResult: result.success ? 'success' : 'failed',
        lastTestError: result.success ? null : result.message,
      },
    })

    // Audit log
    await db.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        userId: user.userId,
        actor: user.email,
        action: 'integration.test',
        resource: 'integration_config',
        resourceId: id,
        result: result.success ? 'success' : 'failure',
        metadata: JSON.stringify({ name: existing.name, message: result.message }),
      },
    })

    return NextResponse.json({
      result: result.success ? 'success' : 'failed',
      message: result.message,
    })
  } catch (error: any) {
    console.error('IntegrationConfig test error:', error)
    return NextResponse.json(
      { result: 'failed', message: error?.message || 'حدث خطأ أثناء الاختبار' },
      { status: 500 },
    )
  }
}

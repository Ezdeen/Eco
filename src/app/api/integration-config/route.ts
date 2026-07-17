import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/authorization'
import { encryptSecret, decryptSecret, maskSecret } from '@/lib/crypto'

// GET /api/integration-config — List all integration configs (secrets masked)
export async function GET() {
  try {
    const auth = await requirePermission('settings:manage')
    if (!auth.authorized) return auth.response

    const configs = await db.integrationConfig.findMany({
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({
      configs: configs.map((c) => ({
        id: c.id,
        organizationId: c.organizationId,
        name: c.name,
        displayName: c.displayName,
        description: c.description,
        category: c.category,
        isActive: c.isActive,
        config: c.config ? JSON.parse(c.config) : null,
        hasSecret: !!c.encryptedSecret,
        maskedSecret: c.encryptedSecret ? maskSecret(decryptSecret(c.encryptedSecret)) : null,
        secretKey: c.secretKey,
        lastTestedAt: c.lastTestedAt,
        lastTestResult: c.lastTestResult,
        lastTestError: c.lastTestError,
        createdBy: c.createdBy,
        updatedBy: c.updatedBy,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      total: configs.length,
    })
  } catch (error) {
    console.error('IntegrationConfig GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/integration-config — Create or update a config (with encrypted secret)
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('settings:manage')
    if (!auth.authorized) return auth.response

    const { user } = auth
    const body = await request.json()
    const { name, displayName, description, category, isActive, config, secret, organizationId } = body

    if (!name || !displayName) {
      return NextResponse.json({ error: 'name and displayName are required' }, { status: 400 })
    }

    // Check if config already exists
    const existing = await db.integrationConfig.findUnique({ where: { name } })

    // Encrypt secret if provided
    const encryptedSecret = secret ? encryptSecret(secret) : existing?.encryptedSecret || null

    if (existing) {
      // Update existing
      const updated = await db.integrationConfig.update({
        where: { id: existing.id },
        data: {
          displayName,
          description: description || existing.description,
          category: category || existing.category,
          isActive: isActive ?? existing.isActive,
          config: config ? JSON.stringify(config) : existing.config,
          encryptedSecret,
          secretKey: secret ? `key-${Date.now()}` : existing.secretKey,
          updatedBy: user.email,
        },
      })

      // Audit log
      await db.auditEvent.create({
        data: {
          organizationId: user.organizationId,
          userId: user.userId,
          actor: user.email,
          action: 'integration.update',
          resource: 'integration_config',
          resourceId: updated.id,
          result: 'success',
          metadata: JSON.stringify({ name, secretRotated: !!secret }),
        },
      })

      return NextResponse.json({
        success: true,
        config: {
          id: updated.id,
          name: updated.name,
          displayName: updated.displayName,
          isActive: updated.isActive,
          hasSecret: !!updated.encryptedSecret,
          maskedSecret: updated.encryptedSecret ? maskSecret(decryptSecret(updated.encryptedSecret)) : null,
        },
      })
    }

    // Create new
    const created = await db.integrationConfig.create({
      data: {
        name,
        displayName,
        description: description || null,
        category: category || 'integration',
        isActive: isActive ?? false,
        config: config ? JSON.stringify(config) : null,
        encryptedSecret,
        secretKey: secret ? `key-${Date.now()}` : null,
        organizationId: organizationId || user.organizationId || null,
        createdBy: user.email,
        updatedBy: user.email,
      },
    })

    // Audit log
    await db.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        userId: user.userId,
        actor: user.email,
        action: 'integration.create',
        resource: 'integration_config',
        resourceId: created.id,
        result: 'success',
        metadata: JSON.stringify({ name, hasSecret: !!secret }),
      },
    })

    return NextResponse.json({
      success: true,
      config: {
        id: created.id,
        name: created.name,
        displayName: created.displayName,
        isActive: created.isActive,
        hasSecret: !!created.encryptedSecret,
        maskedSecret: created.encryptedSecret ? maskSecret(decryptSecret(created.encryptedSecret)) : null,
      },
    }, { status: 201 })
  } catch (error) {
    console.error('IntegrationConfig POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

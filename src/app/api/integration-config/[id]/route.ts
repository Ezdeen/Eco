import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/authorization'
import { decryptSecret, encryptSecret, maskSecret } from '@/lib/crypto'

interface Params {
  params: Promise<{ id: string }>
}

// PATCH /api/integration-config/[id] — Update config (rotate secret, toggle active, update config)
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const auth = await requirePermission('settings:manage')
    if (!auth.authorized) return auth.response

    const { user } = auth
    const { id } = await params
    const body = await request.json()
    const { displayName, description, isActive, config, secret, rotateSecret } = body

    const existing = await db.integrationConfig.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Integration config not found' }, { status: 404 })
    }

    const updateData: any = {
      updatedBy: user.email,
    }

    if (displayName !== undefined) updateData.displayName = displayName
    if (description !== undefined) updateData.description = description
    if (isActive !== undefined) updateData.isActive = isActive
    if (config !== undefined) updateData.config = config ? JSON.stringify(config) : null

    // Secret rotation: either new secret provided or explicit rotate flag
    if (secret) {
      updateData.encryptedSecret = encryptSecret(secret)
      updateData.secretKey = `key-${Date.now()}`
    } else if (rotateSecret && existing.encryptedSecret) {
      // Re-encrypt with new key identifier (forces key rotation)
      const decrypted = decryptSecret(existing.encryptedSecret)
      updateData.encryptedSecret = encryptSecret(decrypted)
      updateData.secretKey = `key-${Date.now()}`
    }

    const updated = await db.integrationConfig.update({
      where: { id },
      data: updateData,
    })

    // Audit log
    await db.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        userId: user.userId,
        actor: user.email,
        action: 'integration.update',
        resource: 'integration_config',
        resourceId: id,
        result: 'success',
        metadata: JSON.stringify({
          name: existing.name,
          secretRotated: !!(secret || rotateSecret),
          isActiveChanged: isActive !== undefined,
        }),
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
        secretKey: updated.secretKey,
        updatedAt: updated.updatedAt,
      },
    })
  } catch (error) {
    console.error('IntegrationConfig PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/integration-config/[id] — Delete config
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requirePermission('settings:manage')
    if (!auth.authorized) return auth.response

    const { user } = auth
    const { id } = await params

    const existing = await db.integrationConfig.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Integration config not found' }, { status: 404 })
    }

    await db.integrationConfig.delete({ where: { id } })

    // Audit log
    await db.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        userId: user.userId,
        actor: user.email,
        action: 'integration.delete',
        resource: 'integration_config',
        resourceId: id,
        result: 'success',
        metadata: JSON.stringify({ name: existing.name }),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('IntegrationConfig DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

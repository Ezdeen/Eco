import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/authorization'
import { generateApiKey } from '@/lib/api-key'

// GET /api/api-keys — List API keys for the current organization (hash never exposed)
export async function GET() {
  try {
    const auth = await requirePermission('settings:manage')
    if (!auth.authorized) return auth.response

    const keys = await db.apiKey.findMany({
      where: { organizationId: auth.user.organizationId },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        isActive: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
        revokedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ keys })
  } catch (error) {
    console.error('ApiKeys GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/api-keys — Create a new API key. The plaintext key is returned ONCE in this
// response only — it is never retrievable again (only its hash is stored).
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('settings:manage')
    if (!auth.authorized) return auth.response

    const body = await request.json()
    const { name, scopes, expiresAt } = body

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'اسم المفتاح مطلوب' }, { status: 400 })
    }

    const { plaintext, prefix, hash } = generateApiKey()

    const key = await db.apiKey.create({
      data: {
        organizationId: auth.user.organizationId!,
        name,
        keyPrefix: prefix,
        keyHash: hash,
        scopes: Array.isArray(scopes) ? scopes.join(',') : 'ingestion:write',
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdBy: auth.user.email,
      },
    })

    await db.auditEvent.create({
      data: {
        organizationId: auth.user.organizationId,
        userId: auth.user.userId,
        actor: auth.user.email,
        action: 'apikey.create',
        resource: 'api_key',
        resourceId: key.id,
        result: 'success',
        metadata: JSON.stringify({ name, prefix }),
      },
    }).catch(() => {})

    return NextResponse.json(
      {
        id: key.id,
        name: key.name,
        prefix: key.keyPrefix,
        plaintextKey: plaintext, // shown ONCE — UI must warn the user to copy it now
        scopes: key.scopes,
        createdAt: key.createdAt,
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('ApiKeys POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

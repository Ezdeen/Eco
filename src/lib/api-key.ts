// API Key management for machine-to-machine authentication (e.g. n8n → platform ingestion)
// Kept separate from human user sessions (JWT cookies) by design — different threat model,
// different lifecycle (long-lived, revocable, scoped, no interactive login).
import crypto from 'crypto'
import { db } from './db'
import type { NextRequest } from 'next/server'

const KEY_PREFIX = 'esg_'

// Generate a new API key. Returns the plaintext key ONCE — caller must show it to the user
// immediately and never persist the plaintext anywhere (only the hash is stored).
export function generateApiKey(): { plaintext: string; prefix: string; hash: string } {
  const raw = crypto.randomBytes(32).toString('hex')
  const plaintext = `${KEY_PREFIX}${raw}`
  const prefix = plaintext.slice(0, 12) // shown in UI so admins can identify which key is which
  const hash = crypto.createHash('sha256').update(plaintext).digest('hex')
  return { plaintext, prefix, hash }
}

export interface ApiKeyContext {
  apiKeyId: string
  organizationId: string
  scopes: string[]
}

// Verify an incoming request's API key (from Authorization: Bearer <key> header).
// Returns null if missing, invalid, expired, or revoked.
export async function verifyApiKey(request: NextRequest): Promise<ApiKeyContext | null> {
  const authHeader = request.headers.get('authorization') || ''
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!match) return null

  const plaintext = match[1].trim()
  if (!plaintext.startsWith(KEY_PREFIX)) return null

  const hash = crypto.createHash('sha256').update(plaintext).digest('hex')

  const key = await db.apiKey.findUnique({ where: { keyHash: hash } })
  if (!key || !key.isActive || key.revokedAt) return null
  if (key.expiresAt && key.expiresAt < new Date()) return null

  // Update last-used timestamp asynchronously (don't block the request on this)
  db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {})

  return {
    apiKeyId: key.id,
    organizationId: key.organizationId,
    scopes: key.scopes.split(',').map((s) => s.trim()),
  }
}

export function hasScope(ctx: ApiKeyContext, scope: string): boolean {
  return ctx.scopes.includes(scope)
}

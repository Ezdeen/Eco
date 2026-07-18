// Crypto library for encrypting/decrypting secrets (AES-256-GCM)
import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // GCM standard IV length
const TAG_LENGTH = 16

// Get encryption key from env (32 bytes = 256 bits)
function getEncryptionKey(): Buffer {
  const key = process.env.SECRET_ENCRYPTION_KEY || process.env.JWT_SECRET || 'dev-only-insecure-do-not-use-in-production-xxxxxxxxxxxxxxxx'
  // Hash to ensure exactly 32 bytes
  return crypto.createHash('sha256').update(key).digest()
}

// Encrypt a secret string
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  // Format: base64(iv + tag + encrypted)
  const combined = Buffer.concat([iv, tag, encrypted])
  return combined.toString('base64')
}

// Decrypt a secret string
export function decryptSecret(encryptedBase64: string): string {
  const key = getEncryptionKey()
  const combined = Buffer.from(encryptedBase64, 'base64')

  const iv = combined.slice(0, IV_LENGTH)
  const tag = combined.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const encrypted = combined.slice(IV_LENGTH + TAG_LENGTH)

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ])

  return decrypted.toString('utf8')
}

// Mask a secret (show last 4 chars only)
export function maskSecret(secret: string): string {
  if (!secret || secret.length < 4) return '****'
  return `****${secret.slice(-4)}`
}

// Verify HMAC signature (for n8n webhooks)
export function verifyHmacSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    )
  } catch {
    return false
  }
}

// Check for replay attack (timestamp within 5 minutes)
export function isReplayAttack(timestamp: string): boolean {
  const ts = parseInt(timestamp)
  if (isNaN(ts)) return true

  const now = Date.now()
  const fiveMinutes = 5 * 60 * 1000

  return Math.abs(now - ts) > fiveMinutes
}

// Rate Limiting Library
// In-memory rate limiter with sliding window
// For production: replace with Redis-backed implementation

interface RateLimitEntry {
  count: number
  resetAt: number
  blocked: boolean
}

const rateLimitMap = new Map<string, RateLimitEntry>()

// Clean expired entries every 2 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitMap.entries()) {
    if (entry.resetAt < now) {
      rateLimitMap.delete(key)
    }
  }
}, 2 * 60 * 1000)

// Pre-configured rate limit profiles
export const RATE_LIMITS = {
  // Auth endpoints — strict limits to prevent brute force
  login: { maxRequests: 50, windowMs: 15 * 60 * 1000 }, // 50 attempts per 15 min (temporarily increased)
  register: { maxRequests: 30, windowMs: 60 * 60 * 1000 }, // 30 per hour (temporarily increased)
  passwordReset: { maxRequests: 3, windowMs: 60 * 60 * 1000 }, // 3 per hour

  // API endpoints — moderate limits
  api: { maxRequests: 100, windowMs: 60 * 1000 }, // 100 per minute
  ingestion: { maxRequests: 30, windowMs: 60 * 1000 }, // 30 per minute
  attestation: { maxRequests: 10, windowMs: 60 * 1000 }, // 10 per minute
  reportDownload: { maxRequests: 20, windowMs: 60 * 1000 }, // 20 per minute

  // Webhooks — limited to known sources
  webhook: { maxRequests: 60, windowMs: 60 * 1000 }, // 60 per minute
} as const

export function rateLimit(
  identifier: string,
  maxRequests: number = 100,
  windowMs: number = 60 * 1000,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const key = `${identifier}`
  const entry = rateLimitMap.get(key)

  if (!entry || entry.resetAt < now) {
    // New window
    rateLimitMap.set(key, {
      count: 1,
      resetAt: now + windowMs,
      blocked: false,
    })
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs }
  }

  if (entry.count >= maxRequests) {
    entry.blocked = true
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt }
}

// Convenience: apply rate limit to a request and return 429 if exceeded
export function checkRateLimit(
  request: Request,
  profile: { maxRequests: number; windowMs: number },
  identifierPrefix: string = '',
): { allowed: boolean; response?: Response } {
  const ip = getClientIP(request)
  const identifier = `${identifierPrefix}:${ip}`

  const result = rateLimit(identifier, profile.maxRequests, profile.windowMs)

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000)
    return {
      allowed: false,
      response: new Response(
        JSON.stringify({
          error: 'تم تجاوز الحد المسموح من الطلبات',
          retryAfter,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(profile.maxRequests),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(result.resetAt),
          },
        },
      ),
    }
  }

  return { allowed: true }
}

// Get client IP from request
export function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  const realIP = request.headers.get('x-real-ip')
  if (realIP) return realIP
  return 'unknown'
}

// === PRIORITY 5: Structured Logging ===
export function structuredLog(
  level: 'info' | 'warn' | 'error' | 'debug',
  message: string,
  context?: {
    correlationId?: string
    userId?: string
    projectId?: string
    action?: string
    [key: string]: any
  },
) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  }
  const logLine = JSON.stringify(logEntry)

  switch (level) {
    case 'error':
      console.error(logLine)
      break
    case 'warn':
      console.warn(logLine)
      break
    case 'debug':
      if (process.env.NODE_ENV === 'development') {
        console.debug(logLine)
      }
      break
    default:
      console.log(logLine)
  }
}

// Generate correlation ID for request tracing
export function generateCorrelationId(): string {
  return `corr-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`
}

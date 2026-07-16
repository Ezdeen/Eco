// Rate Limiting Library
// Simple in-memory rate limiter (for production use Redis)
// Limits requests per IP per time window

interface RateLimitEntry {
  count: number
  resetAt: number
}

const rateLimitMap = new Map<string, RateLimitEntry>()

// Clean expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitMap.entries()) {
    if (entry.resetAt < now) {
      rateLimitMap.delete(key)
    }
  }
}, 5 * 60 * 1000)

export function rateLimit(
  identifier: string,
  maxRequests: number = 100,
  windowMs: number = 60 * 1000, // 1 minute default
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const entry = rateLimitMap.get(identifier)

  if (!entry || entry.resetAt < now) {
    // New window
    rateLimitMap.set(identifier, {
      count: 1,
      resetAt: now + windowMs,
    })
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs }
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt }
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

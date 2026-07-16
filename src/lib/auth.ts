// Auth library - JWT-based authentication with HTTP-only cookies
import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
import { db } from './db'
import { cookies } from 'next/headers'

const SECRET_KEY = new TextEncoder().encode(
  process.env.JWT_SECRET || 'esg-solar-platform-secret-key-2026-change-in-production',
)

const COOKIE_NAME = 'esg_session'
const SESSION_DURATION = 7 * 24 * 60 * 60 // 7 days in seconds

export interface SessionPayload {
  userId: string
  email: string
  name: string
  role: string
  organizationId?: string
  membershipId?: string
}

// Hash a password
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(12)
  return bcrypt.hash(password, salt)
}

// Verify a password against a hash
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash)
  } catch {
    return false
  }
}

// Create a JWT token
export async function createToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION}s`)
    .setSubject(payload.userId)
    .sign(SECRET_KEY)
}

// Verify a JWT token
export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY)
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

// Set session cookie (for use in API routes)
export async function setSessionCookie(token: string) {
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION,
    path: '/',
  })
}

// Clear session cookie
export async function clearSessionCookie() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}

// Get the session token from cookies
export async function getSessionToken(): Promise<string | undefined> {
  const cookieStore = await cookies()
  return cookieStore.get(COOKIE_NAME)?.value
}

// Get the current authenticated user (server-side, for API routes)
export async function getCurrentUser(): Promise<SessionPayload | null> {
  const token = await getSessionToken()
  if (!token) return null
  return verifyToken(token)
}

// Authenticate a user with email and password
export async function authenticateUser(email: string, password: string): Promise<SessionPayload | null> {
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: {
      memberships: {
        where: { status: 'active' },
        include: { organization: true },
        take: 1,
      },
    },
  })

  if (!user || !user.passwordHash) {
    return null
  }

  const isValid = await verifyPassword(password, user.passwordHash)
  if (!isValid) {
    return null
  }

  const membership = user.memberships[0]

  return {
    userId: user.id,
    email: user.email,
    name: user.nameAr || user.name || user.email,
    role: membership?.role || user.role,
    organizationId: membership?.organizationId,
    membershipId: membership?.id,
  }
}

// Constants for client-side use
export const AUTH_COOKIE_NAME = COOKIE_NAME
export const AUTH_SESSION_DURATION = SESSION_DURATION

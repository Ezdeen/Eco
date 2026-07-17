import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import { db } from '@/lib/db'
import { compare } from 'bcryptjs'

// ==========================================
// 1. دالة لجلب المفتاح في وقت التشغيل (Runtime)
// ==========================================
function getSecretKey() {
  const JWT_SECRET_STRING = process.env.JWT_SECRET;

  if (!JWT_SECRET_STRING || JWT_SECRET_STRING.trim() === '') {
    throw new Error(
      'FATAL ERROR: JWT_SECRET is missing from environment variables. ' +
      'Please set JWT_SECRET=esg-solar-platform-jwt-secret-2026-stable-do-not-change.'
    );
  }

  return new TextEncoder().encode(JWT_SECRET_STRING);
}

// ==========================================
// 2. دوال المصادقة والجلسات
// ==========================================

export async function authenticateUser(email: string, password: string) {
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  if (!user || !user.password) {
    return null;
  }

  const isPasswordValid = await compare(password, user.password);

  if (!isPasswordValid) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organizationId: user.organizationId,
  };
}

export async function createToken(session: any) {
  // يتم استدعاء المفتاح هنا، مما يحمي عملية البناء (Build) من الفشل
  const secretKey = getSecretKey();

  const token = await new SignJWT(session)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secretKey);

  return token;
}

export async function setSessionCookie(token: string) {
  cookies().set('session_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  });
}

export async function verifyToken(token: string) {
  try {
    // يتم استدعاء المفتاح هنا أيضاً
    const secretKey = getSecretKey();
    
    const { payload } = await jwtVerify(token, secretKey);
    return payload;
  } catch (error) {
    return null;
  }
}

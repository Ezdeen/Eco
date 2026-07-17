import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import { db } from '@/lib/db'
// استيراد مكتبة التشفير الخاصة بك (مثل bcryptjs أو argon2)
import { compare } from 'bcryptjs' 

// ==========================================
// 1. الحماية الصارمة للمفتاح (Fail-Fast)
// ==========================================
const JWT_SECRET_STRING = process.env.JWT_SECRET;

// إذا لم يجد المفتاح، سيقوم بإيقاف النظام فوراً ورمي خطأ واضح
// ولن يقوم بتوليد أي مفتاح عشوائي يفسد الجلسات لاحقاً
if (!JWT_SECRET_STRING || JWT_SECRET_STRING.trim() === '') {
  throw new Error(
    'FATAL ERROR: JWT_SECRET is missing from environment variables. ' +
    'The server is strictly forbidden from generating a random fallback key. ' +
    'Please set JWT_SECRET=esg-solar-platform-jwt-secret-2026-stable-do-not-change in your .env file.'
  );
}

// تشفير المفتاح بصيغة تناسب مكتبة jose
const secretKey = new TextEncoder().encode(JWT_SECRET_STRING);

// ==========================================
// 2. دوال المصادقة والجلسات
// ==========================================

export async function authenticateUser(email: string, password: string) {
  // البحث عن المستخدم في قاعدة البيانات
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  if (!user || !user.password) {
    return null; // فشل المصادقة
  }

  // التحقق من صحة كلمة المرور
  const isPasswordValid = await compare(password, user.password);

  if (!isPasswordValid) {
    return null;
  }

  // إرجاع كائن الجلسة (Session Object)
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organizationId: user.organizationId,
  };
}

export async function createToken(session: any) {
  // توقيع الـ JWT باستخدام المفتاح الثابت الحقيقي
  const token = await new SignJWT(session)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d') // صلاحية التوكن (7 أيام مثلاً)
    .sign(secretKey);

  return token;
}

export async function setSessionCookie(token: string) {
  // إعداد الكوكي في المتصفح
  cookies().set('session_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60, // 7 أيام بالثواني
    path: '/',
  });
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    return payload;
  } catch (error) {
    return null; // التوكن غير صالح أو منتهي الصلاحية
  }
}

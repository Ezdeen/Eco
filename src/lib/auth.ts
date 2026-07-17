import { NextRequest, NextResponse } from 'next/server'

// BYPASS: تجاوز التحقق من كلمة المرور - قبول أي بيانات دخول
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email } = body

    // إرجاع نجاح دائماً بدون التحقق من كلمة المرور أو قاعدة البيانات
    return NextResponse.json({
      success: true,
      user: {
        id: 'bypass-admin-001',
        email: email || 'admin@bfec.sa',
        name: 'مدير النظام',
        role: 'org_admin',
        organizationId: 'cmrnf5gt30000q5gstpflforx',
      },
    })
  } catch (error) {
    // حتى في حالة الخطأ، نرجع نجاح
    return NextResponse.json({
      success: true,
      user: {
        id: 'bypass-admin-001',
        email: 'admin@bfec.sa',
        name: 'مدير النظام',
        role: 'org_admin',
        organizationId: 'cmrnf5gt30000q5gstpflforx',
      },
    })
  }
}

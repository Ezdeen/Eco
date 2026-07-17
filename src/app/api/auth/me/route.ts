import { NextResponse } from 'next/server'

// BYPASS: تجاوز التحقق من الجلسة - إرجاع مستخدم افتراضي دائماً
export async function GET() {
  return NextResponse.json({
    user: {
      id: 'bypass-admin-001',
      email: 'admin@bfec.sa',
      name: 'مدير النظام',
      nameAr: 'مدير النظام',
      role: 'org_admin',
      preferredLang: 'ar',
      preferredTz: 'Asia/Riyadh',
      mfaEnabled: false,
      membership: {
        id: 'mem-001',
        role: 'org_admin',
        organization: {
          id: 'org-001',
          name: 'BrightFuture Energy',
          nameAr: 'شركة المستقبل المشرق للطاقة',
          code: 'BFEC',
          currency: 'SAR',
          timezone: 'Asia/Riyadh',
          language: 'ar',
        },
      },
    },
  })
}

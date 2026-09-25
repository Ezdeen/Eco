import { NextRequest, NextResponse } from 'next/server'

// Public self-registration is disabled entirely. With the 3-role system
// (org_admin / project_manager / data_entry), every user account must be created
// deliberately by an org_admin via /api/users (Admin → إدارة المستخدمين) — an
// open sign-up endpoint would let anyone create an account with organization access,
// bypassing the project-manager data-isolation and role assignment controls.
export async function POST(request: NextRequest) {
  return NextResponse.json(
    { error: 'التسجيل الذاتي غير متاح. يرجى التواصل مع مدير المؤسسة لإنشاء حساب جديد.' },
    { status: 403 },
  )
}

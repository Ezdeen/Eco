import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/authorization'

// GET /api/organization - جلب بيانات المؤسسة الحالية
export async function GET() {
  try {
    const auth = await requirePermission('settings:manage')
    if (!auth.authorized) return auth.response

    const { user } = auth
    if (!user.organizationId) {
      return NextResponse.json({ error: 'لا توجد مؤسسة مرتبطة بهذا الحساب' }, { status: 404 })
    }

    const organization = await db.organization.findUnique({
      where: { id: user.organizationId },
    })

    if (!organization) {
      return NextResponse.json({ error: 'المؤسسة غير موجودة' }, { status: 404 })
    }

    return NextResponse.json({ organization })
  } catch (error) {
    console.error('GET /api/organization error:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء جلب بيانات المؤسسة' }, { status: 500 })
  }
}

// PATCH /api/organization - تحديث اسم/رمز المؤسسة وإعداداتها العامة
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requirePermission('settings:manage')
    if (!auth.authorized) return auth.response

    const { user } = auth
    if (!user.organizationId) {
      return NextResponse.json({ error: 'لا توجد مؤسسة مرتبطة بهذا الحساب' }, { status: 404 })
    }

    const body = await request.json()
    const { name, nameAr, code, country, currency, timezone, language } = body

    const updateData: Record<string, string> = {}

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return NextResponse.json({ error: 'اسم المؤسسة مطلوب' }, { status: 400 })
      }
      updateData.name = name.trim()
    }

    if (nameAr !== undefined) {
      updateData.nameAr = typeof nameAr === 'string' ? nameAr.trim() : nameAr
    }

    if (code !== undefined) {
      if (typeof code !== 'string' || !code.trim()) {
        return NextResponse.json({ error: 'رمز المؤسسة مطلوب' }, { status: 400 })
      }
      const normalizedCode = code.trim().toUpperCase()

      // التأكد أن الرمز غير مستخدم من مؤسسة أخرى
      const existing = await db.organization.findUnique({ where: { code: normalizedCode } })
      if (existing && existing.id !== user.organizationId) {
        return NextResponse.json({ error: 'هذا الرمز مستخدم بالفعل من مؤسسة أخرى' }, { status: 409 })
      }
      updateData.code = normalizedCode
    }

    if (country !== undefined) updateData.country = country
    if (currency !== undefined) updateData.currency = currency
    if (timezone !== undefined) updateData.timezone = timezone
    if (language !== undefined) updateData.language = language

    const organization = await db.organization.update({
      where: { id: user.organizationId },
      data: updateData,
    })

    return NextResponse.json({ organization })
  } catch (error: any) {
    // خطأ Prisma الخاص بانتهاك قيد Unique (احتياطاً لأي سباق تزامن)
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'هذا الرمز مستخدم بالفعل من مؤسسة أخرى' }, { status: 409 })
    }
    console.error('PATCH /api/organization error:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء حفظ إعدادات المؤسسة' }, { status: 500 })
  }
}

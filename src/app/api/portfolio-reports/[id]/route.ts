import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/authorization'

interface Params {
  params: Promise<{ id: string }>
}

// GET /api/portfolio-reports/[id]
// يُعيد اللقطة الكاملة المحفوظة (المؤشرات الثمانية + التعريفات + القيود) كما جُمِّدت
// وقت الإصدار، دون إعادة حسابها من البيانات الحالية.
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const auth = await requirePermission('portfolio:read')
    if (!auth.authorized) return auth.response

    const report = await db.portfolioReport.findUnique({ where: { id } })
    if (!report) {
      return NextResponse.json({ error: 'التقرير غير موجود' }, { status: 404 })
    }
    if (report.organizationId !== auth.user.organizationId) {
      return NextResponse.json({ error: 'لا يمكنك الوصول لهذا التقرير' }, { status: 403 })
    }

    return NextResponse.json({
      id: report.id,
      title: report.title,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      status: report.status,
      createdAt: report.createdAt,
      createdBy: report.createdBy,
      methodologyNote: report.methodologyNote,
      projectIds: JSON.parse(report.projectIds),
      metrics: JSON.parse(report.metrics),
    })
  } catch (error: any) {
    console.error('Portfolio report GET error:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء جلب التقرير' }, { status: 500 })
  }
}

// PATCH /api/portfolio-reports/[id]
// تغيير الحالة فقط (draft → published). لا يُعيد حساب المؤشرات — النشر يُثبِّت اللقطة
// كما هي، بنفس مبدأ عدم تعديل AttestationBatch بعد إصداره.
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const auth = await requirePermission('portfolio:read')
    if (!auth.authorized) return auth.response

    const existing = await db.portfolioReport.findUnique({ where: { id }, select: { organizationId: true, status: true } })
    if (!existing) {
      return NextResponse.json({ error: 'التقرير غير موجود' }, { status: 404 })
    }
    if (existing.organizationId !== auth.user.organizationId) {
      return NextResponse.json({ error: 'لا يمكنك تعديل هذا التقرير' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    if (body?.status !== 'published') {
      return NextResponse.json({ error: 'الحالة المطلوبة غير مدعومة (published فقط)' }, { status: 400 })
    }

    const updated = await db.portfolioReport.update({
      where: { id },
      data: { status: 'published' },
    })

    return NextResponse.json({ id: updated.id, status: updated.status })
  } catch (error: any) {
    console.error('Portfolio report PATCH error:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء تحديث التقرير' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const auth = await requirePermission('portfolio:read')
    if (!auth.authorized) return auth.response

    const existing = await db.portfolioReport.findUnique({ where: { id }, select: { organizationId: true } })
    if (!existing) {
      return NextResponse.json({ error: 'التقرير غير موجود' }, { status: 404 })
    }
    if (existing.organizationId !== auth.user.organizationId) {
      return NextResponse.json({ error: 'لا يمكنك حذف هذا التقرير' }, { status: 403 })
    }

    await db.portfolioReport.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Portfolio report DELETE error:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء حذف التقرير' }, { status: 500 })
  }
}

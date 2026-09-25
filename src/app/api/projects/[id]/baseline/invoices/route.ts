import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectAccess } from '@/lib/authorization'
import { createProjectBaselineInvoiceSchema } from '@/lib/validation'

interface Params {
  params: Promise<{ id: string }>
}

// الحد الأقصى لعدد الفواتير التاريخية لكل مشروع/فئة (~سنتان من الفواتير الشهرية)
const MAX_INVOICES_PER_CATEGORY = 24

// ============== فواتير خط الأساس التاريخية (الشهر/السنة/المبلغ) ==============
//
// GET  /api/projects/[id]/baseline/invoices?category=...  → قائمة الفواتير (لعرضها كجدول)
// POST /api/projects/[id]/baseline/invoices                → إضافة فاتورة واحدة

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id: projectId } = await params
    const auth = await requireProjectAccess(projectId, 'project:read')
    if (!auth.authorized) return auth.response

    const category = request.nextUrl.searchParams.get('category') || undefined

    const invoices = await db.projectBaselineInvoice.findMany({
      where: { projectId, ...(category ? { category } : {}) },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    })

    return NextResponse.json({ invoices })
  } catch (error) {
    console.error('Failed to fetch baseline invoices:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء جلب الفواتير' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id: projectId } = await params
    const auth = await requireProjectAccess(projectId, 'calculation:run')
    if (!auth.authorized) return auth.response

    const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true, organizationId: true } })
    if (!project) return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'صيغة JSON غير صالحة' }, { status: 400 })
    }

    const parsed = createProjectBaselineInvoiceSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'بيانات الفاتورة غير صحيحة', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const data = parsed.data

    const existingCount = await db.projectBaselineInvoice.count({
      where: { projectId, category: data.category },
    })
    if (existingCount >= MAX_INVOICES_PER_CATEGORY) {
      return NextResponse.json(
        { error: `الحد الأقصى ${MAX_INVOICES_PER_CATEGORY} فاتورة لكل فئة لهذا المشروع` },
        { status: 400 },
      )
    }

    const duplicate = await db.projectBaselineInvoice.findUnique({
      where: {
        projectId_category_month_year: {
          projectId,
          category: data.category,
          month: data.month,
          year: data.year,
        },
      },
    })
    if (duplicate) {
      return NextResponse.json(
        { error: 'توجد فاتورة مُسجَّلة مسبقًا لهذا الشهر/السنة - يمكنك تعديلها بدل إضافة فاتورة جديدة' },
        { status: 409 },
      )
    }

    const invoice = await db.projectBaselineInvoice.create({
      data: {
        projectId,
        category: data.category,
        month: data.month,
        year: data.year,
        amount: data.amount,
        createdBy: auth.user.userId,
      },
    })

    await db.auditEvent.create({
      data: {
        organizationId: project.organizationId,
        projectId,
        userId: auth.user.userId,
        actor: auth.user.email,
        action: 'project.baseline_invoice.create',
        resource: 'project_baseline_invoice',
        resourceId: invoice.id,
        result: 'success',
        metadata: JSON.stringify({ category: data.category, month: data.month, year: data.year, amount: data.amount }),
      },
    })

    return NextResponse.json({ success: true, invoice }, { status: 201 })
  } catch (error) {
    console.error('Failed to create baseline invoice:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء إضافة الفاتورة' }, { status: 500 })
  }
}

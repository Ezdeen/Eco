import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectAccess } from '@/lib/authorization'
import { updateProjectBaselineInvoiceSchema } from '@/lib/validation'

interface Params {
  params: Promise<{ id: string; invoiceId: string }>
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id: projectId, invoiceId } = await params
    const auth = await requireProjectAccess(projectId, 'calculation:run')
    if (!auth.authorized) return auth.response

    const existing = await db.projectBaselineInvoice.findUnique({ where: { id: invoiceId } })
    if (!existing || existing.projectId !== projectId) {
      return NextResponse.json({ error: 'الفاتورة غير موجودة لهذا المشروع' }, { status: 404 })
    }

    const project = await db.project.findUnique({ where: { id: projectId }, select: { organizationId: true } })
    if (!project) return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'صيغة JSON غير صالحة' }, { status: 400 })
    }

    const parsed = updateProjectBaselineInvoiceSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'بيانات التحديث غير صحيحة', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const data = parsed.data

    const nextMonth = data.month ?? existing.month
    const nextYear = data.year ?? existing.year

    if (nextMonth !== existing.month || nextYear !== existing.year) {
      const duplicate = await db.projectBaselineInvoice.findUnique({
        where: {
          projectId_category_month_year: {
            projectId,
            category: existing.category,
            month: nextMonth,
            year: nextYear,
          },
        },
      })
      if (duplicate && duplicate.id !== invoiceId) {
        return NextResponse.json(
          { error: 'توجد فاتورة أخرى مُسجَّلة مسبقًا لهذا الشهر/السنة' },
          { status: 409 },
        )
      }
    }

    const updated = await db.projectBaselineInvoice.update({
      where: { id: invoiceId },
      data: {
        month: data.month ?? undefined,
        year: data.year ?? undefined,
        amount: data.amount ?? undefined,
      },
    })

    await db.auditEvent.create({
      data: {
        organizationId: project.organizationId,
        projectId,
        userId: auth.user.userId,
        actor: auth.user.email,
        action: 'project.baseline_invoice.update',
        resource: 'project_baseline_invoice',
        resourceId: invoiceId,
        result: 'success',
        metadata: JSON.stringify({ changedFields: Object.keys(data) }),
      },
    })

    return NextResponse.json({ success: true, invoice: updated })
  } catch (error) {
    console.error('Failed to update baseline invoice:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء تحديث الفاتورة' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id: projectId, invoiceId } = await params
    const auth = await requireProjectAccess(projectId, 'calculation:run')
    if (!auth.authorized) return auth.response

    const existing = await db.projectBaselineInvoice.findUnique({ where: { id: invoiceId } })
    if (!existing || existing.projectId !== projectId) {
      return NextResponse.json({ error: 'الفاتورة غير موجودة لهذا المشروع' }, { status: 404 })
    }

    const project = await db.project.findUnique({ where: { id: projectId }, select: { organizationId: true } })

    await db.projectBaselineInvoice.delete({ where: { id: invoiceId } })

    if (project) {
      await db.auditEvent.create({
        data: {
          organizationId: project.organizationId,
          projectId,
          userId: auth.user.userId,
          actor: auth.user.email,
          action: 'project.baseline_invoice.delete',
          resource: 'project_baseline_invoice',
          resourceId: invoiceId,
          result: 'success',
          metadata: JSON.stringify({ category: existing.category, month: existing.month, year: existing.year, amount: existing.amount }),
        },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete baseline invoice:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء حذف الفاتورة' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/authorization'

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('report:delete')
    if (!auth.authorized) return auth.response

    const body = await request.json().catch(() => null)
    const retentionDays = typeof body?.retentionDays === 'number' ? body.retentionDays : 90
    const mode = body?.mode === 'delete' ? 'delete' : 'archive'
    const dryRun = body?.dryRun === true

    if (!Number.isFinite(retentionDays) || retentionDays < 1) {
      return NextResponse.json({ error: 'عدد الأيام غير صالح' }, { status: 400 })
    }

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

    const reportsToProcess = await db.report.findMany({
      where: {
        createdAt: { lt: cutoffDate },
        status: { not: 'archived' },
        project: { organizationId: auth.user.organizationId },
      },
      select: { id: true, title: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })

    if (reportsToProcess.length === 0) {
      return NextResponse.json({
        success: true,
        mode,
        retentionDays,
        processed: 0,
        message: 'لا توجد تقارير قديمة مطابقة للشروط',
      })
    }

    if (dryRun) {
      return NextResponse.json({
        success: true,
        mode,
        retentionDays,
        processed: reportsToProcess.length,
        preview: reportsToProcess.slice(0, 10),
        message: 'معاينة جاهزة دون تنفيذ أي تغيير',
      })
    }

    const reportIds = reportsToProcess.map((report) => report.id)

    if (mode === 'delete') {
      await db.report.deleteMany({
        where: {
          id: { in: reportIds },
          project: { organizationId: auth.user.organizationId },
        },
      })
    } else {
      await db.report.updateMany({
        where: {
          id: { in: reportIds },
          project: { organizationId: auth.user.organizationId },
        },
        data: { status: 'archived' },
      })
    }

    return NextResponse.json({
      success: true,
      mode,
      retentionDays,
      processed: reportIds.length,
      message: mode === 'delete' ? 'تم حذف التقارير القديمة بنجاح' : 'تم أرشفة التقارير القديمة بنجاح',
    })
  } catch (error: any) {
    console.error('Cleanup reports error:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء تنظيف التقارير' }, { status: 500 })
  }
}

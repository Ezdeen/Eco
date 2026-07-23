import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/authorization'

interface Params {
  params: Promise<{ id: string }>
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const auth = await requirePermission('report:delete')
    if (!auth.authorized) return auth.response

    const existingReport = await db.report.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true,
        status: true,
        project: {
          select: {
            organizationId: true,
          },
        },
      },
    })

    if (!existingReport) {
      return NextResponse.json({ error: 'التقرير غير موجود' }, { status: 404 })
    }

    if (existingReport.project.organizationId !== auth.user.organizationId) {
      return NextResponse.json({ error: 'لا يمكنك حذف هذا التقرير' }, { status: 403 })
    }

    await db.report.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Failed to delete report:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء حذف التقرير' }, { status: 500 })
  }
}

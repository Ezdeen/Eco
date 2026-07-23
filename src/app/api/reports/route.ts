import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/authorization'

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('project:read')
    if (!auth.authorized) return auth.response

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const status = searchParams.get('status')

    const where: any = {}
    if (projectId) where.projectId = projectId
    if (status) where.status = status

    const reports = await db.report.findMany({
      where,
      include: { project: { select: { name: true, nameAr: true, code: true } } },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ reports, total: reports.length })
  } catch (error) {
    console.error('Reports API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('report:create')
    if (!auth.authorized) return auth.response

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'بيانات التقرير غير صالحة' }, { status: 400 })
    }

    const { projectId, title, reportType, periodStart, periodEnd, summary } = body

    if (
      typeof projectId !== 'string' ||
      typeof title !== 'string' ||
      !title.trim() ||
      typeof periodStart !== 'string' ||
      typeof periodEnd !== 'string'
    ) {
      return NextResponse.json({ error: 'المشروع والعنوان والفترة مطلوبة' }, { status: 400 })
    }

    const start = new Date(periodStart)
    const end = new Date(periodEnd)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      return NextResponse.json({ error: 'الفترة الزمنية غير صالحة' }, { status: 400 })
    }

    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { organizationId: true },
    })

    if (!project) {
      return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })
    }
    if (project.organizationId !== auth.user.organizationId) {
      return NextResponse.json({ error: 'لا يمكنك إنشاء تقرير لهذا المشروع' }, { status: 403 })
    }

    const report = await db.report.create({
      data: {
        projectId,
        title: title.trim(),
        reportType: reportType || 'comprehensive',
        status: 'draft',
        periodStart: start,
        periodEnd: end,
        summary: typeof summary === 'string' && summary.trim() ? summary.trim() : null,
        version: 1,
      },
      include: { project: { select: { name: true, nameAr: true, code: true } } },
    })

    return NextResponse.json(report, { status: 201 })
  } catch (error) {
    console.error('Create report error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

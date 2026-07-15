import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
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
    const body = await request.json()
    const { projectId, title, reportType, periodStart, periodEnd, summary } = body

    const report = await db.report.create({
      data: {
        projectId,
        title,
        reportType: reportType || 'comprehensive',
        status: 'draft',
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        summary,
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

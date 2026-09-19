import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAccess } from '@/lib/authorization'
import { checkWaterPeriodEligibility } from '@/lib/water-comparison'
import { db } from '@/lib/db'

// GET /api/irrigation/eligibility?projectId=...&periodStart=...&periodEnd=...
// فحص سريع (بدون إنشاء أي سجل) لأهلية فترة/مشروع ري ذكي لإصدار "إثبات استدامة مائية"،
// بناءً على مدى مطابقة الاستهلاك الفعلي (V_actual من عداد المياه الموثّق) للاحتياج
// المستهدف (V_target من ETo×Kc(NDVI)) لنفس الفترة. نظير /api/attestations/eligibility
// المخصص للطاقة الشمسية، لكن مبني على checkWaterPeriodEligibility بدل checkPeriodEligibility.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const periodStart = searchParams.get('periodStart')
    const periodEnd = searchParams.get('periodEnd')

    if (!projectId || !periodStart || !periodEnd) {
      return NextResponse.json(
        { error: 'projectId و periodStart و periodEnd مطلوبة' },
        { status: 400 },
      )
    }

    const access = await requireProjectAccess(projectId, 'reading:read')
    if (!access.authorized) return access.response

    const project = await db.project.findUnique({ where: { id: projectId }, select: { projectType: true } })
    if (!project) return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })
    if (project.projectType !== 'smart_irrigation') {
      return NextResponse.json(
        { error: 'هذا المشروع ليس من نوع الري الذكي (smart_irrigation) - استخدم /api/attestations/eligibility بدلاً منه' },
        { status: 400 },
      )
    }

    const start = new Date(periodStart)
    const end = new Date(periodEnd)
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
      return NextResponse.json({ error: 'فترة زمنية غير صالحة' }, { status: 400 })
    }

    const eligibility = await checkWaterPeriodEligibility(projectId, start, end)
    return NextResponse.json({ eligibility })
  } catch (error) {
    console.error('Water eligibility GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

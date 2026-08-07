import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAccess } from '@/lib/authorization'
import { checkPeriodEligibility } from '@/lib/space-comparison'

// GET /api/attestations/eligibility?projectId=...&periodStart=...&periodEnd=...
// فحص سريع (بدون إنشاء أي سجل) لأهلية فترة/مشروع لإصدار إثبات كربون، بناءً على مدى
// توافق القراءات الأرضية مع البيانات الفضائية لنفس الفترة. تُستخدم من الواجهة لعرض
// حالة الأهلية للمستخدم قبل تفعيل زر "إصدار ملف الإثبات".
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

    const access = await requireProjectAccess(projectId, 'attestation:submit')
    if (!access.authorized) return access.response

    const start = new Date(periodStart)
    const end = new Date(periodEnd)
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
      return NextResponse.json({ error: 'فترة زمنية غير صالحة' }, { status: 400 })
    }

    const eligibility = await checkPeriodEligibility(projectId, start, end)
    return NextResponse.json({ eligibility })
  } catch (error) {
    console.error('Attestation eligibility GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

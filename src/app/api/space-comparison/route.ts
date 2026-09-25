import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/authorization'
import { runGroundSpaceComparisonBatch, ALERT_LABELS_AR } from '@/lib/space-comparison'

// GET /api/space-comparison
// يعيد نتائج مقارنة البيانات الأرضية بالبيانات الفضائية (GroundSpaceComparison)، مع ملخص
// إحصائي (عدد كل نوع تنبيه، متوسط الكفاءة) لعرضه في مركز المراقبة.
// Query params: projectId, assessment (normal|overstated|understated|dust_accumulation|efficiency_loss), limit
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('reading:read')
    if (!auth.authorized) return auth.response
    const { user } = auth

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId') || undefined
    const assessment = searchParams.get('assessment') || undefined
    const limitParam = parseInt(searchParams.get('limit') || '50', 10)
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50

    // project_manager محصور بمشاريعه فقط، بنفس نمط بقية أقسام المنصة
    let projectFilter: any = {}
    if (user.role === 'project_manager') {
      const managedProjects = await db.project.findMany({
        where: { managerId: user.userId },
        select: { id: true },
      })
      const ids = managedProjects.map((p) => p.id)
      projectFilter = { projectId: { in: ids.length > 0 ? ids : ['__none__'] } }
    }

    const where: any = {
      ...projectFilter,
      ...(projectId ? { projectId } : {}),
      ...(assessment ? { assessment } : {}),
    }

    const [comparisons, allForStats] = await Promise.all([
      db.groundSpaceComparison.findMany({
        where,
        include: { project: { select: { name: true, nameAr: true, code: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      db.groundSpaceComparison.findMany({
        where: { ...projectFilter, ...(projectId ? { projectId } : {}) },
        select: { assessment: true, efficiencyRatio: true },
      }),
    ])

    const stats = {
      total: allForStats.length,
      normal: allForStats.filter((c) => c.assessment === 'normal').length,
      overstated: allForStats.filter((c) => c.assessment === 'overstated').length,
      understated: allForStats.filter((c) => c.assessment === 'understated').length,
      dustAccumulation: allForStats.filter((c) => c.assessment === 'dust_accumulation').length,
      efficiencyLoss: allForStats.filter((c) => c.assessment === 'efficiency_loss').length,
      avgEfficiencyRatio:
        allForStats.length > 0
          ? allForStats.reduce((s, c) => s + c.efficiencyRatio, 0) / allForStats.length
          : null,
    }

    return NextResponse.json({
      comparisons,
      stats,
      alertLabels: ALERT_LABELS_AR,
    })
  } catch (error: any) {
    console.error('Space comparison GET error:', error)
    return NextResponse.json({ error: error?.message || 'حدث خطأ أثناء جلب نتائج المقارنة' }, { status: 500 })
  }
}

// POST /api/space-comparison
// تشغيل يدوي فوري للمقارنة على القراءات الصالحة التي لم تُقارَن بعد (اختياريًا لمشروع محدد).
// يتطلب صلاحية إدارة الإعدادات (settings:manage) — نفس صلاحية تشغيل مزامنة البيانات الفضائية يدويًا.
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('settings:manage')
    if (!auth.authorized) return auth.response

    const body = await request.json().catch(() => ({}))
    const projectId = typeof body?.projectId === 'string' ? body.projectId : undefined
    const limit = typeof body?.limit === 'number' ? body.limit : undefined

    const result = await runGroundSpaceComparisonBatch({ projectId, limit })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Space comparison POST error:', error)
    return NextResponse.json({ error: error?.message || 'حدث خطأ أثناء تشغيل المقارنة' }, { status: 500 })
  }
}

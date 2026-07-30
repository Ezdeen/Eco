import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/authorization'

// GET /api/space-data — يعيد قائمة القراءات الفضائية مع دعم الفلترة والفرز والصفحات
// Query params:
//   projectId   — تصفية حسب مشروع معيّن
//   sourceKey   — space_nasa_power | space_gee | space_cams
//   dataset     — Sentinel-2 | Sentinel-5P | Landsat-8/9 | MODIS | NASA-POWER | CAMS
//   dateFrom / dateTo — نطاق تاريخ observedAt (ISO date)
//   sortBy      — observedAt | fetchedAt | projectName (افتراضي: observedAt)
//   sortDir     — asc | desc (افتراضي: desc)
//   page, pageSize
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('reading:read')
    if (!auth.authorized) return auth.response

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId') || undefined
    const sourceKey = searchParams.get('sourceKey') || undefined
    const dataset = searchParams.get('dataset') || undefined
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const sortBy = searchParams.get('sortBy') || 'observedAt'
    const sortDir = (searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc'
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10)))

    const user = auth.user

    // project_manager محصور بمشاريعه فقط (نفس نمط بقية الأقسام في المنصة)
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
      ...(sourceKey ? { sourceKey } : {}),
      ...(dataset ? { dataset } : {}),
      ...(dateFrom || dateTo
        ? {
            observedAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo + 'T23:59:59.999Z') } : {}),
            },
          }
        : {}),
    }

    const orderBy: any =
      sortBy === 'fetchedAt' ? { fetchedAt: sortDir } : { observedAt: sortDir }

    const [total, rows] = await Promise.all([
      db.spaceDataObservation.count({ where }),
      db.spaceDataObservation.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          project: { select: { id: true, name: true, nameAr: true, projectType: true } },
        },
      }),
    ])

    // فرز حسب اسم المشروع يتم بعد الجلب (Prisma لا يدعم orderBy على حقل علاقة نصي مباشرة بسهولة هنا مع تعدد اللغات)
    let result = rows
    if (sortBy === 'projectName') {
      result = [...rows].sort((a, b) => {
        const an = a.project.nameAr || a.project.name
        const bn = b.project.nameAr || b.project.name
        return sortDir === 'asc' ? an.localeCompare(bn, 'ar') : bn.localeCompare(an, 'ar')
      })
    }

    const data = result.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      projectName: r.project.nameAr || r.project.name,
      projectType: r.project.projectType,
      sourceKey: r.sourceKey,
      dataset: r.dataset,
      observedAt: r.observedAt.toISOString(),
      fetchedAt: r.fetchedAt.toISOString(),
      fetchRun: r.fetchRun,
      latitude: r.latitude,
      longitude: r.longitude,
      ghiWm2: r.ghiWm2,
      dniWm2: r.dniWm2,
      difWm2: r.difWm2,
      aod: r.aod,
      temperatureC: r.temperatureC,
      windSpeedMs: r.windSpeedMs,
      humidityPct: r.humidityPct,
      cloudCoverPct: r.cloudCoverPct,
      precipitationMm: r.precipitationMm,
      ndvi: r.ndvi,
      evi: r.evi,
      lstC: r.lstC,
      no2ColumnMolM2: r.no2ColumnMolM2,
      aerosolIndex: r.aerosolIndex,
      qualityFlag: r.qualityFlag,
    }))

    // ملخص سريع لآخر تشغيلات المزامنة (لعرضه أعلى الجدول)
    const lastRuns = await db.spaceDataSyncRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 3,
    })

    return NextResponse.json({
      data,
      pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
      lastRuns: lastRuns.map((r) => ({
        id: r.id,
        runLabel: r.runLabel,
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() || null,
        status: r.status,
        observationsCreated: r.observationsCreated,
        projectsOk: r.projectsOk,
        projectsFailed: r.projectsFailed,
      })),
    })
  } catch (error: any) {
    console.error('Space data GET error:', error)
    return NextResponse.json({ error: error?.message || 'حدث خطأ أثناء جلب البيانات' }, { status: 500 })
  }
}

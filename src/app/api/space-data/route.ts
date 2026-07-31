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

    const allowedSourceKeys = ['space_cdse', 'open_meteo']
    const spaceWhere: any = {
      ...projectFilter,
      ...(projectId ? { projectId } : {}),
      ...(dateFrom || dateTo
        ? {
            observedAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo + 'T23:59:59.999Z') } : {}),
            },
          }
        : {}),
    }

    if (!sourceKey || sourceKey === 'all' || sourceKey === 'space_cdse') {
      spaceWhere.sourceKey = { in: ['space_cdse'] }
    } else if (sourceKey === 'open_meteo') {
      delete spaceWhere.sourceKey
    }

    if (dataset && dataset !== 'all') {
      if (dataset === 'Open-Meteo Solar') {
        // لا تُضاف شروط على SpaceDataObservation عند اختيار Open-Meteo Solar
      } else if (dataset === 'CDSE') {
        spaceWhere.dataset = { in: ['Sentinel-2', 'Sentinel-5P'] }
      } else if (dataset === 'Sentinel-2' || dataset === 'Sentinel-5P') {
        spaceWhere.dataset = dataset
      }
    }

    const weatherWhere: any = {
      ...projectFilter,
      ...(projectId ? { projectId } : {}),
      ...(dateFrom || dateTo
        ? {
            observedAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo + 'T23:59:59.999Z') } : {}),
            },
          }
        : {}),
    }

    if (!sourceKey || sourceKey === 'all' || sourceKey === 'open_meteo') {
      weatherWhere.dataSource = 'Open-Meteo'
    }

    const [spaceRows, weatherRows] = await Promise.all([
      db.spaceDataObservation.findMany({
        where: spaceWhere,
        orderBy: { observedAt: sortDir },
        include: {
          project: { select: { id: true, name: true, nameAr: true, projectType: true, latitude: true, longitude: true } },
        },
      }),
      db.weatherObservation.findMany({
        where: weatherWhere,
        orderBy: { observedAt: sortDir },
        include: {
          project: { select: { id: true, name: true, nameAr: true, projectType: true, latitude: true, longitude: true } },
        },
      }),
    ])

    const mappedSpaceRows = spaceRows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      projectName: r.project.nameAr || r.project.name,
      projectType: r.project.projectType,
      sourceKey: r.sourceKey,
      dataset: r.dataset,
      observedAt: r.observedAt.toISOString(),
      fetchedAt: r.fetchedAt.toISOString(),
      fetchRun: r.fetchRun,
      latitude: r.project.latitude ?? 0,
      longitude: r.project.longitude ?? 0,
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

    const mappedWeatherRows = weatherRows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      projectName: r.project.nameAr || r.project.name,
      projectType: r.project.projectType,
      sourceKey: 'open_meteo',
      dataset: 'Open-Meteo Solar',
      observedAt: r.observedAt.toISOString(),
      fetchedAt: r.createdAt.toISOString(),
      fetchRun: null,
      latitude: r.project.latitude ?? 0,
      longitude: r.project.longitude ?? 0,
      ghiWm2: r.irradianceWm2,
      dniWm2: null,
      difWm2: null,
      aod: null,
      temperatureC: r.temperatureC,
      windSpeedMs: r.windSpeedMs,
      humidityPct: r.humidityPct,
      cloudCoverPct: r.cloudCoverPct,
      precipitationMm: r.precipitationMm,
      ndvi: null,
      evi: null,
      lstC: null,
      no2ColumnMolM2: null,
      aerosolIndex: null,
      qualityFlag: null,
    }))

    let result = [...mappedSpaceRows, ...mappedWeatherRows]

    if (sortBy === 'projectName') {
      result = result.sort((a, b) => {
        const an = a.projectName || ''
        const bn = b.projectName || ''
        return sortDir === 'asc' ? an.localeCompare(bn, 'ar') : bn.localeCompare(an, 'ar')
      })
    } else if (sortBy === 'fetchedAt') {
      result = result.sort((a, b) => {
        const av = new Date(a.fetchedAt).getTime()
        const bv = new Date(b.fetchedAt).getTime()
        return sortDir === 'asc' ? av - bv : bv - av
      })
    } else {
      result = result.sort((a, b) => {
        const av = new Date(a.observedAt).getTime()
        const bv = new Date(b.observedAt).getTime()
        return sortDir === 'asc' ? av - bv : bv - av
      })
    }

    const total = result.length
    const startIndex = (page - 1) * pageSize
    const data = result.slice(startIndex, startIndex + pageSize)

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
        errors: r.errorSummary ? JSON.parse(r.errorSummary) : [],
      })),
    })
  } catch (error: any) {
    console.error('Space data GET error:', error)
    return NextResponse.json({ error: error?.message || 'حدث خطأ أثناء جلب البيانات' }, { status: 500 })
  }
}

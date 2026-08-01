import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/authorization'

// GET /api/space-data — يعيد قائمة القراءات الفضائية مجمّعة: صف واحد لكل (مشروع + تاريخ)
// يحتوي أعمدة CDSE (NDVI/EVI/NO2...) وOpen-Meteo Solar (GHI/حرارة/رياح...) معًا.
// المرحلة الحالية: المصدران المعتمَدان فقط هما Open-Meteo Solar وCDSE.
// Query params:
//   projectId   — تصفية حسب مشروع معيّن
//   dateFrom / dateTo — نطاق تاريخ observedAt (ISO date)
//   sortBy      — observedAt | projectName (افتراضي: observedAt)
//   sortDir     — asc | desc (افتراضي: desc)
//   page, pageSize
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('reading:read')
    if (!auth.authorized) return auth.response

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId') || undefined
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

    // في هذه المرحلة: CDSE فقط من SpaceDataObservation (Sentinel-2 / Sentinel-5P)
    const spaceWhere: any = {
      ...projectFilter,
      ...(projectId ? { projectId } : {}),
      sourceKey: { in: ['space_cdse'] },
      ...(dateFrom || dateTo
        ? {
            observedAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo + 'T23:59:59.999Z') } : {}),
            },
          }
        : {}),
    }

    const weatherWhere: any = {
      ...projectFilter,
      ...(projectId ? { projectId } : {}),
      dataSource: 'Open-Meteo',
      ...(dateFrom || dateTo
        ? {
            observedAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo + 'T23:59:59.999Z') } : {}),
            },
          }
        : {}),
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

    // نجمّع كِلا المصدرين في صف واحد لكل (مشروع + تاريخ observedAt، بدون وقت) —
    // بحيث تظهر أعمدة CDSE (NDVI/EVI/NO2...) وOpen-Meteo (GHI/حرارة/رياح...) معًا.
    type MergedRow = {
      id: string
      projectId: string
      projectName: string
      projectType: string
      observedDate: string // YYYY-MM-DD
      latitude: number
      longitude: number
      openMeteo: {
        observedAt: string
        fetchedAt: string
        ghiWm2: number | null
        temperatureC: number | null
        humidityPct: number | null
        windSpeedMs: number | null
        cloudCoverPct: number | null
        precipitationMm: number | null
      } | null
      cdse: {
        observedAt: string
        fetchedAt: string
        fetchRun: string | null
        dataset: string
        ndvi: number | null
        evi: number | null
        lstC: number | null
        no2ColumnMolM2: number | null
        aerosolIndex: number | null
        qualityFlag: string | null
      } | null
    }

    const groups = new Map<string, MergedRow>()
    const dayKey = (projId: string, d: Date) => `${projId}__${d.toISOString().slice(0, 10)}`

    const getOrCreateRow = (projId: string, d: Date, projectName: string, projectType: string, lat: number, lon: number) => {
      const key = dayKey(projId, d)
      let row = groups.get(key)
      if (!row) {
        row = {
          id: key,
          projectId: projId,
          projectName,
          projectType,
          observedDate: d.toISOString().slice(0, 10),
          latitude: lat,
          longitude: lon,
          openMeteo: null,
          cdse: null,
        }
        groups.set(key, row)
      }
      return row
    }

    for (const r of spaceRows) {
      const row = getOrCreateRow(
        r.projectId, r.observedAt, r.project.nameAr || r.project.name, r.project.projectType,
        r.project.latitude ?? 0, r.project.longitude ?? 0,
      )
      // إن وُجد أكثر من قراءة CDSE لنفس اليوم (Sentinel-2 وSentinel-5P)، ندمجها في نفس كائن cdse
      row.cdse = {
        observedAt: r.observedAt.toISOString(),
        fetchedAt: r.fetchedAt.toISOString(),
        fetchRun: r.fetchRun,
        dataset: row.cdse ? `${row.cdse.dataset} + ${r.dataset}` : r.dataset,
        ndvi: r.ndvi ?? row.cdse?.ndvi ?? null,
        evi: r.evi ?? row.cdse?.evi ?? null,
        lstC: r.lstC ?? row.cdse?.lstC ?? null,
        no2ColumnMolM2: r.no2ColumnMolM2 ?? row.cdse?.no2ColumnMolM2 ?? null,
        aerosolIndex: r.aerosolIndex ?? row.cdse?.aerosolIndex ?? null,
        qualityFlag: r.qualityFlag ?? row.cdse?.qualityFlag ?? null,
      }
    }

    for (const r of weatherRows) {
      const row = getOrCreateRow(
        r.projectId, r.observedAt, r.project.nameAr || r.project.name, r.project.projectType,
        r.project.latitude ?? 0, r.project.longitude ?? 0,
      )
      row.openMeteo = {
        observedAt: r.observedAt.toISOString(),
        fetchedAt: r.createdAt.toISOString(),
        ghiWm2: r.irradianceWm2,
        temperatureC: r.temperatureC,
        humidityPct: r.humidityPct,
        windSpeedMs: r.windSpeedMs,
        cloudCoverPct: r.cloudCoverPct,
        precipitationMm: r.precipitationMm,
      }
    }

    let result = Array.from(groups.values())

    if (sortBy === 'projectName') {
      result = result.sort((a, b) => {
        const an = a.projectName || ''
        const bn = b.projectName || ''
        return sortDir === 'asc' ? an.localeCompare(bn, 'ar') : bn.localeCompare(an, 'ar')
      })
    } else {
      result = result.sort((a, b) => {
        const av = new Date(a.observedDate).getTime()
        const bv = new Date(b.observedDate).getTime()
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

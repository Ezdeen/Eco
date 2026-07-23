import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectAccess } from '@/lib/authorization'
import { fetchLiveWeather } from '@/lib/weather'

interface Params {
  params: Promise<{ id: string }>
}

/**
 * GET /api/projects/[id]/live-weather
 *
 * Returns current (live) weather and solar irradiance for a single project,
 * based on the project's own latitude/longitude. Uses Open-Meteo's free,
 * unauthenticated current-weather endpoint — no API key is configured or
 * required for this provider (see src/lib/weather.ts). This is intentionally
 * a live pass-through (not stored), distinct from the historical
 * WeatherObservation rows used for expected-yield calculations.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const auth = await requireProjectAccess(id, 'project:read')
    if (!auth.authorized) return auth.response

    const project = await db.project.findUnique({
      where: { id },
      select: { id: true, name: true, nameAr: true, code: true, latitude: true, longitude: true, city: true, country: true },
    })

    if (!project) {
      return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })
    }

    if (project.latitude === null || project.longitude === null) {
      return NextResponse.json(
        {
          error: 'لا تتوفر إحداثيات (خط العرض/الطول) لهذا المشروع',
          projectId: project.id,
        },
        { status: 422 },
      )
    }

    const weather = await fetchLiveWeather(project.latitude, project.longitude)

    if (!weather) {
      return NextResponse.json(
        {
          error: 'تعذّر جلب بيانات الطقس المباشرة حاليًا',
          projectId: project.id,
        },
        { status: 502 },
      )
    }

    return NextResponse.json({
      projectId: project.id,
      projectCode: project.code,
      coordinates: { latitude: project.latitude, longitude: project.longitude },
      weather,
    })
  } catch (error) {
    console.error('Live weather API error:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء جلب بيانات الطقس' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectAccess } from '@/lib/authorization'
import { updateProjectSchema } from '@/lib/validation'

interface Params {
  params: Promise<{ id: string }>
}

// GET single project with full details
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    // Authorization: require project read access
    const auth = await requireProjectAccess(id, 'project:read')
    if (!auth.authorized) return auth.response

    const project = await db.project.findUnique({
      where: { id },
      include: {
        organization: { select: { name: true, nameAr: true, code: true } },
        sites: true,
        assets: { include: { solarProfile: true } },
        devices: true,
        _count: { select: { readings: true, cases: true, attestations: true, reports: true } },
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })
    }

    return NextResponse.json({ project })
  } catch (error) {
    console.error('Get project error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH - update project
export async function PATCH(request: NextRequest, { params }: Params) {
}

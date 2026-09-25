import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/authorization'

// GET /api/users/project-managers — List active project_manager users in the current
// organization, for the "مدير المشروع" dropdown shown when creating/editing a project.
export async function GET() {
  try {
    const auth = await requirePermission('project:create')
    if (!auth.authorized) return auth.response

    const memberships = await db.userMembership.findMany({
      where: {
        organizationId: auth.user.organizationId!,
        role: 'project_manager',
        status: 'active',
      },
      include: {
        user: { select: { id: true, name: true, nameAr: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    const managers = memberships.map((m) => ({
      id: m.user.id,
      name: m.user.nameAr || m.user.name || m.user.email,
      email: m.user.email,
    }))

    return NextResponse.json({ managers })
  } catch (error) {
    console.error('Project managers list error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

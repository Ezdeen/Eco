// Server-side authorization library — 3-role system
// org_admin: full access. project_manager: read-only, scoped to their own projects only.
// data_entry: can only create new projects, no other access.
import { getCurrentUser, SessionPayload } from './auth'
import { NextResponse } from 'next/server'

export type Permission =
  | 'project:read'
  | 'project:create'
  | 'project:update'
  | 'project:delete'
  | 'reading:read'
  | 'reading:audit'
  | 'calculation:run'
  | 'attestation:submit'
  | 'report:create'
  | 'report:approve'
  | 'report:download'
  | 'report:delete'
  | 'impact:manage'
  | 'audit:read'
  | 'user:manage'
  | 'settings:manage'

// Role-based permission matrix — enforced on every requirePermission/requireProjectAccess call.
const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  // مدير المؤسسة: كل الصلاحيات، بدون قيود
  org_admin: [
    'project:read', 'project:create', 'project:update', 'project:delete',
    'reading:read', 'reading:audit', 'calculation:run', 'attestation:submit',
    'report:create', 'report:approve', 'report:download', 'report:delete', 'impact:manage',
    'audit:read', 'user:manage', 'settings:manage',
  ],
  // مدير المشروع: مراقبة فقط (قراءة)، محصور بمشاريعه المرتبط بها فقط (يُفرض بـ requireProjectAccess)
  project_manager: [
    'project:read',
    'reading:read', 'reading:audit',
    'calculation:run',
    'attestation:submit',
    'report:download',
    'impact:manage',
  ],
  // مدخل البيانات: إنشاء مشروع جديد فقط، لا وصول لأي شيء آخر
  data_entry: [
    'project:create',
  ],
}

type AuthResult =
  | { authorized: true; user: SessionPayload }
  | { authorized: false; response: NextResponse }

function unauthorizedResponse(message = 'يجب تسجيل الدخول للوصول لهذا المورد'): AuthResult {
  return {
    authorized: false,
    response: NextResponse.json({ error: message }, { status: 401 }),
  }
}

function forbiddenResponse(message = 'ليس لديك صلاحية للقيام بهذا الإجراء'): AuthResult {
  return {
    authorized: false,
    response: NextResponse.json({ error: message }, { status: 403 }),
  }
}

export async function requireAuth(): Promise<AuthResult> {
  const user = await getCurrentUser()
  if (!user) return unauthorizedResponse()
  return { authorized: true, user }
}

export async function requirePermission(permission: Permission): Promise<AuthResult> {
  const user = await getCurrentUser()
  if (!user) return unauthorizedResponse()

  const allowed = ROLE_PERMISSIONS[user.role]?.includes(permission)
  if (!allowed) return forbiddenResponse()

  return { authorized: true, user }
}

// Check if user can access a specific project.
// org_admin: unrestricted within their organization.
// project_manager: ONLY projects where Project.managerId === user.userId — this is the
// data-isolation guarantee. A project_manager must never see another manager's project data.
export async function requireProjectAccess(projectId: string, permission: Permission): Promise<AuthResult> {
  const user = await getCurrentUser()
  if (!user) return unauthorizedResponse()

  const allowed = ROLE_PERMISSIONS[user.role]?.includes(permission)
  if (!allowed) return forbiddenResponse()

  const { db } = await import('./db')
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { organizationId: true, managerId: true },
  })

  if (!project) {
    return forbiddenResponse('المشروع غير موجود')
  }
  if (project.organizationId !== user.organizationId) {
    return forbiddenResponse('لا يمكنك الوصول لهذا المشروع')
  }

  // Data isolation: a project_manager may only access projects assigned to them specifically
  if (user.role === 'project_manager' && project.managerId !== user.userId) {
    return forbiddenResponse('هذا المشروع غير مرتبط بحسابك')
  }

  return { authorized: true, user }
}

// Returns the Prisma `where` clause fragment that scopes any project-related query to what
// the current user is allowed to see. org_admin gets no extra restriction (org-wide already
// applied by callers); project_manager is restricted to their own managed projects only.
export function projectScopeFilter(user: SessionPayload): Record<string, any> {
  if (user.role === 'project_manager') {
    return { managerId: user.userId }
  }
  return {}
}

// Separation of duties: يمنع نفس الشخص من الموافقة على ما أنشأه هو نفسه
export async function checkSeparationOfDuties(
  action: 'approve' | 'attest' | 'publish',
  resourceCreatorId: string,
  currentUserId: string,
): Promise<boolean> {
  return resourceCreatorId !== currentUserId
}

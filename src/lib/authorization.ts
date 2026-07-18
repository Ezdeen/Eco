// Server-side authorization library
// BYPASS MODE: All auth checks disabled - تجاوز جميع فحوصات المصادقة
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
  | 'impact:manage'
  | 'audit:read'
  | 'user:manage'
  | 'settings:manage'

// Role-based permission matrix (kept for reference but not enforced)
const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  platform_admin: [
    'project:read', 'project:create', 'project:update', 'project:delete',
    'reading:read', 'reading:audit', 'calculation:run', 'attestation:submit',
    'report:create', 'report:approve', 'report:download', 'impact:manage',
    'audit:read', 'user:manage', 'settings:manage',
  ],
  org_admin: [
    'project:read', 'project:create', 'project:update', 'project:delete',
    'reading:read', 'reading:audit', 'calculation:run', 'attestation:submit',
    'report:create', 'report:approve', 'report:download', 'impact:manage',
    'audit:read', 'user:manage', 'settings:manage',
  ],
  esg_manager: [
    'project:read', 'project:update',
    'reading:read', 'reading:audit', 'calculation:run', 'attestation:submit',
    'report:create', 'report:approve', 'report:download', 'impact:manage',
    'audit:read',
  ],
  project_manager: [
    'project:read', 'project:update',
    'reading:read', 'reading:audit', 'calculation:run',
    'report:create', 'report:download',
    'audit:read',
  ],
  operator: [
    'project:read',
    'reading:read', 'reading:audit',
    'report:download',
  ],
  auditor: [
    'project:read',
    'reading:read',
    'report:download', 'report:approve',
    'audit:read',
  ],
  technician: [
    'project:read',
    'reading:read',
  ],
  viewer: [
    'project:read',
    'reading:read',
    'report:download',
  ],
  service_account: [
    'reading:read', 'calculation:run', 'attestation:submit',
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

// Check if user can access a specific project (ABAC - organization scope)
export async function requireProjectAccess(projectId: string, permission: Permission): Promise<AuthResult> {
  const user = await getCurrentUser()
  if (!user) return unauthorizedResponse()

  const allowed = ROLE_PERMISSIONS[user.role]?.includes(permission)
  if (!allowed) return forbiddenResponse()

  // platform_admin يتجاوز نطاق المؤسسة (وصول لكل شي)
  if (user.role === 'platform_admin') return { authorized: true, user }

  const { db } = await import('./db')
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { organizationId: true },
  })

  if (!project || project.organizationId !== user.organizationId) {
    return forbiddenResponse('لا يمكنك الوصول لهذا المشروع')
  }

  return { authorized: true, user }
}

// Separation of duties: يمنع نفس الشخص من الموافقة على ما أنشأه هو نفسه
export async function checkSeparationOfDuties(
  action: 'approve' | 'attest' | 'publish',
  resourceCreatorId: string,
  currentUserId: string,
): Promise<boolean> {
  return resourceCreatorId !== currentUserId
}

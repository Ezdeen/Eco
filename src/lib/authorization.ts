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

export async function requireAuth() {
  // BYPASS: تجاوز التحقق - دائماً مصرح
  const user = await getCurrentUser()
  return { authorized: true as const, user: user! }
}

export async function requirePermission(permission: Permission) {
  // BYPASS: تجاوز التحقق من الصلاحيات - مصرح دائماً
  const user = await getCurrentUser()
  return { authorized: true as const, user: user! }
}

// Check if user can access a specific project (ABAC - organization scope)
export async function requireProjectAccess(projectId: string, permission: Permission) {
  // BYPASS: تجاوز التحقق من صلاحية المشروع - مصرح دائماً
  const user = await getCurrentUser()
  return { authorized: true as const, user: user! }
}

// Separation of duties: BYPASSED - always allowed
export async function checkSeparationOfDuties(
  action: 'approve' | 'attest' | 'publish',
  resourceCreatorId: string,
  currentUserId: string,
): Promise<boolean> {
  // BYPASS: تجاوز فصل المهام - مسموح دائماً
  return true
}

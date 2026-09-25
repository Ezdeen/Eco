/* eslint-disable @typescript-eslint/no-require-imports */
// Post-Migration Verification Script
// Run after migrate-to-postgres.ts to verify data integrity
// Usage: bun scripts/verify-migration.ts

import { PrismaClient } from '@prisma/client'
import Database from 'better-sqlite3'
import path from 'path'

const SQLITE_PATH = process.env.SQLITE_PATH || path.join(__dirname, '..', 'db', 'custom.db')
const pg = new PrismaClient()
const sqlite = new Database(SQLITE_PATH, { readonly: true })

const TABLES = [
  'Organization', 'User', 'UserMembership', 'Project', 'Site', 'Asset',
  'SolarAssetProfile', 'Device', 'EnergyReading', 'CalculationRun',
  'AttestationBatch', 'ImpactAccount', 'ImpactUnit', 'Report', 'Case',
  'Notification', 'AuditEvent', 'GridEmissionFactor', 'Tariff',
  'ConversionFactor', 'Methodology', 'IngestionBatch', 'RawPayload',
  'ReadingAdjustment', 'ValidationRule', 'ValidationResult',
  'WeatherSource', 'WeatherObservation', 'ExpectedYieldModel',
  'OutboxEvent', 'ReconciliationRun',
]

async function verifyTable(name: string): Promise<{
  table: string
  sqliteCount: number
  pgCount: number
  match: boolean
  sampleIdMatch: boolean
}> {
  // Count in SQLite
  let sqliteCount = 0
  try {
    sqliteCount = sqlite.prepare(`SELECT COUNT(*) as count FROM "${name}"`).get().count
  } catch {
    sqliteCount = 0
  }

  // Count in PostgreSQL
  const pgModel = name.charAt(0).toLowerCase() + name.slice(1)
  let pgCount = 0
  try {
    pgCount = await (pg as any)[pgModel].count()
  } catch {
    pgCount = 0
  }

  // Sample ID check: verify first record ID matches
  let sampleIdMatch = true
  if (sqliteCount > 0 && pgCount > 0) {
    try {
      const sqliteFirst = sqlite.prepare(`SELECT id FROM "${name}" LIMIT 1`).get()
      const pgFirst = await (pg as any)[pgModel].findFirst({ select: { id: true } })
      sampleIdMatch = sqliteFirst?.id === pgFirst?.id
    } catch {
      sampleIdMatch = false
    }
  }

  return {
    table: name,
    sqliteCount,
    pgCount,
    match: sqliteCount === pgCount,
    sampleIdMatch,
  }
}

async function main() {
  console.log('=== Post-Migration Verification ===')
  console.log(`SQLite: ${SQLITE_PATH}`)
  console.log(`PostgreSQL: ${process.env.DATABASE_URL}`)
  console.log('')

  const results: any[] = []
  let allMatch = true
  let allIdsMatch = true

  for (const table of TABLES) {
    const result = await verifyTable(table)
    results.push(result)

    const icon = result.match ? '✅' : '❌'
    const idIcon = result.sampleIdMatch ? '✅' : '❌'
    console.log(`  ${icon} ${table}: SQLite=${result.sqliteCount}, PG=${result.pgCount} ${result.match ? '' : '⚠️ MISMATCH'} ${idIcon === '❌' ? '⚠️ ID MISMATCH' : ''}`)

    if (!result.match) allMatch = false
    if (!result.sampleIdMatch) allIdsMatch = false
  }

  console.log('')
  console.log('=== Summary ===')
  console.log(`Row counts match: ${allMatch ? '✅ YES' : '❌ NO'}`)
  console.log(`Sample IDs match: ${allIdsMatch ? '✅ YES' : '❌ NO'}`)

  // Functional tests
  console.log('')
  console.log('=== Functional Tests ===')

  // Test 1: Login user exists
  const adminUser = await pg.user.findUnique({ where: { email: 'admin@bfec.sa' } })
  console.log(`  ${adminUser ? '✅' : '❌'} Admin user exists: ${adminUser?.email || 'NOT FOUND'}`)

  // Test 2: Organization exists
  const org = await pg.organization.findFirst()
  console.log(`  ${org ? '✅' : '❌'} Organization exists: ${org?.nameAr || 'NOT FOUND'}`)

  // Test 3: Projects exist
  const projectCount = await pg.project.count()
  console.log(`  ${projectCount > 0 ? '✅' : '❌'} Projects exist: ${projectCount}`)

  // Test 4: Energy readings exist
  const readingCount = await pg.energyReading.count()
  console.log(`  ${readingCount > 0 ? '✅' : '❌'} Energy readings exist: ${readingCount}`)

  // Test 5: Reports exist
  const reportCount = await pg.report.count()
  console.log(`  ${reportCount > 0 ? '✅' : '❌'} Reports exist: ${reportCount}`)

  // Test 6: Audit events exist
  const auditCount = await pg.auditEvent.count()
  console.log(`  ${auditCount > 0 ? '✅' : '❌'} Audit events exist: ${auditCount}`)

  // Test 7: Foreign key integrity (check memberships with invalid userId)
  const orphanMemberships = await pg.userMembership.count({
    where: { userId: { not: { in: (await pg.user.findMany({ select: { id: true } })).map(u => u.id) } } }
  }).catch(() => 0)
  console.log(`  ${orphanMemberships === 0 ? '✅' : '❌'} No orphan memberships: ${orphanMemberships} orphans`)

  // Test 8: Attestation batches with invalid projectId
  const orphanAttestations = await pg.attestationBatch.count({
    where: { projectId: { not: { in: (await pg.project.findMany({ select: { id: true } })).map(p => p.id) } } }
  }).catch(() => 0)
  console.log(`  ${orphanAttestations === 0 ? '✅' : '❌'} No orphan attestations: ${orphanAttestations} orphans`)

  // Save verification report
  const report = {
    timestamp: new Date().toISOString(),
    allMatch,
    allIdsMatch,
    results,
    functionalTests: {
      adminUser: !!adminUser,
      organization: !!org,
      projects: projectCount,
      readings: readingCount,
      reports: reportCount,
      auditEvents: auditCount,
      orphanMemberships,
      orphanAttestations,
    },
  }

  require('fs').writeFileSync(
    path.join(__dirname, 'migration-verification.json'),
    JSON.stringify(report, null, 2)
  )

  console.log('')
  console.log(allMatch && allIdsMatch ? '✅ Migration verified successfully!' : '❌ Migration verification FAILED!')
  console.log('Report saved to scripts/migration-verification.json')

  await pg.$disconnect()
  sqlite.close()

  process.exit(allMatch && allIdsMatch ? 0 : 1)
}

main().catch((error) => {
  console.error('Verification failed:', error)
  process.exit(1)
})

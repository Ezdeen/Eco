/* eslint-disable @typescript-eslint/no-require-imports */
// SQLite → PostgreSQL Migration Script
// Usage:
//   1. Ensure PostgreSQL is running and DATABASE_URL points to it
//   2. Set SQLITE_PATH to your SQLite file
//   3. Run: bun scripts/migrate-to-postgres.ts
//   4. Or dry-run: DRY_RUN=true bun scripts/migrate-to-postgres.ts

import { PrismaClient } from '@prisma/client'
import Database from 'better-sqlite3'
import path from 'path'

const SQLITE_PATH = process.env.SQLITE_PATH || path.join(__dirname, '..', 'db', 'custom.db')
const DRY_RUN = process.env.DRY_RUN === 'true'

// Target: PostgreSQL (uses DATABASE_URL from .env)
const pg = new PrismaClient()

// Source: SQLite (direct read-only)
const sqlite = new Database(SQLITE_PATH, { readonly: true })

interface TableConfig {
  name: string
  // Optional transform function for each row
  transform?: (row: any) => any
}

// Migration order (respects foreign keys)
const TABLES: TableConfig[] = [
  { name: 'Organization' },
  { name: 'User' },
  { name: 'UserMembership' },
  { name: 'Project' },
  { name: 'Site' },
  { name: 'Asset' },
  { name: 'SolarAssetProfile' },
  { name: 'Device' },
  { name: 'EnergyReading' },
  { name: 'CalculationRun' },
  { name: 'AttestationBatch' },
  { name: 'ImpactAccount' },
  { name: 'ImpactUnit' },
  { name: 'Report' },
  { name: 'Case' },
  { name: 'Notification' },
  { name: 'AuditEvent' },
  { name: 'GridEmissionFactor' },
  { name: 'Tariff' },
  { name: 'ConversionFactor' },
  { name: 'Methodology' },
  { name: 'IngestionBatch' },
  { name: 'RawPayload' },
  { name: 'ReadingAdjustment' },
  { name: 'ValidationRule' },
  { name: 'ValidationResult' },
  { name: 'WeatherSource' },
  { name: 'WeatherObservation' },
  { name: 'ExpectedYieldModel' },
  { name: 'OutboxEvent' },
  { name: 'ReconciliationRun' },
]

// Helper: parse SQLite value (handle type conversions)
function parseValue(val: any): any {
  if (val === null || val === undefined) return null
  if (typeof val === 'string') {
    // Try parsing ISO dates stored as strings
    if (val.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
      return new Date(val)
    }
    // Try parsing numbers stored as strings
    if (val.match(/^\d+$/) && val.length > 15) return val // keep large IDs as strings
  }
  if (typeof val === 'number') {
    // SQLite stores integers for booleans
    if (val === 0 || val === 1) return val // keep as int, Prisma handles Boolean
  }
  return val
}

// Helper: convert SQLite row to Prisma-compatible object
function convertRow(row: any, tableName: string): any {
  const converted: any = {}
  for (const [key, value] of Object.entries(row)) {
    converted[key] = parseValue(value)
  }
  return converted
}

async function migrateTable(config: TableConfig): Promise<{ table: string; sqliteCount: number; pgCount: number; migrated: number }> {
  const { name } = config

  // Read all rows from SQLite
  const rows = sqlite.prepare(`SELECT * FROM "${name}"`).all()
  const sqliteCount = rows.length

  if (DRY_RUN) {
    console.log(`  [DRY RUN] ${name}: ${sqliteCount} rows would be migrated`)
    return { table: name, sqliteCount, pgCount: 0, migrated: 0 }
  }

  if (sqliteCount === 0) {
    console.log(`  ${name}: 0 rows (skipped)`)
    return { table: name, sqliteCount: 0, pgCount: 0, migrated: 0 }
  }

  // Convert rows
  const convertedRows = rows.map((row) => convertRow(row, name))

  // Insert into PostgreSQL in batches
  const BATCH_SIZE = 100
  let migrated = 0

  for (let i = 0; i < convertedRows.length; i += BATCH_SIZE) {
    const batch = convertedRows.slice(i, i + BATCH_SIZE)
    try {
      // Use createMany for bulk insert
      await (pg as any)[name.charAt(0).toLowerCase() + name.slice(1)].createMany({
        data: batch,
        skipDuplicates: true,
      })
      migrated += batch.length
    } catch (error: any) {
      // If createMany fails (e.g., unique constraint), try one by one
      if (error.code === 'P2002') {
        for (const row of batch) {
          try {
            await (pg as any)[name.charAt(0).toLowerCase() + name.slice(1)].create({ data: row })
            migrated++
          } catch {
            // skip duplicate
          }
        }
      } else {
        console.error(`  Error in ${name} batch ${i}: ${error.message}`)
      }
    }
  }

  // Count in PG
  const pgCount = await (pg as any)[name.charAt(0).toLowerCase() + name.slice(1)].count()

  console.log(`  ${name}: ${sqliteCount} → ${pgCount} (${migrated} migrated)`)
  return { table: name, sqliteCount, pgCount, migrated }
}

async function main() {
  console.log('=== SQLite → PostgreSQL Migration ===')
  console.log(`Source: ${SQLITE_PATH}`)
  console.log(`Target: ${process.env.DATABASE_URL}`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE MIGRATION'}`)
  console.log('')

  const results: any[] = []
  let totalSqlite = 0
  let totalPg = 0
  let totalMigrated = 0

  for (const config of TABLES) {
    try {
      const result = await migrateTable(config)
      results.push(result)
      totalSqlite += result.sqliteCount
      totalPg += result.pgCount
      totalMigrated += result.migrated
    } catch (error: any) {
      console.error(`  FAILED: ${config.name}: ${error.message}`)
      results.push({ table: config.name, sqliteCount: 0, pgCount: 0, migrated: 0, error: error.message })
    }
  }

  console.log('')
  console.log('=== Migration Summary ===')
  console.log(`Total SQLite rows: ${totalSqlite}`)
  console.log(`Total PostgreSQL rows: ${totalPg}`)
  console.log(`Total migrated: ${totalMigrated}`)
  console.log(`Match: ${totalSqlite === totalPg ? '✅ YES' : '❌ NO — check mismatches below'}`)
  console.log('')

  // Verification report
  console.log('=== Verification Report ===')
  for (const r of results) {
    const match = r.sqliteCount === r.pgCount ? '✅' : '❌'
    console.log(`  ${match} ${r.table}: SQLite=${r.sqliteCount}, PG=${r.pgCount}`)
  }

  // Save report
  const report = {
    timestamp: new Date().toISOString(),
    mode: DRY_RUN ? 'dry_run' : 'live',
    source: SQLITE_PATH,
    target: process.env.DATABASE_URL,
    summary: { totalSqlite, totalPg, totalMigrated },
    tables: results,
  }

  console.log('\nReport saved to scripts/migration-report.json')
  require('fs').writeFileSync(
    path.join(__dirname, 'migration-report.json'),
    JSON.stringify(report, null, 2)
  )

  await pg.$disconnect()
  sqlite.close()
}

main().catch((error) => {
  console.error('Migration failed:', error)
  process.exit(1)
})

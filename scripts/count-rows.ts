import { db } from '../src/lib/db'

async function main() {
  const tables = [
    'organization', 'user', 'userMembership', 'project', 'site', 'asset',
    'solarAssetProfile', 'device', 'energyReading', 'calculationRun',
    'attestationBatch', 'impactAccount', 'impactUnit', 'report', 'case',
    'notification', 'auditEvent', 'gridEmissionFactor', 'tariff',
    'conversionFactor', 'methodology', 'ingestionBatch', 'rawPayload',
    'readingAdjustment', 'validationRule', 'validationResult',
    'weatherSource', 'weatherObservation', 'expectedYieldModel',
    'outboxEvent', 'reconciliationRun',
  ]

  console.log('=== SQLite Row Counts ===')
  let total = 0
  for (const table of tables) {
    try {
      const count = await (db as any)[table].count()
      console.log(`  ${table}: ${count}`)
      total += count
    } catch (e) {
      console.log(`  ${table}: 0 or not found`)
    }
  }
  console.log(`  TOTAL: ${total}`)
  await db.$disconnect()
}
main()

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function parseArgs() {
  const args = process.argv.slice(2)
  let mode: 'archive' | 'delete' = 'archive'
  let dryRun = false
  let retentionDays = Number(process.env.REPORT_RETENTION_DAYS || '90')

  for (const arg of args) {
    if (arg === '--delete') mode = 'delete'
    if (arg === '--dry-run') dryRun = true
    if (arg.startsWith('--days=')) {
      const parsed = Number(arg.split('=')[1])
      if (Number.isFinite(parsed) && parsed > 0) retentionDays = parsed
    }
  }

  return { mode, dryRun, retentionDays }
}

async function main() {
  const { mode, dryRun, retentionDays } = parseArgs()
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

  const reportsToProcess = await prisma.report.findMany({
    where: {
      createdAt: { lt: cutoffDate },
      status: { not: 'archived' },
    },
    select: { id: true, title: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  if (reportsToProcess.length === 0) {
    console.log(`No reports older than ${retentionDays} days found.`)
    return
  }

  if (dryRun) {
    console.log(`Dry run: ${reportsToProcess.length} reports would be ${mode === 'delete' ? 'deleted' : 'archived'}.`)
    for (const report of reportsToProcess.slice(0, 10)) {
      console.log(`- ${report.title} (${report.createdAt.toISOString()})`)
    }
    return
  }

  if (mode === 'delete') {
    await prisma.report.deleteMany({
      where: {
        id: { in: reportsToProcess.map((report) => report.id) },
      },
    })
    console.log(`Deleted ${reportsToProcess.length} reports older than ${retentionDays} days.`)
  } else {
    await prisma.report.updateMany({
      where: {
        id: { in: reportsToProcess.map((report) => report.id) },
      },
      data: { status: 'archived' },
    })
    console.log(`Archived ${reportsToProcess.length} reports older than ${retentionDays} days.`)
  }
}

main()
  .catch((error) => {
    console.error('Cleanup reports failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

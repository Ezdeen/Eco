import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { writeFile, mkdir, readFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

interface Params {
  params: Promise<{ id: string }>
}

// Generate report data (reused from download route)
async function generateReportData(reportId: string) {
  const report = await db.report.findUnique({
    where: { id: reportId },
    include: {
      project: {
        select: {
          id: true, name: true, nameAr: true, code: true,
          country: true, city: true, capacityKwp: true, currency: true,
          tariffRetail: true, tariffFeedIn: true, sponsorName: true, sponsorPhone: true,
          inverterSerial: true, inverterType: true, commissionedAt: true,
        },
      },
    },
  })

  if (!report) return null

  const readings = await db.energyReading.findMany({
    where: {
      projectId: report.projectId,
      measuredAt: { gte: report.periodStart, lte: report.periodEnd },
    },
    select: {
      measuredAt: true, value: true, unit: true,
      qualityStatus: true, validationStatus: true,
      cumulativeValue: true, suspectReason: true,
    },
    orderBy: { measuredAt: 'asc' },
  })

  const calcRuns = await db.calculationRun.findMany({
    where: {
      projectId: report.projectId,
      periodStart: { gte: report.periodStart },
      periodEnd: { lte: report.periodEnd },
    },
    orderBy: { createdAt: 'desc' },
  })

  const attestations = await db.attestationBatch.findMany({
    where: {
      projectId: report.projectId,
      createdAt: { gte: report.periodStart, lte: report.periodEnd },
    },
  })

  const totalEnergy = readings.reduce((s, r) => s + r.value, 0)
  const validReadings = readings.filter((r) => r.qualityStatus === 'validated' || r.qualityStatus === 'approved')
  const suspectReadings = readings.filter((r) => r.qualityStatus === 'suspect')
  const rejectedReadings = readings.filter((r) => r.qualityStatus === 'rejected')
  const emissionFactor = 0.432
  const totalCo2Avoided = totalEnergy * emissionFactor
  const selfConsumed = totalEnergy * 0.7
  const exported = totalEnergy * 0.3
  const totalSavings = selfConsumed * (report.project.tariffRetail || 0.18) + exported * (report.project.tariffFeedIn || 0.10)
  const specificYield = report.project.capacityKwp ? totalEnergy / report.project.capacityKwp : 0
  const days = (report.periodEnd.getTime() - report.periodStart.getTime()) / (1000 * 60 * 60 * 24)
  const referenceYield = days * 5.5
  const performanceRatio = referenceYield > 0 && report.project.capacityKwp ? (totalEnergy / report.project.capacityKwp) / referenceYield : 0

  const dailyData: { date: string; energy: number; co2: number; savings: number }[] = []
  const dailyMap = new Map<string, number>()
  for (const r of readings) {
    const date = new Date(r.measuredAt).toISOString().slice(0, 10)
    dailyMap.set(date, (dailyMap.get(date) || 0) + r.value)
  }
  for (const [date, energy] of dailyMap) {
    dailyData.push({
      date, energy: Math.round(energy * 100) / 100,
      co2: Math.round(energy * emissionFactor * 100) / 100,
      savings: Math.round(energy * (report.project.tariffRetail || 0.18) * 100) / 100,
    })
  }

  return {
    report, project: report.project,
    summary: {
      periodStart: report.periodStart, periodEnd: report.periodEnd,
      totalReadings: readings.length, validReadings: validReadings.length,
      suspectReadings: suspectReadings.length, rejectedReadings: rejectedReadings.length,
      dataQualityRate: readings.length > 0 ? (validReadings.length / readings.length) * 100 : 0,
      totalEnergy: Math.round(totalEnergy * 100) / 100,
      totalCo2Avoided: Math.round(totalCo2Avoided * 100) / 100,
      totalCo2AvoidedTons: Math.round((totalCo2Avoided / 1000) * 100) / 100,
      totalSavings: Math.round(totalSavings * 100) / 100,
      selfConsumed: Math.round(selfConsumed * 100) / 100,
      exported: Math.round(exported * 100) / 100,
      specificYield: Math.round(specificYield * 100) / 100,
      performanceRatio: Math.round(performanceRatio * 1000) / 10,
      treeEquivalent: Math.round(totalCo2Avoided / 21),
      carKmAvoided: Math.round(totalCo2Avoided / 0.12),
      emissionFactor, capacityKwp: report.project.capacityKwp,
    },
    dailyData,
    calculations: calcRuns,
    attestations: attestations.map((a) => ({
      id: a.id, status: a.status, itemCount: a.itemCount,
      hederaTransactionId: a.hederaTransactionId,
      consensusTimestamp: a.consensusTimestamp,
      batchHash: a.batchHash?.slice(0, 20) + '...',
      confirmedAt: a.confirmedAt,
    })),
    suspectReasons: suspectReadings.slice(0, 10).map((r) => ({
      measuredAt: r.measuredAt, value: r.value, reason: r.suspectReason,
    })),
  }
}

function generateHTMLReport(data: any, reportName: string): string {
  const fmt = (n: number) => n?.toLocaleString('en-US', { maximumFractionDigits: 2 }) || '0'
  const fmtDate = (d: Date) => new Date(d).toLocaleDateString('ar-SA')

  const maxEnergy = Math.max(...data.dailyData.map((d: any) => d.energy), 1)
  const chartWidth = 580
  const chartHeight = 180
  const barWidth = chartWidth / Math.max(data.dailyData.length, 1)

  const bars = data.dailyData.map((d: any, i: number) => {
    const h = (d.energy / maxEnergy) * (chartHeight - 30)
    const x = i * barWidth
    const y = chartHeight - h - 20
    return `<rect x="${x}" y="${y}" width="${barWidth - 2}" height="${h}" fill="#16a34a" rx="2"/>
            <text x="${x + barWidth/2}" y="${chartHeight - 5}" font-size="8" text-anchor="middle" fill="#666">${d.date.slice(5)}</text>`
  }).join('')

  const validPct = data.summary.dataQualityRate
  const suspectPct = data.summary.totalReadings > 0 ? (data.summary.suspectReadings / data.summary.totalReadings) * 100 : 0
  const rejectedPct = data.summary.totalReadings > 0 ? (data.summary.rejectedReadings / data.summary.totalReadings) * 100 : 0

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>${reportName}</title>
<style>
  @page { size: A4; margin: 1.5cm; }
  * { box-sizing: border-box; }
  body { font-family: 'Tajawal', 'Cairo', 'Noto Sans Arabic', Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 20px; }
  .header { background: linear-gradient(135deg, #16a34a, #0891b2); color: white; padding: 25px; border-radius: 12px; margin-bottom: 25px; }
  .header h1 { margin: 0; font-size: 22px; }
  .header .subtitle { font-size: 13px; opacity: 0.9; margin-top: 5px; }
  .section { margin-bottom: 22px; page-break-inside: avoid; }
  .section h2 { color: #16a34a; border-bottom: 2px solid #16a34a; padding-bottom: 6px; font-size: 17px; margin: 0 0 12px 0; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 12px 0; }
  .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; text-align: center; }
  .kpi-card .label { font-size: 10px; color: #64748b; margin-bottom: 3px; }
  .kpi-card .value { font-size: 20px; font-weight: 700; color: #16a34a; }
  .kpi-card .unit { font-size: 10px; color: #64748b; }
  .kpi-card.warn .value { color: #d97706; }
  .kpi-card.danger .value { color: #dc2626; }
  .kpi-card.info .value { color: #0891b2; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 11px; }
  th { background: #16a34a; color: white; padding: 6px; text-align: right; font-weight: 600; }
  td { padding: 6px; border-bottom: 1px solid #e2e8f0; }
  tr:nth-child(even) { background: #f8fafc; }
  .badge { display: inline-block; padding: 2px 6px; border-radius: 10px; font-size: 10px; font-weight: 600; }
  .badge-success { background: #dcfce7; color: #166534; }
  .badge-warn { background: #fef3c7; color: #92400e; }
  .badge-danger { background: #fee2e2; color: #991b1b; }
  .info-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dotted #e2e8f0; font-size: 12px; }
  .info-row .label { color: #64748b; }
  .info-row .value { font-weight: 600; }
  .chart-container { background: #f8fafc; border-radius: 8px; padding: 12px; margin: 12px 0; text-align: center; }
  .footer { margin-top: 25px; padding-top: 12px; border-top: 2px solid #16a34a; font-size: 10px; color: #64748b; text-align: center; }
  .quality-bar { display: flex; height: 22px; border-radius: 11px; overflow: hidden; margin: 8px 0; }
  .quality-bar div { display: flex; align-items: center; justify-content: center; color: white; font-size: 9px; font-weight: 600; }
  .two-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
</style>
</head>
<body>
  <div class="header">
    <h1>تقرير الأداء الشامل - ${data.project.nameAr || data.project.name}</h1>
    <div class="subtitle">
      ${data.project.code} • ${data.project.city || ''} • الفترة: ${fmtDate(data.report.periodStart)} إلى ${fmtDate(data.report.periodEnd)}
    </div>
  </div>

  <div class="section">
    <h2>الملخص التنفيذي</h2>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="label">إجمالي الطاقة</div><div class="value">${fmt(data.summary.totalEnergy)}</div><div class="unit">kWh</div></div>
      <div class="kpi-card info"><div class="label">الكربون المتجنب</div><div class="value">${fmt(data.summary.totalCo2AvoidedTons)}</div><div class="unit">طن CO₂e</div></div>
      <div class="kpi-card"><div class="label">الوفر المالي</div><div class="value">${fmt(data.summary.totalSavings)}</div><div class="unit">${data.project.currency}</div></div>
      <div class="kpi-card"><div class="label">Performance Ratio</div><div class="value">${data.summary.performanceRatio}</div><div class="unit">%</div></div>
    </div>
  </div>

  <div class="section">
    <h2>اتجاه الإنتاج اليومي</h2>
    <div class="chart-container">
      <svg width="${chartWidth}" height="${chartHeight}" viewBox="0 0 ${chartWidth} ${chartHeight}">${bars}</svg>
    </div>
  </div>

  <div class="section">
    <h2>جودة البيانات</h2>
    <div class="quality-bar">
      <div style="background: #16a34a; width: ${validPct}%;">${validPct.toFixed(1)}% صحيحة</div>
      <div style="background: #d97706; width: ${suspectPct}%;">${suspectPct.toFixed(1)}% مشبوهة</div>
      <div style="background: #dc2626; width: ${rejectedPct}%;">${rejectedPct.toFixed(1)}% مرفوضة</div>
    </div>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="label">إجمالي القراءات</div><div class="value">${fmt(data.summary.totalReadings)}</div></div>
      <div class="kpi-card"><div class="label">صحيحة</div><div class="value">${fmt(data.summary.validReadings)}</div></div>
      <div class="kpi-card warn"><div class="label">مشبوهة</div><div class="value">${fmt(data.summary.suspectReadings)}</div></div>
      <div class="kpi-card danger"><div class="label">مرفوضة</div><div class="value">${fmt(data.summary.rejectedReadings)}</div></div>
    </div>
  </div>

  <div class="section">
    <h2>الأثر البيئي المكافئ</h2>
    <div class="two-cols">
      <div>
        <div class="info-row"><span class="label">أشجار مكافئة</span><span class="value">${fmt(data.summary.treeEquivalent)} شجرة/سنة</span></div>
        <div class="info-row"><span class="label">كم سيارة متجنّب</span><span class="value">${fmt(data.summary.carKmAvoided)} km</span></div>
        <div class="info-row"><span class="label">استهلاك ذاتي</span><span class="value">${fmt(data.summary.selfConsumed)} kWh</span></div>
        <div class="info-row"><span class="label">طاقة مُصدَّرة</span><span class="value">${fmt(data.summary.exported)} kWh</span></div>
      </div>
      <div>
        <div class="info-row"><span class="label">Specific Yield</span><span class="value">${fmt(data.summary.specificYield)} kWh/kWp</span></div>
        <div class="info-row"><span class="label">القدرة المنصوبة</span><span class="value">${fmt(data.summary.capacityKwp)} kWp</span></div>
        <div class="info-row"><span class="label">معامل الانبعاث</span><span class="value">${data.summary.emissionFactor} kgCO₂e/kWh</span></div>
        <div class="info-row"><span class="label">عدد الأيام</span><span class="value">${data.dailyData.length} يوم</span></div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>معلومات المشروع</h2>
    <div class="two-cols">
      <div>
        <div class="info-row"><span class="label">اسم المشروع</span><span class="value">${data.project.nameAr || data.project.name}</span></div>
        <div class="info-row"><span class="label">الرمز</span><span class="value">${data.project.code}</span></div>
        <div class="info-row"><span class="label">الموقع</span><span class="value">${data.project.city || '—'}, ${data.project.country || '—'}</span></div>
        <div class="info-row"><span class="label">القدرة</span><span class="value">${fmt(data.project.capacityKwp)} kWp</span></div>
        <div class="info-row"><span class="label">تاريخ التشغيل</span><span class="value">${data.project.commissionedAt ? fmtDate(data.project.commissionedAt) : '—'}</span></div>
      </div>
      <div>
        <div class="info-row"><span class="label">نوع الإنفرتر</span><span class="value">${data.project.inverterType || '—'}</span></div>
        <div class="info-row"><span class="label">سيريال الإنفرتر</span><span class="value">${data.project.inverterSerial || '—'}</span></div>
        <div class="info-row"><span class="label">العملة</span><span class="value">${data.project.currency}</span></div>
        <div class="info-row"><span class="label">تعرفة البيع</span><span class="value">${data.project.tariffRetail || '—'} ${data.project.currency}/kWh</span></div>
        <div class="info-row"><span class="label">تعرفة Feed-in</span><span class="value">${data.project.tariffFeedIn || '—'} ${data.project.currency}/kWh</span></div>
      </div>
    </div>
  </div>

  ${data.project.sponsorName ? `
  <div class="section">
    <h2>المراقب / الممول</h2>
    <div class="info-row"><span class="label">اسم الممول</span><span class="value">${data.project.sponsorName}</span></div>
    <div class="info-row"><span class="label">رقم الاتصال</span><span class="value">${data.project.sponsorPhone || '—'}</span></div>
  </div>
  ` : ''}

  ${data.attestations.length > 0 ? `
  <div class="section">
    <h2>التوثيقات على Hedera</h2>
    <table>
      <thead><tr><th>الحالة</th><th>عدد العناصر</th><th>Transaction ID</th><th>Consensus Timestamp</th></tr></thead>
      <tbody>
        ${data.attestations.map((a: any) => `<tr><td><span class="badge badge-success">${a.status}</span></td><td>${a.itemCount}</td><td style="font-family: monospace; font-size: 9px;">${a.hederaTransactionId}</td><td style="font-family: monospace; font-size: 9px;">${a.consensusTimestamp}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  ${data.suspectReasons.length > 0 ? `
  <div class="section">
    <h2>القراءات المشبوهة (آخر 10)</h2>
    <table>
      <thead><tr><th>وقت القياس</th><th>القيمة</th><th>سبب الاشتباه</th></tr></thead>
      <tbody>
        ${data.suspectReasons.map((s: any) => `<tr><td>${fmtDate(s.measuredAt)}</td><td>${fmt(s.value)} kWh</td><td>${s.reason || '—'}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  <div class="footer">
    <p>© 2026 BrightFuture Energy Co. • منصة ESG للطاقة الشمسية</p>
    <p>تقرير مُولّد آليًا في ${new Date().toLocaleString('ar-SA')} • GHG Protocol Scope 2 • Methodology v1.2</p>
    <p>معامل الانبعاث: ${data.summary.emissionFactor} kgCO₂e/kWh (Saudi Electricity Company - 2024)</p>
  </div>
</body>
</html>`
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }

    const data = await generateReportData(id)
    if (!data) {
      return NextResponse.json({ error: 'التقرير غير موجود' }, { status: 404 })
    }

    const reportName = `${data.project.code}-report-${data.report.periodStart.toISOString().slice(0, 10)}`
    const html = generateHTMLReport(data, reportName)

    // Save HTML to temp file
    const tmpDir = '/tmp/report-pdfs'
    if (!existsSync(tmpDir)) {
      await mkdir(tmpDir, { recursive: true })
    }
    const htmlPath = path.join(tmpDir, `${reportName}.html`)
    const pdfPath = path.join(tmpDir, `${reportName}.pdf`)
    await writeFile(htmlPath, html, 'utf-8')

    // Use Playwright via a Node script to convert HTML to PDF
    const scriptPath = path.join(process.cwd(), 'scripts', 'html-to-pdf.js')
    if (!existsSync(scriptPath)) {
      // Fallback: return HTML if Playwright script doesn't exist
      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `attachment; filename="${reportName}.html"`,
        },
      })
    }

    // Run Playwright conversion
    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      const proc = spawn('node', [scriptPath, htmlPath, pdfPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      let stderr = ''
      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })
      proc.on('close', async (code) => {
        if (code !== 0) {
          reject(new Error(`Playwright failed: ${stderr}`))
          return
        }
        try {
          const pdf = await readFile(pdfPath)
          // Cleanup
          await unlink(htmlPath).catch(() => {})
          await unlink(pdfPath).catch(() => {})
          resolve(pdf)
        } catch (e) {
          reject(e)
        }
      })
      proc.on('error', (err) => reject(err))
    })

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${reportName}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('PDF generation error:', error)
    return NextResponse.json({ error: 'فشل توليد ملف PDF' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { writeFile, mkdir, readFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/authorization'

interface Params {
  params: Promise<{ id: string }>
}

const VERIFICATION_LABELS_AR: Record<string, string> = {
  fully_verified: 'موثَّق بالكامل (فضاء + Hedera)',
  satellite_only: 'مطابَق فضائيًا فقط',
  ledger_only: 'موثَّق على Hedera فقط',
  unverified: 'غير موثَّق بعد',
}

function fmt(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('ar-SA')
}

// يبني HTML بنفس اللغة البصرية المستخدمة في تقرير المشروع الواحد (reports/[id]/pdf)
// حفاظًا على هوية بصرية موحّدة عبر كل مخرجات المنصة القابلة للتحميل. لا يُعاد حساب أي
// رقم هنا — كل شيء مقروء حرفيًا من PortfolioReport.metrics كما جُمِّد وقت الإصدار،
// بنفس مبدأ عدم تعديل AttestationBatch بعد التوثيق.
function generatePortfolioHTML(report: any, metrics: any, org: any, projectCount: number): string {
  const confidenceRows = [
    { label: 'جودة البيانات (قراءات مُدقَّقة)', value: metrics.confidenceBreakdown.components.dataQualityPct, weight: metrics.confidenceBreakdown.weights.dataQuality },
    { label: 'المطابقة الفضائية-الأرضية', value: metrics.confidenceBreakdown.components.satelliteVerificationPct, weight: metrics.confidenceBreakdown.weights.satelliteVerification },
    { label: 'التوثيق على Hedera', value: metrics.confidenceBreakdown.components.ledgerAttestationPct, weight: metrics.confidenceBreakdown.weights.ledgerAttestation },
  ]

  const definitionsHtml = Object.values(metrics.definitions as Record<string, string>)
    .map((text) => `<p style="margin:0 0 8px 0;">${text}</p>`)
    .join('')

  const limitationsHtml = (metrics.limitations as string[])
    .map((l) => `<li>${l}</li>`)
    .join('')

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>${report.title}</title>
<style>
  @page { size: A4; margin: 1.5cm; }
  * { box-sizing: border-box; }
  body { font-family: 'Tajawal', 'Cairo', 'Noto Sans Arabic', Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 20px; }
  .header { background: linear-gradient(135deg, #0f766e, #0891b2); color: white; padding: 25px; border-radius: 12px; margin-bottom: 25px; }
  .header h1 { margin: 0; font-size: 22px; }
  .header .subtitle { font-size: 13px; opacity: 0.9; margin-top: 5px; }
  .header .badge-draft { display: inline-block; margin-top: 8px; background: rgba(255,255,255,0.2); padding: 3px 10px; border-radius: 10px; font-size: 11px; }
  .section { margin-bottom: 22px; page-break-inside: avoid; }
  .section h2 { color: #0f766e; border-bottom: 2px solid #0f766e; padding-bottom: 6px; font-size: 17px; margin: 0 0 12px 0; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 12px 0; }
  .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; text-align: center; }
  .kpi-card .label { font-size: 9.5px; color: #64748b; margin-bottom: 3px; }
  .kpi-card .value { font-size: 19px; font-weight: 700; color: #0f766e; }
  .kpi-card .unit { font-size: 10px; color: #64748b; }
  .kpi-card.info .value { color: #0891b2; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 11px; }
  th { background: #0f766e; color: white; padding: 6px; text-align: right; font-weight: 600; }
  td { padding: 6px; border-bottom: 1px solid #e2e8f0; }
  tr:nth-child(even) { background: #f8fafc; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; }
  .badge-full { background: #dcfce7; color: #166534; }
  .badge-sat { background: #dbeafe; color: #1e40af; }
  .badge-ledger { background: #fef3c7; color: #92400e; }
  .badge-none { background: #f1f5f9; color: #475569; }
  .info-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dotted #e2e8f0; font-size: 12px; }
  .info-row .label { color: #64748b; }
  .info-row .value { font-weight: 600; }
  .conf-bar-track { background: #e2e8f0; border-radius: 6px; height: 10px; overflow: hidden; margin-top: 3px; }
  .conf-bar-fill { background: #0891b2; height: 100%; }
  .conf-row { margin-bottom: 10px; font-size: 11px; }
  .conf-row .top { display: flex; justify-content: space-between; margin-bottom: 3px; }
  .footer { margin-top: 25px; padding-top: 12px; border-top: 2px solid #0f766e; font-size: 10px; color: #64748b; text-align: center; }
  .limitations { font-size: 10.5px; color: #475569; padding-right: 16px; }
  .limitations li { margin-bottom: 5px; }
  .defs { font-size: 10.5px; color: #475569; line-height: 1.6; }
  .formula { font-family: monospace; direction: ltr; text-align: left; background: #f1f5f9; padding: 6px 10px; border-radius: 6px; font-size: 10px; margin: 6px 0; }
</style>
</head>
<body>
  <div class="header">
    <h1>إفصاح محفظة التمويل الأخضر — ${org.nameAr || org.name}</h1>
    <div class="subtitle">
      ${report.title} • الفترة: ${fmtDate(report.periodStart)} إلى ${fmtDate(report.periodEnd)} • ${projectCount} مشروعًا
    </div>
    <div class="badge-draft">الحالة: ${report.status === 'published' ? 'منشور' : 'مسودة'} — لقطة مُجمَّدة بتاريخ ${fmtDate(report.createdAt)}</div>
  </div>

  <div class="section">
    <h2>المؤشرات الرئيسية</h2>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="label">Green projects financed</div><div class="value">${fmt(metrics.greenProjectsFinanced)}</div></div>
      <div class="kpi-card"><div class="label">Solar capacity financed</div><div class="value">${fmt(metrics.solarCapacityFinancedMw)}</div><div class="unit">MW</div></div>
      <div class="kpi-card"><div class="label">Renewable electricity generated</div><div class="value">${fmt(metrics.renewableElectricityGeneratedGwh)}</div><div class="unit">GWh</div></div>
      <div class="kpi-card info"><div class="label">Financed avoided emissions</div><div class="value">${fmt(metrics.financedAvoidedEmissionsTco2e)}</div><div class="unit">tCO₂e</div></div>
      <div class="kpi-card"><div class="label">Carbon removals</div><div class="value">${fmt(metrics.carbonRemovalsTco2e)}</div><div class="unit">tCO₂e</div></div>
      <div class="kpi-card"><div class="label">Projects independently verified</div><div class="value">${fmt(metrics.projectsIndependentlyVerifiedPct)}</div><div class="unit">%</div></div>
      <div class="kpi-card"><div class="label">Satellite-verified projects</div><div class="value">${fmt(metrics.satelliteVerifiedProjectsPct)}</div><div class="unit">%</div></div>
      <div class="kpi-card info"><div class="label">Environmental data confidence</div><div class="value">${fmt(metrics.environmentalDataConfidencePct)}</div><div class="unit">%</div></div>
    </div>
    <div class="info-row"><span class="label">إجمالي الأثر الكامل لكل المشاريع (100%، للمقارنة مع نصيب الجهة الممولة أعلاه)</span><span class="value">${fmt(metrics.totalAvoidedEmissionsTco2e)} tCO₂e</span></div>
  </div>

  <div class="section">
    <h2>تفكيك مؤشر "ثقة البيانات البيئية"</h2>
    <div class="formula">${metrics.confidenceBreakdown.formula}</div>
    ${confidenceRows.map((c) => `
      <div class="conf-row">
        <div class="top"><span>${c.label} (وزن ${Math.round(c.weight * 100)}%)</span><span><strong>${fmt(c.value)}%</strong></span></div>
        <div class="conf-bar-track"><div class="conf-bar-fill" style="width:${Math.min(100, c.value)}%"></div></div>
      </div>
    `).join('')}
  </div>

  <div class="section">
    <h2>حالة التحقق لكل مشروع</h2>
    <table>
      <thead><tr><th>المشروع</th><th>الرمز</th><th>حالة التحقق</th></tr></thead>
      <tbody>
        ${(report.projectsDetail || []).map((p: any) => {
          const badgeClass = p.verificationStatus === 'fully_verified' ? 'badge-full'
            : p.verificationStatus === 'satellite_only' ? 'badge-sat'
            : p.verificationStatus === 'ledger_only' ? 'badge-ledger'
            : 'badge-none'
          return `<tr>
            <td>${p.projectName}</td>
            <td>${p.projectCode}</td>
            <td><span class="badge ${badgeClass}">${VERIFICATION_LABELS_AR[p.verificationStatus] || p.verificationStatus}</span></td>
          </tr>`
        }).join('')}
      </tbody>
    </table>
  </div>

  <div class="section">
    <h2>التعريفات المنهجية</h2>
    <div class="defs">${definitionsHtml}</div>
  </div>

  <div class="section">
    <h2>القيود المُفصَح عنها (Limitations)</h2>
    <ul class="limitations">${limitationsHtml}</ul>
  </div>

  ${report.methodologyNote ? `
  <div class="section">
    <h2>ملاحظة منهجية</h2>
    <p style="font-size:11px;color:#475569;">${report.methodologyNote}</p>
  </div>` : ''}

  <div class="footer">
    تم إصدار هذا الإفصاح آليًا من منصة رصد الأثر البيئي — الأرقام مُجمَّدة بتاريخ ${fmtDate(report.createdAt)} ولا تتغيّر تلقائيًا مع تحديث بيانات المشاريع لاحقًا.
    لإعادة الحساب بأحدث البيانات، أصدر لقطة جديدة من قسم "محفظة التمويل الأخضر".
  </div>
</body>
</html>`
}

// GET /api/portfolio-reports/[id]/pdf
// يولّد PDF من لقطة تقرير محفظة محفوظة مسبقًا — نفس خط أنابيب Playwright المستخدم
// في reports/[id]/pdf، بدون إعادة حساب أي رقم (اللقطة مُجمَّدة عمدًا).
export async function GET(request: NextRequest, { params }: Params) {
  let htmlPath: string | undefined
  let pdfPath: string | undefined

  try {
    const { id } = await params
    const auth = await requirePermission('portfolio:read')
    if (!auth.authorized) return auth.response

    const report = await db.portfolioReport.findUnique({
      where: { id },
      include: { organization: { select: { name: true, nameAr: true } } },
    })
    if (!report) {
      return NextResponse.json({ error: 'التقرير غير موجود' }, { status: 404 })
    }
    if (report.organizationId !== auth.user.organizationId) {
      return NextResponse.json({ error: 'لا يمكنك الوصول لهذا التقرير' }, { status: 403 })
    }

    const metrics = JSON.parse(report.metrics)
    const projectIds: string[] = JSON.parse(report.projectIds)

    // metrics.projects محفوظ ضمن نفس اللقطة (انظر POST /api/portfolio-reports) — تفصيل
    // حالة كل مشروع وقت الإصدار، بلا حاجة لإعادة استعلام أو إعادة حساب أي شيء.
    const projectsDetail = Array.isArray(metrics.projects) ? metrics.projects : []

    const reportForHtml = {
      ...report,
      projectsDetail,
    }

    const html = generatePortfolioHTML(reportForHtml, metrics, report.organization, projectIds.length)
    const reportName = `portfolio-${report.id}-${new Date(report.createdAt).toISOString().slice(0, 10)}`

    const tmpDir = path.join(process.cwd(), 'tmp', 'report-pdfs')
    if (!existsSync(tmpDir)) {
      await mkdir(tmpDir, { recursive: true })
    }
    htmlPath = path.join(tmpDir, `${reportName}-${Date.now()}.html`)
    pdfPath = htmlPath.replace('.html', '.pdf')
    await writeFile(htmlPath, html, 'utf-8')

    const scriptPath = path.join(process.cwd(), 'scripts', 'html-to-pdf.js')
    if (!existsSync(scriptPath)) {
      console.error('PDF script not found at:', scriptPath)
      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `attachment; filename="${reportName}.html"`,
        },
      })
    }

    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      const timeout = setTimeout(() => {
        try {
          proc.kill('SIGKILL')
        } catch (e) {}
        reject(new Error('PDF generation timeout after 30 seconds'))
      }, 30000)

      const proc = spawn('node', [scriptPath, htmlPath!, pdfPath!], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
        env: { ...process.env },
      })

      let stdout = ''
      let stderr = ''
      proc.stdout.on('data', (chunk) => { stdout += chunk.toString() })
      proc.stderr.on('data', (chunk) => { stderr += chunk.toString() })
      proc.on('close', async (code) => {
        clearTimeout(timeout)
        if (code !== 0) {
          console.error('Playwright exit code:', code, 'stderr:', stderr)
          reject(new Error(`Playwright failed (exit ${code}): ${stderr || stdout}`))
          return
        }
        try {
          const pdf = await readFile(pdfPath!)
          resolve(pdf)
        } catch (e: any) {
          reject(new Error(`Failed to read generated PDF: ${e.message}`))
        }
      })
      proc.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    })

    await unlink(htmlPath).catch(() => {})
    await unlink(pdfPath).catch(() => {})

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${reportName}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error: any) {
    console.error('Portfolio PDF generation error:', error.message || error)
    if (htmlPath) await unlink(htmlPath).catch(() => {})
    if (pdfPath) await unlink(pdfPath).catch(() => {})

    return NextResponse.json(
      { error: 'فشل توليد ملف PDF', details: error.message || String(error) },
      { status: 500 },
    )
  }
}

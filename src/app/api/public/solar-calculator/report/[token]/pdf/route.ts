import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { writeFile, mkdir, readFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { db } from '@/lib/db'
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware-utils'
import { generateSolarLeadReportHTML } from '@/lib/solar-report-template'
import type { SolarCalculatorResult } from '@/lib/solar-engine'

interface Params {
  params: Promise<{ token: string }>
}

// GET /api/public/solar-calculator/report/[token]/pdf
// PUBLIC — gated only by the unguessable `reportToken` (24 random bytes, hex),
// never the DB cuid, so the URL can be safely emailed/shared without exposing
// or letting anyone enumerate lead records. Follows the exact same
// Playwright HTML→PDF pipeline as src/app/api/reports/[id]/pdf/route.ts
// (scripts/html-to-pdf.js) so output is visually consistent with the rest
// of the platform's PDF reports.
export async function GET(request: NextRequest, { params }: Params) {
  let htmlPath: string | null = null
  let pdfPath: string | null = null

  try {
    const rateCheck = checkRateLimit(request, RATE_LIMITS.solarCalculatorPdf, 'solar-pdf')
    if (!rateCheck.allowed && rateCheck.response) {
      return new NextResponse(rateCheck.response.body, {
        status: rateCheck.response.status,
        headers: rateCheck.response.headers,
      })
    }

    const { token } = await params
    if (!token || token.length < 20) {
      return NextResponse.json({ error: 'رابط غير صالح' }, { status: 400 })
    }

    const lead = await db.solarCalculatorLead.findUnique({ where: { reportToken: token } })
    if (!lead) {
      return NextResponse.json({ error: 'التقرير غير موجود' }, { status: 404 })
    }

    const origin = request.nextUrl.origin
    const html = await generateSolarLeadReportHTML({
      id: lead.id,
      reportToken: lead.reportToken,
      fullName: lead.fullName,
      email: lead.email,
      phone: lead.phone,
      companyName: lead.companyName,
      userType: lead.userType,
      countryCode: lead.countryCode,
      createdAt: lead.createdAt,
      result: lead.resultSnapshot as unknown as SolarCalculatorResult,
      verifyUrl: `${origin}/api/public/solar-calculator/report/${lead.reportToken}/pdf`,
    })

    const tmpDir = path.join(process.cwd(), 'tmp', 'solar-lead-pdfs')
    if (!existsSync(tmpDir)) {
      await mkdir(tmpDir, { recursive: true })
    }
    const fileBase = `solar-report-${lead.id}-${Date.now()}`
    htmlPath = path.join(tmpDir, `${fileBase}.html`)
    pdfPath = path.join(tmpDir, `${fileBase}.pdf`)
    await writeFile(htmlPath, html, 'utf-8')

    const scriptPath = path.join(process.cwd(), 'scripts', 'html-to-pdf.js')
    const pdfBuffer: Buffer = await new Promise((resolve, reject) => {
      const proc = spawn('node', [scriptPath, htmlPath!, pdfPath!], {
        cwd: process.cwd(),
      })
      let stderr = ''
      proc.stderr?.on('data', (d) => { stderr += d.toString() })
      proc.on('close', async (code) => {
        if (code !== 0) {
          reject(new Error(`PDF generation failed (exit ${code}): ${stderr}`))
          return
        }
        try {
          const pdf = await readFile(pdfPath!)
          resolve(pdf)
        } catch (err) {
          reject(err)
        }
      })
      proc.on('error', (err) => {
        console.error('Process spawn error:', err)
        reject(err)
      })
    })

    await unlink(htmlPath).catch(() => {})
    await unlink(pdfPath).catch(() => {})
    htmlPath = null
    pdfPath = null

    await db.solarCalculatorLead.update({
      where: { id: lead.id },
      data: { reportDownloadCount: { increment: 1 }, reportLastDownloadedAt: new Date() },
    })

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="solar-green-loan-report-${lead.id.slice(0, 8)}.pdf"`,
      },
    })
  } catch (error) {
    console.error('Solar calculator PDF error:', error)
    if (htmlPath) await unlink(htmlPath).catch(() => {})
    if (pdfPath) await unlink(pdfPath).catch(() => {})
    return NextResponse.json({ error: 'تعذّر توليد التقرير' }, { status: 500 })
  }
}

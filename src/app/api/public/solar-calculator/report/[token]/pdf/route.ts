import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware-utils'
import { generateSolarLeadReportHTML } from '@/lib/solar-report-template'
import { renderHtmlToPdfBuffer } from '@/lib/render-html-to-pdf'
import type { SolarCalculatorResult } from '@/lib/solar-engine'

interface Params {
  params: Promise<{ token: string }>
}

// GET /api/public/solar-calculator/report/[token]/pdf
// PUBLIC — gated only by the unguessable `reportToken` (24 random bytes, hex),
// never the DB cuid, so the URL can be safely emailed/shared without exposing
// or letting anyone enumerate lead records. Uses the same Playwright HTML→PDF
// pipeline as src/app/api/reports/[id]/pdf/route.ts (renderHtmlToPdfBuffer →
// scripts/html-to-pdf.js), and the exact same helper the Gmail sender in
// src/lib/solar-lead-notify.ts uses, so the downloaded copy and the emailed
// copy are always byte-identical.
export async function GET(request: NextRequest, { params }: Params) {
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

    const pdfBuffer = await renderHtmlToPdfBuffer(html, `solar-report-${lead.id}-${Date.now()}`)

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
    return NextResponse.json({ error: 'تعذّر توليد التقرير' }, { status: 500 })
  }
}

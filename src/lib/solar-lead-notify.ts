// Email delivery for the Solar Calculator lead report — via Gmail SMTP
// (nodemailer), using a Gmail "App Password" (not the account's normal
// login password — Google requires this for third-party SMTP access when
// 2-Step Verification is on, which it must be to generate one).
//
// Required env vars (see .env):
//   GMAIL_USER          - the sending Gmail address, e.g. reports@yourdomain.com or you@gmail.com
//   GMAIL_APP_PASSWORD  - a 16-character App Password from
//                          https://myaccount.google.com/apppasswords
//                          (Google Account → Security → 2-Step Verification must be ON first)
// Optional:
//   GMAIL_FROM_NAME     - display name for the "From" header (default: "Eco Ledger")
//
// If these are not set, this function safely no-ops and logs a warning —
// the lead is still saved and the PDF is still downloadable immediately via
// the reportUrl returned by POST /api/public/solar-calculator/lead, so a
// missing/incorrect Gmail config never blocks lead capture.

import nodemailer from 'nodemailer'
import { db } from '@/lib/db'
import { generateSolarLeadReportHTML } from '@/lib/solar-report-template'
import { renderHtmlToPdfBuffer } from '@/lib/render-html-to-pdf'
import type { SolarCalculatorResult } from '@/lib/solar-engine'

export interface SendLeadReportEmailInput {
  leadId: string
  email: string
  reportToken: string
}

let cachedTransporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter | null {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) return null

  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    })
  }
  return cachedTransporter
}

export async function sendLeadReportEmail(
  input: SendLeadReportEmailInput,
): Promise<{ sent: boolean; reason?: string }> {
  const transporter = getTransporter()
  if (!transporter) {
    console.warn(
      `[solar-lead-notify] Gmail not configured (GMAIL_USER / GMAIL_APP_PASSWORD unset). ` +
        `Skipping email for lead ${input.leadId}. The lead was still saved and the PDF is ` +
        `downloadable at /api/public/solar-calculator/report/${input.reportToken}/pdf.`,
    )
    return { sent: false, reason: 'gmail_not_configured' }
  }

  const lead = await db.solarCalculatorLead.findUnique({ where: { id: input.leadId } })
  if (!lead) {
    console.error(`[solar-lead-notify] Lead ${input.leadId} not found — cannot send email.`)
    return { sent: false, reason: 'lead_not_found' }
  }

  const result = lead.resultSnapshot as unknown as SolarCalculatorResult
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
    result,
    // No request context here (this runs outside an HTTP handler), so the
    // stamp's verify URL falls back to APP_URL if set, else a relative path
    // description — cosmetic only, doesn't affect the PDF's validity.
    verifyUrl: `${process.env.APP_URL || ''}/api/public/solar-calculator/report/${lead.reportToken}/pdf`,
  })

  const pdfBuffer = await renderHtmlToPdfBuffer(html, `solar-report-email-${lead.id}-${Date.now()}`)

  const fromName = process.env.GMAIL_FROM_NAME || 'Eco Ledger'
  const savings = Math.round(result.cashflow.netMonthlyCashflowDuringLoan).toLocaleString('en-US')

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${process.env.GMAIL_USER}>`,
      to: lead.email,
      subject: `تقرير القرض الأخضر الشمسي الخاص بك — ${lead.fullName}`,
      html: `
        <div dir="rtl" style="font-family: Tajawal, Arial, sans-serif; max-width: 560px; margin: 0 auto; color:#1a1a1a;">
          <div style="background: linear-gradient(135deg,#16a34a,#0891b2); color:#fff; padding:20px; border-radius:10px;">
            <h2 style="margin:0;">تقريرك جاهز يا ${escapeHtmlBasic(lead.fullName)} 🌞</h2>
          </div>
          <p style="line-height:1.8; margin-top:16px;">
            شكرًا لاستخدامك حاسبة القرض الأخضر الشمسي من Eco Ledger. مرفق لك تقرير PDF كامل
            يتضمن تفاصيل التمويل، التوفير المتوقع، والأثر البيئي — جاهز لعرضه على البنك أو الجهة الممولة.
          </p>
          <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:14px; margin:16px 0;">
            <div>صافي التوفير الشهري المتوقع: <strong>${savings} ${result.currency}</strong></div>
            <div>فترة الاسترداد التقديرية: <strong>${result.cashflow.simplePaybackYears ?? '—'} سنة</strong></div>
          </div>
          <p style="font-size:12px; color:#64748b; line-height:1.7;">
            هذه الأرقام تقديرية لأغراض التخطيط الأولي ولا تشكل عرض تمويل ملزمًا. سيتواصل معك فريقنا قريبًا.
          </p>
        </div>
      `,
      attachments: [
        {
          filename: `solar-green-loan-report-${lead.id.slice(0, 8)}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    })

    await db.solarCalculatorLead.update({ where: { id: lead.id }, data: { reportSentAt: new Date() } })
    return { sent: true }
  } catch (err) {
    console.error('[solar-lead-notify] Gmail send failed:', err)
    return { sent: false, reason: 'gmail_send_failed' }
  }
}

function escapeHtmlBasic(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

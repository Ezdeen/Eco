// Email delivery for the Solar Calculator lead report.
//
// Routes through the unified email service in src/lib/email.ts, which
// resolves settings from (in order): the admin-managed "email"
// IntegrationConfig (Settings → Integrations → Email (SMTP)), then
// GMAIL_USER/GMAIL_APP_PASSWORD env vars as a fallback. See src/lib/email.ts
// for the full resolution order and setup instructions.
//
// This function never blocks lead capture: if no provider is configured (or
// sending fails), the lead is still saved and the PDF is still downloadable
// immediately via the reportUrl returned by POST /api/public/solar-calculator/lead.

import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { generateSolarLeadReportHTML } from '@/lib/solar-report-template'
import { renderHtmlToPdfBuffer } from '@/lib/render-html-to-pdf'
import type { SolarCalculatorResult } from '@/lib/solar-engine'

export interface SendLeadReportEmailInput {
  leadId: string
  email: string
  reportToken: string
}

export async function sendLeadReportEmail(
  input: SendLeadReportEmailInput,
): Promise<{ sent: boolean; reason?: string }> {
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
    // No request context here (runs outside an HTTP handler) — falls back to
    // APP_URL if set. Cosmetic only, doesn't affect the PDF's validity.
    verifyUrl: `${process.env.APP_URL || ''}/api/public/solar-calculator/report/${lead.reportToken}/pdf`,
  })

  const pdfBuffer = await renderHtmlToPdfBuffer(html, `solar-report-email-${lead.id}-${Date.now()}`)
  const savings = Math.round(result.cashflow.netMonthlyCashflowDuringLoan).toLocaleString('en-US')

  const sendResult = await sendEmail({
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

  if (sendResult.sent) {
    await db.solarCalculatorLead.update({ where: { id: lead.id }, data: { reportSentAt: new Date() } })
  }

  return sendResult
}

function escapeHtmlBasic(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

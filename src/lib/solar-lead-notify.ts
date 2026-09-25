// Email delivery for the Solar Calculator lead report.
//
// HONESTY NOTE: this codebase has no email/SMTP/ESP integration anywhere
// (grep confirms no nodemailer/resend/SES usage exists). Rather than fabricate
// a call to a provider that isn't configured — which would silently fail in
// production and give a false sense that "email delivery" is done — this
// function is a clearly-marked, safe no-op until a real provider is wired in.
//
// The lead is NOT blocked by this: the PDF is downloadable immediately via
// `reportUrl` returned by POST /api/public/solar-calculator/lead, regardless
// of whether this function actually sends anything.
//
// TO ENABLE REAL EMAIL DELIVERY:
//   1. Pick a provider (Resend, Postmark, SES, or SMTP via nodemailer) and
//      add it to package.json.
//   2. Set the matching env var(s) below (e.g. RESEND_API_KEY).
//   3. Replace the `if (!apiKey) { ... return }` branch with the provider's
//      send call, attaching the PDF from
//      GET /api/public/solar-calculator/report/{reportToken}/pdf
//      (fetch it server-side, or render generateSolarLeadReportHTML directly
//      and pipe it through scripts/html-to-pdf.js exactly like
//      src/app/api/reports/[id]/pdf/route.ts does).

export interface SendLeadReportEmailInput {
  leadId: string
  email: string
  reportToken: string
}

export async function sendLeadReportEmail(input: SendLeadReportEmailInput): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.SOLAR_LEAD_EMAIL_API_KEY

  if (!apiKey) {
    console.warn(
      `[solar-lead-notify] Email provider not configured (SOLAR_LEAD_EMAIL_API_KEY unset). ` +
        `Skipping email for lead ${input.leadId}. The lead was still saved and the PDF is ` +
        `downloadable at /api/public/solar-calculator/report/${input.reportToken}/pdf.`,
    )
    return { sent: false, reason: 'email_provider_not_configured' }
  }

  // Placeholder for the real provider call once configured — intentionally not
  // implemented against a guessed API shape.
  console.info(`[solar-lead-notify] Would send report email to ${input.email} for lead ${input.leadId}`)
  return { sent: false, reason: 'not_implemented' }
}

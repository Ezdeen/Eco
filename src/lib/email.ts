// Unified email sending service.
//
// Resolution order (first match wins):
//   0. RESEND_API_KEY (+ RESEND_FROM_EMAIL) — sends over Resend's HTTPS API
//      (port 443) instead of raw SMTP. Added because several hosts (notably
//      Render's free web services, since 2025-09-26) block outbound traffic
//      on SMTP ports 25/465/587 entirely, which made options 1 and 2 below
//      fail with ETIMEDOUT no matter how correct the credentials were. This
//      path is purely additive: if RESEND_API_KEY isn't set, behavior is
//      identical to before. If a Resend send fails, we fall through to the
//      SMTP path as a best-effort backup rather than giving up immediately.
//   1. The admin-managed "email" IntegrationConfig row (Settings → Integrations
//      → Email (SMTP)) — host/port/from stored in `config` JSON, password
//      encrypted in `encryptedSecret` via src/lib/crypto.ts. This is the
//      normal path once an admin has filled in the panel and toggled it active.
//      Kept as-is for the future: once the app is on a plan/host that allows
//      outbound SMTP (e.g. a paid Render instance), this works unmodified.
//   2. GMAIL_USER / GMAIL_APP_PASSWORD env vars — a zero-admin-setup fallback
//      (see .env), so the solar-calculator lead report keeps working even
//      before anyone configures the admin panel. Also kept as-is for later.
//   3. Nothing configured → sendEmail() safely no-ops and returns
//      { sent: false, reason: 'not_configured' }. Callers must treat email as
//      best-effort and never block a user-facing action on it succeeding.

import nodemailer from 'nodemailer'
import { db } from '@/lib/db'
import { decryptSecret } from '@/lib/crypto'

export interface ResolvedEmailConfig {
  host: string
  port: number
  secure: boolean
  user: string // SMTP auth username — doubles as the "From" address (matches the admin panel's single "From Email" field)
  pass: string
  fromName: string
  source: 'integration-config' | 'env-fallback'
}

export async function resolveEmailConfig(): Promise<ResolvedEmailConfig | null> {
  const integration = await db.integrationConfig.findUnique({ where: { name: 'email' } })
  if (integration?.isActive && integration.encryptedSecret && integration.config) {
    try {
      const cfg = JSON.parse(integration.config) as { host?: string; port?: string | number; from?: string }
      if (cfg.host && cfg.from) {
        const port = Number(cfg.port) || 587
        return {
          host: cfg.host,
          port,
          secure: port === 465,
          user: cfg.from,
          pass: decryptSecret(integration.encryptedSecret),
          fromName: 'Eco Ledger',
          source: 'integration-config',
        }
      }
    } catch (err) {
      console.error('[email] Failed to read "email" IntegrationConfig, falling back to env vars:', err)
    }
  }

  const gmailUser = process.env.GMAIL_USER
  const gmailPass = process.env.GMAIL_APP_PASSWORD
  if (gmailUser && gmailPass) {
    return {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      user: gmailUser,
      pass: gmailPass,
      fromName: process.env.GMAIL_FROM_NAME || 'Eco Ledger',
      source: 'env-fallback',
    }
  }

  return null
}

async function getEmailTransporter(): Promise<{ transporter: nodemailer.Transporter; config: ResolvedEmailConfig } | null> {
  const config = await resolveEmailConfig()
  if (!config) return null
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure, // true → implicit TLS (465); false → STARTTLS on 587/25
    auth: { user: config.user, pass: config.pass },
  })
  return { transporter, config }
}

export interface SendEmailInput {
  to: string
  subject: string
  html: string
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>
}

/**
 * Sends via Resend's HTTPS API (https://api.resend.com/emails) instead of
 * SMTP. Requires RESEND_API_KEY and RESEND_FROM_EMAIL env vars — if either is
 * missing this simply returns `not_configured` so callers fall back to SMTP.
 *
 * Why: this travels over port 443 like any normal HTTPS request, so it isn't
 * affected by hosts that block outbound SMTP ports (25/465/587) — e.g.
 * Render's free web services since 2025-09-26.
 */
async function sendViaResendApi(input: SendEmailInput): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL
  if (!apiKey || !fromEmail) {
    return { sent: false, reason: 'not_configured' }
  }
  const fromName = process.env.RESEND_FROM_NAME || 'Eco Ledger'

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        attachments: input.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content.toString('base64'),
        })),
      }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '<no response body>')
      console.error(`[email] Resend API send failed (HTTP ${res.status}):`, errText)
      return { sent: false, reason: 'resend_api_error' }
    }
    return { sent: true }
  } catch (err) {
    console.error('[email] Resend API request failed:', err)
    return { sent: false, reason: 'resend_network_error' }
  }
}

export async function sendEmail(input: SendEmailInput): Promise<{ sent: boolean; reason?: string }> {
  // Try the HTTP-based provider first (see sendViaResendApi for why). Purely
  // additive: no-ops immediately if RESEND_API_KEY/RESEND_FROM_EMAIL aren't set,
  // so nothing changes for setups that don't use it.
  if (process.env.RESEND_API_KEY) {
    const resendResult = await sendViaResendApi(input)
    if (resendResult.sent) return resendResult
    console.warn(
      '[email] Resend send did not succeed (reason: ' +
        resendResult.reason +
        '), falling back to SMTP path...',
    )
    // Falls through to the SMTP path below as a best-effort backup.
  }

  const resolved = await getEmailTransporter()
  if (!resolved) {
    console.warn(
      '[email] No provider configured — activate "Email (SMTP)" in Settings → Integrations, ' +
        'or set GMAIL_USER/GMAIL_APP_PASSWORD in .env. Skipping send.',
    )
    return { sent: false, reason: 'not_configured' }
  }

  try {
    await resolved.transporter.sendMail({
      from: `"${resolved.config.fromName}" <${resolved.config.user}>`,
      to: input.to,
      subject: input.subject,
      html: input.html,
      attachments: input.attachments,
    })
    return { sent: true }
  } catch (err) {
    console.error('[email] sendMail failed:', err)
    return { sent: false, reason: 'send_failed' }
  }
}

/** Used by POST /api/integration-config/[id]/test for the "email" integration.
 *  Note: this only verifies the SMTP row. If RESEND_API_KEY is set, actual
 *  sends currently go through Resend instead (see sendEmail) regardless of
 *  what this test reports — SMTP is just kept ready for later. */
export async function testEmailConnection(): Promise<{ success: boolean; message: string }> {
  const resendNote = process.env.RESEND_API_KEY
    ? ' ⚠️ ملاحظة: الإرسال الفعلي حاليًا يتم عبر Resend API (RESEND_API_KEY مُفعّل)، وهذا الفحص لإعدادات SMTP الاحتياطية فقط.'
    : ''

  const resolved = await getEmailTransporter()
  if (!resolved) {
    return {
      success: false,
      message:
        'لا توجد إعدادات بريد SMTP صالحة — أدخل بيانات SMTP وفعّل التكامل، أو اضبط GMAIL_USER/GMAIL_APP_PASSWORD في .env.' +
        resendNote,
    }
  }
  try {
    await resolved.transporter.verify()
    const sourceLabel = resolved.config.source === 'integration-config' ? 'إعدادات لوحة الإدارة' : 'متغيرات البيئة GMAIL_*'
    return { success: true, message: `تم الاتصال بخادم ${resolved.config.host} بنجاح (${sourceLabel}).${resendNote}` }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'فشل الاتصال بخادم SMTP'
    return { success: false, message: message + resendNote }
  }
}

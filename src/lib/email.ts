// Unified email sending service.
//
// Resolution order (first match wins):
//   1. The admin-managed "email" IntegrationConfig row (Settings → Integrations
//      → Email (SMTP)) — host/port/from stored in `config` JSON, password
//      encrypted in `encryptedSecret` via src/lib/crypto.ts. This is the
//      normal path once an admin has filled in the panel and toggled it active.
//   2. GMAIL_USER / GMAIL_APP_PASSWORD env vars — a zero-admin-setup fallback
//      (see .env), so the solar-calculator lead report keeps working even
//      before anyone configures the admin panel.
//   3. Neither configured → sendEmail() safely no-ops and returns
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

export async function sendEmail(input: SendEmailInput): Promise<{ sent: boolean; reason?: string }> {
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

/** Used by POST /api/integration-config/[id]/test for the "email" integration. */
export async function testEmailConnection(): Promise<{ success: boolean; message: string }> {
  const resolved = await getEmailTransporter()
  if (!resolved) {
    return {
      success: false,
      message: 'لا توجد إعدادات بريد صالحة — أدخل بيانات SMTP وفعّل التكامل، أو اضبط GMAIL_USER/GMAIL_APP_PASSWORD في .env',
    }
  }
  try {
    await resolved.transporter.verify()
    const sourceLabel = resolved.config.source === 'integration-config' ? 'إعدادات لوحة الإدارة' : 'متغيرات البيئة GMAIL_*'
    return { success: true, message: `تم الاتصال بخادم ${resolved.config.host} بنجاح (${sourceLabel})` }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'فشل الاتصال بخادم SMTP'
    return { success: false, message }
  }
}

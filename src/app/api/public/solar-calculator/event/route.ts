import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { z } from 'zod'
import { db } from '@/lib/db'
import { checkRateLimit, RATE_LIMITS, getClientIP } from '@/lib/middleware-utils'
import { runSolarCalculator, DEFAULT_CLIENT_FACTORS } from '@/lib/solar-engine'

// POST /api/public/solar-calculator/event
// PUBLIC, fire-and-forget, NO personal data collected (no name/email/phone —
// that only exists once a visitor crosses the SolarCalculatorLead gate).
// Lets marketing measure the pre-gate funnel: how many anonymous sessions ran
// the on-screen teaser vs. how many went on to submit the full lead form.
// Best-effort: the client should not await/block the UI on this call.

const eventSchema = z.object({
  sessionId: z.string().trim().max(100).optional(),
  userType: z.enum(['individual', 'sme']),
  monthlyElectricityBill: z.number().finite().nonnegative().max(10_000_000),
  loanPercent: z.number().finite().min(0).max(100),
  loanTermYears: z.number().int().min(1).max(10),
  loanInterestRatePct: z.number().finite().min(0).max(50),
  countryCode: z.string().trim().length(2).default('SA'),
  currency: z.string().trim().max(6).default('SAR'),
  locale: z.enum(['ar', 'en']).default('ar'),
  utmSource: z.string().trim().max(200).optional(),
  utmCampaign: z.string().trim().max(200).optional(),
})

export async function POST(request: NextRequest) {
  try {
    // Lighter, more permissive limit than the lead gate — this fires on slider changes.
    const rateCheck = checkRateLimit(request, { maxRequests: 60, windowMs: 60 * 1000 }, 'solar-event')
    if (!rateCheck.allowed && rateCheck.response) {
      return new NextResponse(rateCheck.response.body, {
        status: rateCheck.response.status,
        headers: rateCheck.response.headers,
      })
    }

    const body = await request.json()
    const parsed = eventSchema.safeParse(body)
    if (!parsed.success) {
      // Analytics-only endpoint — fail soft, never surface validation noise to the visitor.
      return NextResponse.json({ ok: false }, { status: 204 })
    }
    const data = parsed.data

    const result = runSolarCalculator(
      {
        userType: data.userType,
        monthlyElectricityBill: data.monthlyElectricityBill,
        loanPercent: data.loanPercent,
        loanTermYears: data.loanTermYears,
        loanInterestRatePct: data.loanInterestRatePct,
      },
      { ...DEFAULT_CLIENT_FACTORS, currency: data.currency },
    )

    const ip = getClientIP(request)
    const ipHash = ip && ip !== 'unknown' ? crypto.createHash('sha256').update(ip).digest('hex') : null

    await db.solarCalculatorEvent.create({
      data: {
        sessionId: data.sessionId || null,
        userType: data.userType,
        monthlyElectricityBill: data.monthlyElectricityBill,
        loanPercent: data.loanPercent,
        loanTermYears: data.loanTermYears,
        countryCode: data.countryCode,
        currency: data.currency,
        resultSnapshot: result as unknown as object,
        ipHash,
        userAgent: request.headers.get('user-agent') || null,
        utmSource: data.utmSource || null,
        utmCampaign: data.utmCampaign || null,
        locale: data.locale,
      },
    })

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error) {
    // Analytics-only — never break the visitor experience over a logging failure.
    console.error('Solar calculator event log error:', error)
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}

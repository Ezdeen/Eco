import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/db'
import { checkRateLimit, RATE_LIMITS, getClientIP } from '@/lib/middleware-utils'
import { solarCalculatorLeadSchema } from '@/lib/validation'
import { runSolarCalculator, DEFAULT_CLIENT_FACTORS, type SolarCalculatorFactors } from '@/lib/solar-engine'
import { computeReportVerificationHash } from '@/lib/solar-report-template'
import { getEmissionFactor, getTariff, getConversionFactor } from '@/lib/reference-data'

// POST /api/public/solar-calculator/lead
// PUBLIC — no auth required. This is the lead-gen "gate": on submit we
// (1) rate-limit by IP, (2) validate the payload, (3) recompute the full
// calculator SERVER-SIDE using authoritative, DB-backed reference data
// (never trust figures the client may have computed with DEFAULT_CLIENT_FACTORS),
// (4) persist the lead + a lightweight priority score for sales/marketing,
// and (5) return the full report payload + a download link for the PDF.
//
// Email delivery of the PDF ("Email instant execution...") is intentionally
// NOT wired to a live SMTP/ESP provider here — none exists yet in this
// codebase (see src/lib/solar-lead-notify.ts for the integration point and
// the TODO explaining exactly what to plug in).

const CURRENCY_BY_COUNTRY: Record<string, string> = {
  SA: 'SAR', AE: 'AED', QA: 'QAR', KW: 'KWD', BH: 'BHD', OM: 'OMR', EG: 'EGP', JO: 'JOD', PS: 'ILS',
}

async function resolveServerFactors(countryCode: string): Promise<SolarCalculatorFactors> {
  const [emission, tariff, treeFactor, carFactor] = await Promise.all([
    getEmissionFactor(countryCode),
    getTariff(countryCode, 'retail'),
    getConversionFactor('tree_co2'),
    getConversionFactor('car_co2_per_km'),
  ])

  return {
    currency: tariff?.currency || CURRENCY_BY_COUNTRY[countryCode] || DEFAULT_CLIENT_FACTORS.currency,
    gridEmissionFactor: emission.factor,
    tariffRetailPerKwh: tariff?.rate || DEFAULT_CLIENT_FACTORS.tariffRetailPerKwh,
    // Not yet backed by a reference-data table — platform-wide indicative constants.
    // TODO: migrate to ConversionFactor (factorType: 'solar_capex_per_kwp' / 'specific_yield_kwh_per_kwp')
    // the same way emission/tariff factors are versioned, once regional EPC cost data is available.
    costPerKwpInstalled: DEFAULT_CLIENT_FACTORS.costPerKwpInstalled,
    specificYieldKwhPerKwp: DEFAULT_CLIENT_FACTORS.specificYieldKwhPerKwp,
    treeCo2PerYear: treeFactor.value,
    carCo2PerKm: carFactor.value,
    avgCarKmPerYear: DEFAULT_CLIENT_FACTORS.avgCarKmPerYear,
    carbonCreditPricePerTon: DEFAULT_CLIENT_FACTORS.carbonCreditPricePerTon,
    source: emission.fromDb && treeFactor.fromDb && carFactor.fromDb ? 'db' : 'db+fallback',
  }
}

export async function POST(request: NextRequest) {
  try {
    const rateCheck = checkRateLimit(request, RATE_LIMITS.solarCalculatorLead, 'solar-lead')
    if (!rateCheck.allowed && rateCheck.response) {
      return new NextResponse(rateCheck.response.body, {
        status: rateCheck.response.status,
        headers: rateCheck.response.headers,
      })
    }

    const body = await request.json()
    const parsed = solarCalculatorLeadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'بيانات النموذج غير صحيحة', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const data = parsed.data

    const factors = await resolveServerFactors(data.countryCode)
    const result = runSolarCalculator(
      {
        userType: data.userType,
        monthlyElectricityBill: data.monthlyElectricityBill,
        estimatedSystemCostOverride: data.estimatedSystemCostOverride ?? null,
        loanPercent: data.loanPercent,
        loanTermYears: data.loanTermYears,
        loanInterestRatePct: data.loanInterestRatePct,
        savingsRatio: data.savingsRatio,
      },
      factors,
    )

    const reportToken = crypto.randomBytes(24).toString('hex')
    const ip = getClientIP(request)
    const ipHash = ip && ip !== 'unknown' ? crypto.createHash('sha256').update(ip).digest('hex') : null
    const createdAt = new Date()

    const lead = await db.solarCalculatorLead.create({
      data: {
        fullName: data.fullName,
        email: data.email.toLowerCase(),
        phone: data.phone || null,
        companyName: data.companyName || null,
        userType: data.userType,
        locale: data.locale,
        countryCode: data.countryCode,

        monthlyElectricityBill: data.monthlyElectricityBill,
        estimatedSystemCostOverride: data.estimatedSystemCostOverride ?? null,
        loanPercent: data.loanPercent,
        loanTermYears: data.loanTermYears,
        loanInterestRatePct: data.loanInterestRatePct,
        savingsRatio: result.inputs.savingsRatio,

        currency: result.currency,
        estimatedSystemCost: result.loan.estimatedSystemCost,
        loanAmount: result.loan.loanAmount,
        equityDownPayment: result.loan.equityDownPayment,
        monthlyPMT: result.loan.monthlyPMT,
        monthlySavings: result.cashflow.monthlySavings,
        netMonthlyCashflowDuringLoan: result.cashflow.netMonthlyCashflowDuringLoan,
        netMonthlyCashflowAfterLoan: result.cashflow.netMonthlyCashflowAfterLoan,
        simplePaybackYears: result.cashflow.simplePaybackYears,
        discountedPaybackYears: result.cashflow.discountedPaybackYears,
        cumulativeROI20yrPct: result.cashflow.cumulativeROI20yrPct,
        cumulativeNetCashflow20yr: result.cashflow.cumulativeNetCashflow20yr,

        annualCo2AvoidedTons: result.carbon.avoidedCO2TonsPerYear,
        lifetimeCo2AvoidedTons: result.carbon.avoidedCO2TonsLifetime,
        potentialCarbonCreditIncomeAnnual: result.carbon.potentialCarbonCreditIncomeAnnual,
        treesEquivalentPerYear: result.carbon.treesEquivalentPerYear,
        carsRemovedEquivalent: result.carbon.carsRemovedEquivalent,

        priorityScore: result.leadScore.score,
        priority: result.leadScore.priority,
        scoreReasons: result.leadScore.reasons,
        resultSnapshot: result as unknown as object,

        reportToken,
        reportGeneratedAt: createdAt,
        reportVerificationHash: computeReportVerificationHash({
          id: '', // set below once we have the real id — placeholder replaced after create
          reportToken,
          fullName: data.fullName,
          email: data.email.toLowerCase(),
          userType: data.userType,
          countryCode: data.countryCode,
          createdAt,
          result,
          phone: data.phone || null,
          companyName: data.companyName || null,
        }),

        utmSource: data.utmSource || null,
        utmCampaign: data.utmCampaign || null,
        ipHash,
        userAgent: request.headers.get('user-agent') || null,
      },
    })

    // The verification hash embeds `id` but the id doesn't exist until after create().
    // Recompute once and persist the corrected hash so the PDF stamp is fully self-consistent.
    const finalHash = computeReportVerificationHash({
      id: lead.id,
      reportToken,
      fullName: data.fullName,
      email: data.email.toLowerCase(),
      userType: data.userType,
      countryCode: data.countryCode,
      createdAt,
      result,
      phone: data.phone || null,
      companyName: data.companyName || null,
    })
    await db.solarCalculatorLead.update({ where: { id: lead.id }, data: { reportVerificationHash: finalHash } })

    // Best-effort email dispatch — see src/lib/solar-lead-notify.ts. Never blocks the response;
    // the PDF is downloadable immediately via reportUrl regardless of email delivery status.
    void notifyLeadCaptured(lead.id, data.email, reportToken).catch((err) =>
      console.error('[solar-calculator] notifyLeadCaptured failed (non-blocking):', err),
    )

    return NextResponse.json({
      leadId: lead.id,
      reportToken,
      reportUrl: `/api/public/solar-calculator/report/${reportToken}/pdf`,
      result,
      disclaimer:
        'هذه النتائج تقديرية لأغراض التخطيط الأولي فقط ولا تشكل عرض تمويل ملزمًا. سيتواصل معك فريقنا لمراجعة الطلب مع الجهة الممولة.',
    })
  } catch (error) {
    console.error('Solar calculator lead API error:', error)
    return NextResponse.json({ error: 'خطأ في الخادم الداخلي' }, { status: 500 })
  }
}

async function notifyLeadCaptured(leadId: string, email: string, reportToken: string) {
  const { sendLeadReportEmail } = await import('@/lib/solar-lead-notify')
  await sendLeadReportEmail({ leadId, email, reportToken })
}

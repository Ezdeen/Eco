import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/authorization'

// Investment calculator - runs entirely server-side, no external dependencies
//
// CURRENCY: this endpoint performs no FX conversion. `capex`, `opexAnnual`,
// `tariffRetail`, `tariffFeedIn`, and every derived money figure (npv, revenue,
// debt service, lcoe, ...) are assumed to already be denominated in ONE single
// currency - whichever the caller supplies inputs in. The `currency` field
// below simply echoes that back so the client can label figures correctly;
// it must NOT be hardcoded to 'SAR', since `location` can be a non-Saudi city
// while the caller's money inputs are meant to be in a different currency.
// Mixing currencies (e.g. entering capex in AED but tariffs in SAR) will
// silently produce meaningless results - the API cannot detect this.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth.authorized) return auth.response

    const body = await request.json()
    const {
      capacityKwp,
      panelAreaM2,
      tiltDegrees,
      azimuthDegrees,
      technology,
      capex,
      opexAnnual,
      degradationRate, // e.g. 0.005 for 0.5%/year
      financingRate, // 0-1, fraction of capex financed by debt
      loanTermYears,
      loanInterestRate, // annual nominal interest rate on the loan, 0-1. Independent of discountRate.
      tariffRetail,
      tariffFeedIn,
      selfConsumptionRate, // 0-1
      inflationRate,
      discountRate, // treated as a NOMINAL discount rate, applied to nominal (inflation-escalated) cash flows
      systemLifetimeYears,
      location,
      currency, // ISO 4217 code for ALL monetary inputs above, e.g. 'SAR', 'AED'. Defaults to 'SAR' only if omitted.
    } = body

    // Validate required
    if (!capacityKwp || !capex || !tariffRetail) {
      return NextResponse.json({ error: 'capacityKwp, capex, tariffRetail are required' }, { status: 400 })
    }

    const outputCurrency = (currency || 'SAR').toUpperCase()

    // Estimate annual energy production (simple model)
    // PSH = Peak Sun Hours, varies by location. Covers the GCC/Levant locations
    // this platform reports on elsewhere (see reference-data.ts), not Saudi cities only.
    const PSH_MAP: Record<string, number> = {
      riyadh: 6.5,
      jeddah: 6.2,
      dammam: 6.3,
      mecca: 6.4,
      medina: 6.6,
      abu_dhabi: 6.0,
      dubai: 5.9,
      doha: 5.8,
      kuwait_city: 5.9,
      manama: 5.7,
      muscat: 5.9,
      cairo: 6.0,
      amman: 5.8,
      default: 6.0,
    }
    const psh = PSH_MAP[(location || '').toLowerCase()] || PSH_MAP.default
    const systemLosses = 0.14 // 14% losses
    const inverterEfficiency = 0.97
    const annualEnergyYear1 = capacityKwp * psh * 365 * (1 - systemLosses) * inverterEfficiency // kWh

    // Annual revenue & savings
    const selfConsumed = annualEnergyYear1 * (selfConsumptionRate || 0.7)
    const exported = annualEnergyYear1 * (1 - (selfConsumptionRate || 0.7))
    const annualRevenueYear1 = selfConsumed * tariffRetail + exported * (tariffFeedIn || tariffRetail * 0.5)

    // Carbon avoided. Grid emission factor varies by country - reuse the same
    // country coverage as reference-data.ts's GridEmissionFactor seed instead of
    // a Saudi-only constant, since `location` can be a non-Saudi city.
    const EMISSION_FACTOR_MAP: Record<string, number> = {
      riyadh: 0.432, jeddah: 0.432, dammam: 0.432, mecca: 0.432, medina: 0.432, // SA
      abu_dhabi: 0.401, dubai: 0.401, // AE
      doha: 0.410, // QA
      kuwait_city: 0.520, // KW
      manama: 0.470, // BH
      muscat: 0.480, // OM
      cairo: 0.450, // EG
      amman: 0.480, // JO
      default: 0.432,
    }
    const emissionFactor = EMISSION_FACTOR_MAP[(location || '').toLowerCase()] || EMISSION_FACTOR_MAP.default
    const annualCo2AvoidedYear1 = annualEnergyYear1 * emissionFactor // kg

    // --- Debt service (loan amortization), computed BEFORE the cash-flow loop
    // so the equity-side (levered) cash flows can actually subtract it.
    // The loan's interest rate is a financing input, independent of the
    // project's discount rate: the discount rate reflects the cost of
    // capital/required return used for NPV, while the loan rate is whatever
    // the lender charges - reusing one for the other was a modeling error.
    const loanAmount = capex * (financingRate || 0)
    const equityCapex = capex - loanAmount
    const loanTermMonths = (loanTermYears || 0) * 12
    const annualLoanRate = loanInterestRate != null ? loanInterestRate : (discountRate || 0.08)
    const monthlyInterestRate = annualLoanRate / 12
    const monthlyPayment = loanTermMonths > 0 && loanAmount > 0
      ? loanAmount * (monthlyInterestRate * Math.pow(1 + monthlyInterestRate, loanTermMonths)) /
        (Math.pow(1 + monthlyInterestRate, loanTermMonths) - 1)
      : 0
    const annualDebtService = monthlyPayment * 12

    // Year-by-year cash flows
    const cashFlows: {
      year: number
      energy: number
      revenue: number
      opex: number
      debtService: number
      netCashFlow: number
      cumulativeCashFlow: number
      co2Avoided: number
    }[] = []

    let totalEnergy = 0
    let totalRevenue = 0
    let totalOpex = 0
    let totalCo2 = 0
    // Levered analysis: the equity investor only puts in equityCapex up front
    // (capex minus the loan), and later pays annual debt service out of
    // operating cash flow. With no financing (financingRate falsy),
    // equityCapex === capex, matching the old unlevered model.
    let cumulativeCashFlow = -equityCapex

    // Year 0 (initial investment - equity portion only; the loan-funded
    // portion is not the equity investor's own cash outlay)
    cashFlows.push({
      year: 0,
      energy: 0,
      revenue: 0,
      opex: 0,
      debtService: 0,
      netCashFlow: -equityCapex,
      cumulativeCashFlow: -equityCapex,
      co2Avoided: 0,
    })

    for (let year = 1; year <= (systemLifetimeYears || 25); year++) {
      const degradation = Math.pow(1 - (degradationRate || 0.005), year - 1)
      const energy = annualEnergyYear1 * degradation
      const revenue = annualRevenueYear1 * degradation * Math.pow(1 + (inflationRate || 0.02), year - 1)
      const opex = (opexAnnual || capex * 0.015) * Math.pow(1 + (inflationRate || 0.02), year - 1)
      // Debt service applies only while the loan term is running, and is a
      // fixed (non-inflated) nominal payment, as is standard for an
      // amortizing loan.
      const debtService = year <= (loanTermYears || 0) ? annualDebtService : 0
      const netCashFlow = revenue - opex - debtService
      cumulativeCashFlow += netCashFlow

      totalEnergy += energy
      totalRevenue += revenue
      totalOpex += opex
      totalCo2 += energy * emissionFactor

      cashFlows.push({
        year,
        energy: Math.round(energy),
        revenue: Math.round(revenue),
        opex: Math.round(opex),
        debtService: Math.round(debtService),
        netCashFlow: Math.round(netCashFlow),
        cumulativeCashFlow: Math.round(cumulativeCashFlow),
        co2Avoided: Math.round(energy * emissionFactor),
      })
    }

    // Payback period (simple, on the equity cash flows above)
    let paybackYears: number | null = null
    for (let i = 1; i < cashFlows.length; i++) {
      if (cashFlows[i].cumulativeCashFlow >= 0) {
        // Interpolate
        const prev = cashFlows[i - 1]
        const curr = cashFlows[i]
        if (prev.cumulativeCashFlow < 0) {
          const fraction = -prev.cumulativeCashFlow / (curr.netCashFlow || 1)
          paybackYears = prev.year + fraction
        } else {
          paybackYears = i
        }
        break
      }
    }

    // NPV / IRR: computed on the EQUITY cash flows (cashFlows already nets out
    // debt service), so these represent the return to the equity investor, not
    // the whole project. discountRate is treated as a nominal rate applied to
    // nominal (inflation-escalated) cash flows - both revenue and opex above
    // are already grown by inflationRate, so this is internally consistent as
    // long as the caller supplies a nominal (not real/inflation-adjusted) discountRate.
    const dr = discountRate || 0.08
    let npv = cashFlows[0].netCashFlow
    for (let year = 1; year < cashFlows.length; year++) {
      npv += cashFlows[year].netCashFlow / Math.pow(1 + dr, year)
    }

    // IRR (bisection) - equity IRR, same cash flows as NPV above.
    // Note: bisection over [0,1] cannot find an IRR above 100%; that's fine
    // for typical solar economics but flagged here since a fixed [0, high]
    // bound also fails silently (returns ~1.0) for very high-return cases.
    let irr = 0
    const findNpv = (rate: number) => {
      let n = cashFlows[0].netCashFlow
      for (let year = 1; year < cashFlows.length; year++) {
        n += cashFlows[year].netCashFlow / Math.pow(1 + rate, year)
      }
      return n
    }
    let low = -0.5
    let high = 3
    for (let i = 0; i < 100; i++) {
      const mid = (low + high) / 2
      const v = findNpv(mid)
      if (Math.abs(v) < 1) {
        irr = mid
        break
      }
      if (v > 0) low = mid
      else high = mid
      irr = mid
    }

    // LCOE: by convention this is a project-level (unlevered) cost-of-energy
    // metric - total capex (not just the equity portion) divided by the
    // present value of energy produced. Mixing in debt service here would
    // conflate financing cost with generation cost, so it intentionally uses
    // `capex`, not `equityCapex`, and OPEX only (no debt service).
    let pvEnergy = 0
    let pvCost = capex
    for (let year = 1; year < cashFlows.length; year++) {
      pvEnergy += cashFlows[year].energy / Math.pow(1 + dr, year)
      pvCost += cashFlows[year].opex / Math.pow(1 + dr, year)
    }
    const lcoe = pvEnergy > 0 ? pvCost / pvEnergy : 0

    // === NEW: P50/P90 Statistical Estimates ===
    const irradianceVariability = 0.08
    const p50Energy = annualEnergyYear1
    const p90Energy = annualEnergyYear1 * (1 - 1.28 * irradianceVariability)
    const p10Energy = annualEnergyYear1 * (1 + 1.28 * irradianceVariability)

    // === NEW: Detailed Loss Breakdown ===
    const losses = {
      soiling: 2.0, wiring: 1.5, mismatch: 1.2, lidDegradation: 1.0,
      inverter: 3.0, transformer: 1.0, availability: 1.5,
      shading: 0.8, snow: 0.0, temperature: 2.5,
    }
    const totalLossesPct = Object.values(losses).reduce((s, v) => s + v, 0)

    // Debt Service Coverage Ratio, averaged over the loan term (not just year
    // 1) since revenue degrades/escalates and opex escalates every year while
    // debt service is flat - a year-1-only DSCR overstates coverage in later
    // years for a project with meaningful degradation.
    const totalDebtService = annualDebtService * (loanTermYears || 0)
    const loanYears = cashFlows.slice(1, (loanTermYears || 0) + 1)
    const avgAnnualCashFlowDuringLoan = loanYears.length > 0
      ? loanYears.reduce((s, cf) => s + (cf.revenue - cf.opex), 0) / loanYears.length
      : 0
    const dscr = annualDebtService > 0 && loanYears.length > 0
      ? Math.round((avgAnnualCashFlowDuringLoan / annualDebtService) * 100) / 100
      : null

    // === NEW: Irradiance Scenarios ===
    const irradianceScenarios = {
      low: { label: 'منخفض (P90)', factor: 0.92, energy: Math.round(p90Energy), revenue: Math.round(p90Energy * (tariffRetail || 0.18)), npv: Math.round(npv * 0.85) },
      normal: { label: 'طبيعي (P50)', factor: 1.0, energy: Math.round(p50Energy), revenue: Math.round(annualRevenueYear1), npv: Math.round(npv) },
      high: { label: 'مرتفع (P10)', factor: 1.08, energy: Math.round(p10Energy), revenue: Math.round(p10Energy * (tariffRetail || 0.18)), npv: Math.round(npv * 1.15) },
    }

    // Scenario comparisons
    const scenarios = {
      conservative: {
        npv: npv * 0.7, irr: irr * 0.85,
        paybackYears: paybackYears ? paybackYears * 1.2 : null,
        annualEnergyYear1: annualEnergyYear1 * 0.85,
      },
      base: { npv, irr, paybackYears, annualEnergyYear1 },
      optimistic: {
        npv: npv * 1.3, irr: irr * 1.15,
        paybackYears: paybackYears ? paybackYears * 0.85 : null,
        annualEnergyYear1: annualEnergyYear1 * 1.10,
      },
    }

    // Sensitivity analysis. capex sensitivity perturbs equityCapex (not the
    // gross capex) since npv/irr here are equity-based - perturbing gross
    // capex while holding the loan fixed would understate the equity impact
    // of a capex change.
    const sensitivity = {
      capex: [-20, -10, 0, 10, 20].map((delta) => ({
        change: `${delta}%`,
        npv: npv - (equityCapex * delta) / 100,
      })),
      tariff: [-20, -10, 0, 10, 20].map((delta) => ({
        change: `${delta}%`,
        npv: npv * (1 + delta / 100),
      })),
      energy: [-15, -7.5, 0, 7.5, 15].map((delta) => ({
        change: `${delta}%`,
        npv: npv * (1 + delta / 100),
      })),
    }

    return NextResponse.json({
      currency: outputCurrency,
      // NEW: Advanced metrics
      p50p90: { p50: Math.round(p50Energy), p90: Math.round(p90Energy), p10: Math.round(p10Energy), method: 'statistical (8% variability)' },
      detailedLosses: { ...losses, total: totalLossesPct, performanceRatio: Math.round((1 - totalLossesPct / 100) * 1000) / 10 },
      debtService: {
        loanAmount: Math.round(loanAmount), equityCapex: Math.round(equityCapex), monthlyPayment: Math.round(monthlyPayment),
        annualDebtService: Math.round(annualDebtService), totalDebtService: Math.round(totalDebtService),
        annualLoanRate, dscr, loanTermYears: loanTermYears || 0,
      },
      irradianceScenarios,
      inputs: {
        capacityKwp,
        capex,
        equityCapex: Math.round(equityCapex),
        opexAnnual: opexAnnual || capex * 0.015,
        tariffRetail,
        tariffFeedIn: tariffFeedIn || tariffRetail * 0.5,
        selfConsumptionRate: selfConsumptionRate || 0.7,
        degradationRate: degradationRate || 0.005,
        discountRate: dr,
        systemLifetimeYears: systemLifetimeYears || 25,
        location,
        psh,
        currency: outputCurrency,
      },
      results: {
        annualEnergyYear1: Math.round(annualEnergyYear1),
        annualRevenueYear1: Math.round(annualRevenueYear1),
        annualCo2AvoidedYear1: Math.round(annualCo2AvoidedYear1),
        totalEnergyLifetime: Math.round(totalEnergy),
        totalRevenueLifetime: Math.round(totalRevenue),
        totalCo2AvoidedLifetime: Math.round(totalCo2),
        specificYield: Math.round(annualEnergyYear1 / capacityKwp),
        performanceRatio: 0.82,
        npv: Math.round(npv), // equity NPV, in `currency`
        irr: Math.round(irr * 1000) / 10, // equity IRR, percentage with 1 decimal
        paybackYears: paybackYears ? Math.round(paybackYears * 10) / 10 : null, // equity payback
        lcoe: Math.round(lcoe * 100000) / 100000, // currency per kWh (unlevered, full capex)
        // Minor-unit figure (currency/100 per kWh) for display purposes only.
        // Not all currencies use a 100-subunit "fils"/"halala" scheme, so this
        // is labeled generically rather than assumed to be SAR fils.
        lcoeMinorUnitPerKwh: Math.round(lcoe * 1000 * 10) / 10,
      },
      cashFlows,
      scenarios,
      sensitivity,
      disclaimer:
        'هذه النتائج تقديرية لأغراض التخطيط فقط ولا تشكل استشارة مالية أو استثمارية. يرجى الرجوع لمستشار مالي قبل اتخاذ قرارات الاستثمار. جميع القيم المالية مُدخَلة ومُخرجة بعملة واحدة فقط دون تحويل عملات؛ تأكد أن جميع المدخلات (رأس المال، التكاليف التشغيلية، التعرفات) بنفس العملة.',
    })
  } catch (error) {
    console.error('Calculator API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

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

interface CashFlowInputs {
  capex: number
  equityCapex: number
  annualEnergyYear1: number
  annualRevenueYear1: number
  opexAnnual: number
  degradationRate: number
  inflationRate: number
  discountRate: number
  systemLifetimeYears: number
  loanTermYears: number
  annualDebtService: number
  emissionFactor: number
}

interface CashFlowYear {
  year: number
  energy: number
  revenue: number
  opex: number
  debtService: number
  netCashFlow: number
  cumulativeCashFlow: number
  co2Avoided: number
}

interface CashFlowResult {
  cashFlows: CashFlowYear[]
  npv: number
  irr: number
  paybackYears: number | null
  lcoe: number
  totalEnergy: number
  totalRevenue: number
  totalCo2: number
}

// Runs the full year-by-year cash-flow projection and derives NPV/IRR/Payback/LCOE
// from it. Factored out so scenarios and sensitivity analysis can re-run the SAME
// model with different assumptions, instead of scaling the base-case NPV/IRR by an
// arbitrary multiplier (which does not reflect how a levered project with fixed
// capex and fixed debt service actually responds to a revenue or cost shock).
function computeCashFlowScenario(inp: CashFlowInputs): CashFlowResult {
  const {
    capex, equityCapex, annualEnergyYear1, annualRevenueYear1, opexAnnual,
    degradationRate, inflationRate, discountRate, systemLifetimeYears,
    loanTermYears, annualDebtService, emissionFactor,
  } = inp

  const cashFlows: CashFlowYear[] = [{
    year: 0, energy: 0, revenue: 0, opex: 0, debtService: 0,
    netCashFlow: -equityCapex, cumulativeCashFlow: -equityCapex, co2Avoided: 0,
  }]

  let totalEnergy = 0
  let totalRevenue = 0
  let totalCo2 = 0
  let cumulativeCashFlow = -equityCapex

  for (let year = 1; year <= systemLifetimeYears; year++) {
    const degradation = Math.pow(1 - degradationRate, year - 1)
    const energy = annualEnergyYear1 * degradation
    const revenue = annualRevenueYear1 * degradation * Math.pow(1 + inflationRate, year - 1)
    const opex = opexAnnual * Math.pow(1 + inflationRate, year - 1)
    const debtService = year <= loanTermYears ? annualDebtService : 0
    const netCashFlow = revenue - opex - debtService
    cumulativeCashFlow += netCashFlow

    totalEnergy += energy
    totalRevenue += revenue
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

  // Payback period (simple, interpolated to a fraction of a year)
  let paybackYears: number | null = null
  for (let i = 1; i < cashFlows.length; i++) {
    if (cashFlows[i].cumulativeCashFlow >= 0) {
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

  const dr = discountRate
  let npv = cashFlows[0].netCashFlow
  for (let year = 1; year < cashFlows.length; year++) {
    npv += cashFlows[year].netCashFlow / Math.pow(1 + dr, year)
  }

  // IRR via bisection. Bounded to [-50%, +300%] - sufficient for realistic solar
  // economics; a project that doesn't converge within this band returns the bound
  // it settled near rather than silently reporting a misleading ~100%.
  const findNpv = (rate: number) => {
    let n = cashFlows[0].netCashFlow
    for (let year = 1; year < cashFlows.length; year++) {
      n += cashFlows[year].netCashFlow / Math.pow(1 + rate, year)
    }
    return n
  }
  let low = -0.5
  let high = 3
  let irr = 0
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

  // LCOE: project-level (unlevered) - full capex (not equity-only) divided by the
  // present value of energy produced. Uses OPEX only, no debt service, since
  // mixing in financing cost would conflate cost-of-capital with cost-of-generation.
  let pvEnergy = 0
  let pvCost = capex
  for (let year = 1; year < cashFlows.length; year++) {
    pvEnergy += cashFlows[year].energy / Math.pow(1 + dr, year)
    pvCost += cashFlows[year].opex / Math.pow(1 + dr, year)
  }
  const lcoe = pvEnergy > 0 ? pvCost / pvEnergy : 0

  return { cashFlows, npv, irr, paybackYears, lcoe, totalEnergy, totalRevenue, totalCo2 }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth.authorized) return auth.response

    const body = await request.json()
    const {
      capacityKwp,
      // tiltDegrees/azimuthDegrees ARE used below to correct annualEnergyYear1
      // via orientationFactor. panelAreaM2 and technology are accepted but NOT
      // used anywhere in this calculation - the energy model is capacity-based
      // (capacityKwp * PSH), not area/efficiency-based, and no per-technology
      // efficiency table exists in this codebase. Sending them has no effect
      // on the results; do not assume they refine the estimate.
      panelAreaM2: _panelAreaM2,
      tiltDegrees,
      azimuthDegrees,
      technology: _technology,
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

    // Orientation/tilt correction factor. Same model as space-comparison.ts's
    // orientationFactor: south-facing (azimuth 180° in the northern hemisphere)
    // at tilt ≈ latitude is optimal; deviation from that reduces effective
    // irradiance on the plane of array versus horizontal GHI. This was
    // previously accepted as an input (panelAreaM2/tiltDegrees/azimuthDegrees/
    // technology) but silently ignored - capacityKwp*psh alone was used
    // regardless of how the array is actually mounted. Left at 1.0 (no
    // correction) when tilt/azimuth aren't supplied, matching prior behavior
    // for callers that don't send them.
    const LATITUDE_MAP: Record<string, number> = {
      riyadh: 24.7, jeddah: 21.5, dammam: 26.4, mecca: 21.4, medina: 24.5,
      abu_dhabi: 24.5, dubai: 25.2, doha: 25.3, kuwait_city: 29.4,
      manama: 26.2, muscat: 23.6, cairo: 30.0, amman: 31.9, default: 24.0,
    }
    const latitude = LATITUDE_MAP[(location || '').toLowerCase()] || LATITUDE_MAP.default
    let orientationFactor = 1.0
    if (azimuthDegrees !== undefined && azimuthDegrees !== null) {
      const azimuthDeviation = Math.min(Math.abs(azimuthDegrees - 180), 360 - Math.abs(azimuthDegrees - 180))
      orientationFactor -= Math.min(0.25, (azimuthDeviation / 45) * 0.05)
    }
    if (tiltDegrees !== undefined && tiltDegrees !== null) {
      const idealTilt = Math.abs(latitude)
      const tiltDeviation = Math.abs(tiltDegrees - idealTilt)
      orientationFactor -= Math.min(0.15, (tiltDeviation / 30) * 0.05)
    }
    orientationFactor = Math.max(0.5, orientationFactor)

    const annualEnergyYear1 = capacityKwp * psh * 365 * (1 - systemLosses) * inverterEfficiency * orientationFactor // kWh

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

    // Resolve defaults once so the base case and every scenario/sensitivity
    // re-run below share exactly the same fallback values.
    const dr = discountRate || 0.08
    const resolvedOpexAnnual = opexAnnual || capex * 0.015
    const resolvedDegradationRate = degradationRate || 0.005
    const resolvedInflationRate = inflationRate || 0.02
    const resolvedSystemLifetimeYears = systemLifetimeYears || 25
    const resolvedLoanTermYears = loanTermYears || 0

    // Base-case cash-flow run (equity-levered: NPV/IRR/Payback reflect the
    // return to the equity investor; debt service already netted out).
    const base = computeCashFlowScenario({
      capex,
      equityCapex,
      annualEnergyYear1,
      annualRevenueYear1,
      opexAnnual: resolvedOpexAnnual,
      degradationRate: resolvedDegradationRate,
      inflationRate: resolvedInflationRate,
      discountRate: dr,
      systemLifetimeYears: resolvedSystemLifetimeYears,
      loanTermYears: resolvedLoanTermYears,
      annualDebtService,
      emissionFactor,
    })
    const { cashFlows, npv, irr, paybackYears, lcoe, totalEnergy, totalRevenue, totalCo2 } = base

    // === P50/P90 Statistical Estimates ===
    // P50 = median expected energy yield; P90 = value exceeded with 90% confidence
    // (i.e. a conservative/low case); P10 = value exceeded with only 10% confidence
    // (an optimistic/high case). 1.28 is the standard normal z-score for the
    // 90th/10th percentile, applied to an assumed ±8% interannual irradiance
    // variability (a commonly used planning assumption in the absence of a
    // site-specific multi-year irradiance dataset).
    const irradianceVariability = 0.08
    const p50Energy = annualEnergyYear1
    const p90Energy = annualEnergyYear1 * (1 - 1.28 * irradianceVariability)
    const p10Energy = annualEnergyYear1 * (1 + 1.28 * irradianceVariability)

    // === Detailed Loss Breakdown ===
    // Reference percentages for a well-maintained crystalline-silicon system.
    // These are NOT re-derived from the project's actual inputs (mounting,
    // climate, inverter model, etc.) - they are indicative default assumptions
    // shown for transparency on where the systemLosses=14% figure above
    // roughly comes from, not a site-specific loss study.
    const losses = {
      soiling: 2.0, wiring: 1.5, mismatch: 1.2, lidDegradation: 1.0,
      inverter: 3.0, transformer: 1.0, availability: 1.5,
      shading: 0.8, snow: 0.0, temperature: 2.5,
    }
    const totalLossesPct = Object.values(losses).reduce((s, v) => s + v, 0)

    // Debt Service Coverage Ratio, averaged over the loan term (not just year
    // 1) since revenue degrades/escalates and opex escalates every year while
    // debt service is flat - a year-1-only DSCR overstates coverage in later
    // years for a project with meaningful degradation. Note: this is a
    // straightforward operating-cash-flow / debt-service ratio and does NOT
    // include any Debt Service Reserve Account (DSRA) a lender may require;
    // banks reviewing this figure should apply their own DSRA/covenant policy.
    const totalDebtService = annualDebtService * resolvedLoanTermYears
    const loanYears = cashFlows.slice(1, resolvedLoanTermYears + 1)
    const avgAnnualCashFlowDuringLoan = loanYears.length > 0
      ? loanYears.reduce((s, cf) => s + (cf.revenue - cf.opex), 0) / loanYears.length
      : 0
    const dscr = annualDebtService > 0 && loanYears.length > 0
      ? Math.round((avgAnnualCashFlowDuringLoan / annualDebtService) * 100) / 100
      : null

    // === Irradiance (P90/P50/P10) scenarios ===
    // Re-run the FULL cash-flow model with a scaled annual energy yield (and
    // proportionally scaled revenue, since revenue is derived from energy),
    // rather than scaling the base-case NPV by an arbitrary multiplier.
    // Capex, opex, financing, and discount rate are held constant - only the
    // resource assumption changes - which is what a P90/P50/P10 sensitivity
    // is meant to isolate.
    const runIrradianceCase = (energy: number) => {
      const revenue = annualRevenueYear1 * (energy / annualEnergyYear1)
      return computeCashFlowScenario({
        capex, equityCapex, annualEnergyYear1: energy, annualRevenueYear1: revenue,
        opexAnnual: resolvedOpexAnnual, degradationRate: resolvedDegradationRate,
        inflationRate: resolvedInflationRate, discountRate: dr,
        systemLifetimeYears: resolvedSystemLifetimeYears, loanTermYears: resolvedLoanTermYears,
        annualDebtService, emissionFactor,
      })
    }
    const p90Case = runIrradianceCase(p90Energy)
    const p10Case = runIrradianceCase(p10Energy)
    const irradianceScenarios = {
      low: { label: 'منخفض (P90)', factor: p90Energy / annualEnergyYear1, energy: Math.round(p90Energy), revenue: Math.round(p90Energy * (annualRevenueYear1 / annualEnergyYear1)), npv: Math.round(p90Case.npv) },
      normal: { label: 'طبيعي (P50)', factor: 1.0, energy: Math.round(p50Energy), revenue: Math.round(annualRevenueYear1), npv: Math.round(npv) },
      high: { label: 'مرتفع (P10)', factor: p10Energy / annualEnergyYear1, energy: Math.round(p10Energy), revenue: Math.round(p10Energy * (annualRevenueYear1 / annualEnergyYear1)), npv: Math.round(p10Case.npv) },
    }

    // === Scenario comparisons (conservative / base / optimistic) ===
    // Each scenario re-runs the full cash-flow model with a documented,
    // independently-varied set of assumptions instead of scaling the
    // base-case NPV/IRR by an arbitrary multiplier - a multiplier does not
    // reflect how a project with fixed capex and fixed debt service actually
    // responds to a revenue or cost shock (NPV is not linear in energy yield
    // once fixed costs are netted out).
    const conservativeCase = computeCashFlowScenario({
      capex, equityCapex,
      annualEnergyYear1: annualEnergyYear1 * 0.9, // P90-like resource case
      annualRevenueYear1: annualRevenueYear1 * 0.9,
      opexAnnual: resolvedOpexAnnual * 1.1, // 10% opex overrun
      degradationRate: resolvedDegradationRate * 1.2, // faster degradation
      inflationRate: resolvedInflationRate, discountRate: dr,
      systemLifetimeYears: resolvedSystemLifetimeYears, loanTermYears: resolvedLoanTermYears,
      annualDebtService, emissionFactor,
    })
    const optimisticCase = computeCashFlowScenario({
      capex, equityCapex,
      annualEnergyYear1: annualEnergyYear1 * 1.05, // P10-like resource case
      annualRevenueYear1: annualRevenueYear1 * 1.05,
      opexAnnual: resolvedOpexAnnual * 0.95, // 5% opex saving
      degradationRate: resolvedDegradationRate * 0.9, // slower degradation
      inflationRate: resolvedInflationRate, discountRate: dr,
      systemLifetimeYears: resolvedSystemLifetimeYears, loanTermYears: resolvedLoanTermYears,
      annualDebtService, emissionFactor,
    })
    const scenarios = {
      conservative: {
        npv: conservativeCase.npv, irr: conservativeCase.irr,
        paybackYears: conservativeCase.paybackYears,
        annualEnergyYear1: annualEnergyYear1 * 0.9,
        assumptions: 'إنتاج أقل 10%، تكلفة تشغيلية أعلى 10%، تدهور أسرع 20%',
      },
      base: { npv, irr, paybackYears, annualEnergyYear1, assumptions: 'المدخلات الأساسية كما أُدخلت' },
      optimistic: {
        npv: optimisticCase.npv, irr: optimisticCase.irr,
        paybackYears: optimisticCase.paybackYears,
        annualEnergyYear1: annualEnergyYear1 * 1.05,
        assumptions: 'إنتاج أعلى 5%، تكلفة تشغيلية أقل 5%، تدهور أبطأ 10%',
      },
    }

    // === Sensitivity analysis ===
    // Each point re-runs the full cash-flow model with ONLY the named input
    // perturbed, so NPV response correctly reflects that capex is a one-off
    // cost while tariff/energy changes compound over the project lifetime and
    // interact with degradation/inflation/discounting - a linear
    // `npv * (1 + delta/100)` approximation was previously used for
    // tariff/energy, which is not accurate once fixed costs are netted out of
    // NPV. Capex sensitivity perturbs equityCapex (not gross capex) since
    // npv/irr here are equity-based.
    const sensitivity = {
      capex: [-20, -10, 0, 10, 20].map((delta) => ({
        change: `${delta}%`,
        npv: Math.round(npv - (equityCapex * delta) / 100),
      })),
      tariff: [-20, -10, 0, 10, 20].map((delta) => {
        if (delta === 0) return { change: '0%', npv: Math.round(npv) }
        const scenario = computeCashFlowScenario({
          capex, equityCapex, annualEnergyYear1,
          annualRevenueYear1: annualRevenueYear1 * (1 + delta / 100),
          opexAnnual: resolvedOpexAnnual, degradationRate: resolvedDegradationRate,
          inflationRate: resolvedInflationRate, discountRate: dr,
          systemLifetimeYears: resolvedSystemLifetimeYears, loanTermYears: resolvedLoanTermYears,
          annualDebtService, emissionFactor,
        })
        return { change: `${delta}%`, npv: Math.round(scenario.npv) }
      }),
      energy: [-15, -7.5, 0, 7.5, 15].map((delta) => {
        if (delta === 0) return { change: '0%', npv: Math.round(npv) }
        const scaledEnergy = annualEnergyYear1 * (1 + delta / 100)
        const scenario = computeCashFlowScenario({
          capex, equityCapex,
          annualEnergyYear1: scaledEnergy,
          annualRevenueYear1: annualRevenueYear1 * (1 + delta / 100),
          opexAnnual: resolvedOpexAnnual, degradationRate: resolvedDegradationRate,
          inflationRate: resolvedInflationRate, discountRate: dr,
          systemLifetimeYears: resolvedSystemLifetimeYears, loanTermYears: resolvedLoanTermYears,
          annualDebtService, emissionFactor,
        })
        return { change: `${delta}%`, npv: Math.round(scenario.npv) }
      }),
    }

    return NextResponse.json({
      currency: outputCurrency,
      // NEW: Advanced metrics
      p50p90: { p50: Math.round(p50Energy), p90: Math.round(p90Energy), p10: Math.round(p10Energy), method: 'statistical (8% variability)' },
      detailedLosses: { ...losses, total: totalLossesPct, performanceRatio: Math.round((1 - totalLossesPct / 100) * 1000) / 10 },
      debtService: {
        loanAmount: Math.round(loanAmount), equityCapex: Math.round(equityCapex), monthlyPayment: Math.round(monthlyPayment),
        annualDebtService: Math.round(annualDebtService), totalDebtService: Math.round(totalDebtService),
        annualLoanRate, dscr, loanTermYears: resolvedLoanTermYears,
        // DSCR above is operating-cash-flow / debt-service only; it does not
        // include a Debt Service Reserve Account (DSRA). Lenders should apply
        // their own reserve/covenant requirements on top of this figure.
        dscrIncludesReserve: false,
      },
      irradianceScenarios,
      inputs: {
        capacityKwp,
        capex,
        equityCapex: Math.round(equityCapex),
        opexAnnual: resolvedOpexAnnual,
        tariffRetail,
        tariffFeedIn: tariffFeedIn || tariffRetail * 0.5,
        selfConsumptionRate: selfConsumptionRate || 0.7,
        degradationRate: resolvedDegradationRate,
        discountRate: dr,
        systemLifetimeYears: resolvedSystemLifetimeYears,
        location,
        psh,
        orientationFactor: Math.round(orientationFactor * 1000) / 1000,
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
        // Fixed indicative assumption (not derived from `losses` below, whose
        // total is ~14.5% loss ≈ 85.5% PR - close but not forced to match
        // exactly since systemLosses=14% above is the figure actually used
        // in the energy calculation).
        performanceRatio: 0.82,
        npv: Math.round(npv), // equity NPV, in `currency`
        irr: Math.round(irr * 1000) / 10, // equity IRR, percentage with 1 decimal
        paybackYears: paybackYears ? Math.round(paybackYears * 10) / 10 : null, // equity payback
        lcoe: Math.round(lcoe * 100000) / 100000, // currency per kWh (unlevered, full capex)
        // Minor-unit figure (currency/1000 per kWh, i.e. "milli-currency" per
        // kWh - e.g. milli-SAR/kWh) for display purposes only. Renamed from
        // the previous field to match what the formula actually computes
        // (lcoe*1000); the old name/comment claimed currency/100 (a
        // "fils"/"halala" subunit) which was NOT what the math produced.
        lcoeMilliCurrencyPerKwh: Math.round(lcoe * 1000 * 10) / 10,
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

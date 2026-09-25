// Solar Green Loan & Investment Calculator — Core Engine
// ---------------------------------------------------------------------------
// Pure, side-effect-free financial + carbon math for the public, lightweight
// lead-gen calculator (landing/login page). Deliberately simpler than the
// authenticated project-level model in `src/app/api/calculator/route.ts`
// (no degradation curve, no IRR/NPV/LCOE, no full amortization schedule) —
// this tool exists to produce an instant, directionally-correct teaser for
// an anonymous visitor in <1s, not a bankable feasibility study.
//
// IMPORTANT — factors are injected, never fetched here:
// `SolarCalculatorFactors` (grid emission factor, tariff, costs, ...) must be
// supplied by the caller. This keeps the engine runnable identically:
//   - on the CLIENT, with `DEFAULT_CLIENT_FACTORS` below, for an instant
//     on-screen teaser with zero network round-trip, and
//   - on the SERVER (see `/api/public/solar-calculator/lead`), with
//     authoritative, versioned values pulled from `src/lib/reference-data.ts`
//     (DB-backed grid emission factors / tariffs / conversion factors, the
//     same source of truth the internal calculator uses) before a lead is
//     persisted and a bank-facing PDF is generated.
// Never hardcode DB lookups into this file — that would make it un-runnable
// in the browser and would silently diverge the two call sites.

export type SolarUserType = 'individual' | 'sme'
export type SolarLeadPriority = 'low' | 'medium' | 'high'

export interface SolarCalculatorFactors {
  currency: string
  /** kgCO2e / kWh — grid emission factor for the customer's country. */
  gridEmissionFactor: number
  /** currency / kWh — retail electricity tariff, used to translate the bill into kWh. */
  tariffRetailPerKwh: number
  /** currency / kWp installed — indicative turnkey solar cost, used to size the system. */
  costPerKwpInstalled: number
  /** kWh / kWp / year — indicative specific yield for the region. */
  specificYieldKwhPerKwp: number
  /** kgCO2e / tree / year. */
  treeCo2PerYear: number
  /** kgCO2e / km driven. */
  carCo2PerKm: number
  /** Assumed average annual driving distance (km) used for the "cars removed" translation. */
  avgCarKmPerYear: number
  /** currency / tCO2e — indicative future carbon-credit monetization price (0 disables it). */
  carbonCreditPricePerTon: number
  /** Data provenance, echoed back for transparency (e.g. 'db' | 'fallback-client'). */
  source?: string
}

// Indicative fallbacks mirroring the Saudi-market defaults hardcoded in
// `src/lib/reference-data.ts` (SA fallback branch). Used ONLY for the
// client-side instant teaser before a lead is captured. The server route
// re-resolves these from the DB (or the same fallbacks, versioned) before
// anything is persisted or emailed — see /api/public/solar-calculator/lead.
export const DEFAULT_CLIENT_FACTORS: SolarCalculatorFactors = {
  currency: 'SAR',
  gridEmissionFactor: 0.432, // kgCO2e/kWh — SEC 2024 (fallback)
  tariffRetailPerKwh: 0.18, // SAR/kWh — SERA 2024 (fallback)
  costPerKwpInstalled: 3200, // SAR/kWp — indicative GCC turnkey EPC cost
  specificYieldKwhPerKwp: 1800, // kWh/kWp/year — indicative KSA irradiance
  treeCo2PerYear: 21, // kgCO2/tree/year — EPA (fallback)
  carCo2PerKm: 0.12, // kgCO2/km — EPA (fallback)
  avgCarKmPerYear: 15000,
  carbonCreditPricePerTon: 25,
  source: 'fallback-client',
}

export interface SolarCalculatorInputs {
  userType: SolarUserType
  /** Current monthly electricity bill, in `factors.currency`. */
  monthlyElectricityBill: number
  /** Manual override for the auto-estimated system cost (same currency). Null/undefined = auto. */
  estimatedSystemCostOverride?: number | null
  /** 0–100. Share of the system cost financed via the green loan. */
  loanPercent: number
  /** 1–10 years. */
  loanTermYears: number
  /** Annual nominal interest rate, e.g. 6.5 for 6.5%. */
  loanInterestRatePct: number
  /** 0–1. Share of the electricity bill the system is expected to replace. Spec default: 0.85 (80–90% band). */
  savingsRatio?: number
  /** Discount rate for the discounted-payback calc. Defaults to the loan rate (proxy cost of capital) when omitted. */
  discountRatePct?: number
  /** Horizon for cumulative ROI / lifetime carbon figures. Default 20. */
  systemLifetimeYears?: number
}

export interface SolarLoanBreakdown {
  estimatedSystemCost: number
  estimatedAnnualConsumptionKwh: number
  loanAmount: number
  equityDownPayment: number
  monthlyPMT: number
  loanTermYears: number
  annualLoanRatePct: number
}

export interface SolarCashflowResult {
  monthlySavings: number
  netMonthlyCashflowDuringLoan: number
  netMonthlyCashflowAfterLoan: number
  simplePaybackYears: number | null
  discountedPaybackYears: number | null
  cumulativeNetCashflow20yr: number
  cumulativeROI20yrPct: number | null
  yearlyCashflow: Array<{ year: number; netCashflow: number; cumulativeCashflow: number; discountedCumulativeCashflow: number }>
}

export interface SolarScenarioComparison {
  scenarioA_statusQuo: { monthlyCost: number; cumulativeCost20yr: number }
  scenarioB_solarLoan: { monthlyOutflowYear1: number; cumulativeCost20yr: number }
  netMonthlyDelta: number
}

export interface SolarCarbonResult {
  estimatedAnnualProductionKwh: number
  avoidedCO2TonsPerYear: number
  avoidedCO2TonsLifetime: number
  potentialCarbonCreditIncomeAnnual: number
  treesEquivalentPerYear: number
  carsRemovedEquivalent: number
}

export interface SolarLeadScore {
  score: number // 0–100
  priority: SolarLeadPriority
  reasons: string[]
}

export interface SolarCalculatorResult {
  currency: string
  inputs: Required<Omit<SolarCalculatorInputs, 'estimatedSystemCostOverride' | 'discountRatePct'>> & {
    estimatedSystemCostOverride: number | null
    discountRatePct: number
  }
  loan: SolarLoanBreakdown
  cashflow: SolarCashflowResult
  scenarios: SolarScenarioComparison
  carbon: SolarCarbonResult
  leadScore: SolarLeadScore
  factorsSource: string | undefined
}

// --- Core formulas -----------------------------------------------------

/**
 * Standard loan amortization payment: PMT = P * r(1+r)^n / ((1+r)^n - 1)
 * `annualRatePct` is the nominal annual rate (e.g. 6.5 for 6.5%), compounded monthly.
 */
export function calculateLoanPMT(principal: number, annualRatePct: number, termYears: number): number {
  const n = Math.max(0, Math.round(termYears * 12))
  if (n === 0 || principal <= 0) return 0
  const r = annualRatePct / 100 / 12
  if (r === 0) return principal / n
  const factor = Math.pow(1 + r, n)
  return (principal * (r * factor)) / (factor - 1)
}

/** Sizes an indicative system cost from the monthly bill via tariff → kWh → kWp → cost. */
export function estimateSystemCost(monthlyElectricityBill: number, factors: SolarCalculatorFactors): {
  estimatedSystemCost: number
  estimatedAnnualConsumptionKwh: number
} {
  const tariff = factors.tariffRetailPerKwh > 0 ? factors.tariffRetailPerKwh : DEFAULT_CLIENT_FACTORS.tariffRetailPerKwh
  const estimatedAnnualConsumptionKwh = (monthlyElectricityBill * 12) / tariff
  const sizeKwp = estimatedAnnualConsumptionKwh / factors.specificYieldKwhPerKwp
  const estimatedSystemCost = sizeKwp * factors.costPerKwpInstalled
  return { estimatedSystemCost, estimatedAnnualConsumptionKwh }
}

function calculateLoanBreakdown(inputs: SolarCalculatorInputs, factors: SolarCalculatorFactors): SolarLoanBreakdown {
  const { estimatedSystemCost, estimatedAnnualConsumptionKwh } = estimateSystemCost(inputs.monthlyElectricityBill, factors)
  const systemCost =
    inputs.estimatedSystemCostOverride && inputs.estimatedSystemCostOverride > 0
      ? inputs.estimatedSystemCostOverride
      : estimatedSystemCost

  const loanPercent = Math.min(100, Math.max(0, inputs.loanPercent))
  const loanAmount = systemCost * (loanPercent / 100)
  const equityDownPayment = systemCost - loanAmount
  const monthlyPMT = calculateLoanPMT(loanAmount, inputs.loanInterestRatePct, inputs.loanTermYears)

  return {
    estimatedSystemCost: systemCost,
    estimatedAnnualConsumptionKwh,
    loanAmount,
    equityDownPayment,
    monthlyPMT,
    loanTermYears: inputs.loanTermYears,
    annualLoanRatePct: inputs.loanInterestRatePct,
  }
}

/**
 * Net cashflow, payback (simple + discounted) and cumulative ROI, modeled year-by-year
 * over `systemLifetimeYears`. Loan payments apply only during `loanTermYears`; savings
 * are assumed flat (no degradation/inflation — a deliberate simplification for this
 * lightweight teaser tier, unlike the full project-level model).
 */
function calculateCashflow(
  inputs: SolarCalculatorInputs,
  loan: SolarLoanBreakdown,
  savingsRatio: number,
  discountRatePct: number,
  lifetimeYears: number,
): SolarCashflowResult {
  const monthlySavings = inputs.monthlyElectricityBill * savingsRatio
  const netMonthlyCashflowDuringLoan = monthlySavings - loan.monthlyPMT
  const netMonthlyCashflowAfterLoan = monthlySavings

  const dr = discountRatePct / 100
  const yearlyCashflow: SolarCashflowResult['yearlyCashflow'] = []
  let cumulativeCashflow = -loan.equityDownPayment
  let discountedCumulativeCashflow = -loan.equityDownPayment
  let simplePaybackYears: number | null = null
  let discountedPaybackYears: number | null = null

  for (let year = 1; year <= lifetimeYears; year++) {
    const annualNetCashflow =
      year <= loan.loanTermYears ? netMonthlyCashflowDuringLoan * 12 : netMonthlyCashflowAfterLoan * 12

    const prevCumulative = cumulativeCashflow
    cumulativeCashflow += annualNetCashflow
    if (simplePaybackYears === null && cumulativeCashflow >= 0) {
      simplePaybackYears = prevCumulative < 0 ? year - 1 + -prevCumulative / (annualNetCashflow || 1) : year
    }

    const discountedNet = annualNetCashflow / Math.pow(1 + dr, year)
    const prevDiscounted = discountedCumulativeCashflow
    discountedCumulativeCashflow += discountedNet
    if (discountedPaybackYears === null && discountedCumulativeCashflow >= 0) {
      discountedPaybackYears = prevDiscounted < 0 ? year - 1 + -prevDiscounted / (discountedNet || 1) : year
    }

    yearlyCashflow.push({
      year,
      netCashflow: Math.round(annualNetCashflow),
      cumulativeCashflow: Math.round(cumulativeCashflow),
      discountedCumulativeCashflow: Math.round(discountedCumulativeCashflow),
    })
  }

  const cumulativeROI20yrPct =
    loan.equityDownPayment > 0
      ? ((cumulativeCashflow + loan.equityDownPayment) / loan.equityDownPayment) * 100 // net gain / equity invested
      : null

  return {
    monthlySavings,
    netMonthlyCashflowDuringLoan,
    netMonthlyCashflowAfterLoan,
    simplePaybackYears: simplePaybackYears !== null ? Math.round(simplePaybackYears * 10) / 10 : null,
    discountedPaybackYears: discountedPaybackYears !== null ? Math.round(discountedPaybackYears * 10) / 10 : null,
    cumulativeNetCashflow20yr: Math.round(cumulativeCashflow),
    cumulativeROI20yrPct: cumulativeROI20yrPct !== null ? Math.round(cumulativeROI20yrPct * 10) / 10 : null,
    yearlyCashflow,
  }
}

function buildScenarioComparison(
  inputs: SolarCalculatorInputs,
  cashflow: SolarCashflowResult,
  lifetimeYears: number,
): SolarScenarioComparison {
  const monthlyBill = inputs.monthlyElectricityBill
  const scenarioA_statusQuo = {
    monthlyCost: Math.round(monthlyBill),
    cumulativeCost20yr: Math.round(monthlyBill * 12 * lifetimeYears),
  }
  // Scenario B outflow in year 1 = remaining grid bill + loan payment = bill - netCashflow
  const scenarioB_solarLoan = {
    monthlyOutflowYear1: Math.round(monthlyBill - cashflow.netMonthlyCashflowDuringLoan),
    cumulativeCost20yr: Math.round(monthlyBill * 12 * lifetimeYears - cashflow.cumulativeNetCashflow20yr),
  }
  return {
    scenarioA_statusQuo,
    scenarioB_solarLoan,
    netMonthlyDelta: Math.round(cashflow.netMonthlyCashflowDuringLoan),
  }
}

function calculateCarbon(
  cashflow: SolarCashflowResult,
  factors: SolarCalculatorFactors,
  lifetimeYears: number,
): SolarCarbonResult {
  const tariff = factors.tariffRetailPerKwh > 0 ? factors.tariffRetailPerKwh : DEFAULT_CLIENT_FACTORS.tariffRetailPerKwh
  // Energy produced is derived from the savings basis (savings ≈ self-consumed kWh × tariff),
  // keeping the carbon figure internally consistent with the financial savings figure above.
  const estimatedAnnualProductionKwh = (cashflow.monthlySavings * 12) / tariff
  const avoidedCO2TonsPerYear = (estimatedAnnualProductionKwh * factors.gridEmissionFactor) / 1000
  const avoidedCO2TonsLifetime = avoidedCO2TonsPerYear * lifetimeYears
  const potentialCarbonCreditIncomeAnnual = avoidedCO2TonsPerYear * (factors.carbonCreditPricePerTon || 0)
  const treesEquivalentPerYear = (avoidedCO2TonsPerYear * 1000) / factors.treeCo2PerYear
  const carsRemovedEquivalent = (avoidedCO2TonsPerYear * 1000) / (factors.carCo2PerKm * factors.avgCarKmPerYear)

  return {
    estimatedAnnualProductionKwh: Math.round(estimatedAnnualProductionKwh),
    avoidedCO2TonsPerYear: Math.round(avoidedCO2TonsPerYear * 100) / 100,
    avoidedCO2TonsLifetime: Math.round(avoidedCO2TonsLifetime * 10) / 10,
    potentialCarbonCreditIncomeAnnual: Math.round(potentialCarbonCreditIncomeAnnual),
    treesEquivalentPerYear: Math.round(treesEquivalentPerYear),
    carsRemovedEquivalent: Math.round(carsRemovedEquivalent * 10) / 10,
  }
}

/**
 * Lead-scoring heuristic (0–100 → low/medium/high priority). Deliberately simple and
 * fully documented so sales/marketing can retune the weights without touching the
 * financial math above. SME + loan-seeking + high-bill + cashflow-positive score highest,
 * matching the "score lead priority (SME vs Individual)" requirement.
 */
function scoreLead(inputs: SolarCalculatorInputs, loan: SolarLoanBreakdown, cashflow: SolarCashflowResult): SolarLeadScore {
  const reasons: string[] = []
  let score = 0

  if (inputs.userType === 'sme') {
    score += 30
    reasons.push('SME: أعلى قيمة متوقعة للعقد')
  } else {
    score += 10
  }

  const billScore = Math.min(25, (inputs.monthlyElectricityBill / 5000) * 25)
  score += billScore
  if (billScore > 15) reasons.push('فاتورة كهرباء مرتفعة تشير لحجم منظومة كبير')

  const loanScore = Math.min(20, (Math.min(100, inputs.loanPercent) / 100) * 20)
  score += loanScore
  if (inputs.loanPercent >= 50) reasons.push('يبحث عن تمويل عبر القرض الأخضر — عميل بنكي محتمل')

  const capexScore = Math.min(15, (loan.estimatedSystemCost / 200000) * 15)
  score += capexScore

  if (cashflow.netMonthlyCashflowDuringLoan > 0) {
    score += 10
    reasons.push('تدفق نقدي شهري موجب منذ اليوم الأول — احتمالية تحويل أعلى')
  }

  score = Math.round(Math.min(100, Math.max(0, score)))
  const priority: SolarLeadPriority = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low'
  return { score, priority, reasons }
}

/** Orchestrator: runs the full calculator (financial + scenario + carbon + lead score). */
export function runSolarCalculator(rawInputs: SolarCalculatorInputs, factors: SolarCalculatorFactors): SolarCalculatorResult {
  const savingsRatio = clamp(rawInputs.savingsRatio ?? 0.85, 0.5, 0.95)
  const systemLifetimeYears = rawInputs.systemLifetimeYears ?? 20
  const discountRatePct = rawInputs.discountRatePct ?? rawInputs.loanInterestRatePct

  const inputs: SolarCalculatorInputs = {
    ...rawInputs,
    loanPercent: clamp(rawInputs.loanPercent, 0, 100),
    loanTermYears: clamp(Math.round(rawInputs.loanTermYears), 1, 10),
    monthlyElectricityBill: Math.max(0, rawInputs.monthlyElectricityBill),
  }

  const loan = calculateLoanBreakdown(inputs, factors)
  const cashflow = calculateCashflow(inputs, loan, savingsRatio, discountRatePct, systemLifetimeYears)
  const scenarios = buildScenarioComparison(inputs, cashflow, systemLifetimeYears)
  const carbon = calculateCarbon(cashflow, factors, systemLifetimeYears)
  const leadScore = scoreLead(inputs, loan, cashflow)

  return {
    currency: factors.currency,
    inputs: {
      userType: inputs.userType,
      monthlyElectricityBill: inputs.monthlyElectricityBill,
      estimatedSystemCostOverride: rawInputs.estimatedSystemCostOverride ?? null,
      loanPercent: inputs.loanPercent,
      loanTermYears: inputs.loanTermYears,
      loanInterestRatePct: inputs.loanInterestRatePct,
      savingsRatio,
      discountRatePct,
      systemLifetimeYears,
    },
    loan: {
      estimatedSystemCost: Math.round(loan.estimatedSystemCost),
      estimatedAnnualConsumptionKwh: Math.round(loan.estimatedAnnualConsumptionKwh),
      loanAmount: Math.round(loan.loanAmount),
      equityDownPayment: Math.round(loan.equityDownPayment),
      monthlyPMT: Math.round(loan.monthlyPMT),
      loanTermYears: loan.loanTermYears,
      annualLoanRatePct: loan.annualLoanRatePct,
    },
    cashflow: {
      ...cashflow,
      monthlySavings: Math.round(cashflow.monthlySavings),
      netMonthlyCashflowDuringLoan: Math.round(cashflow.netMonthlyCashflowDuringLoan),
      netMonthlyCashflowAfterLoan: Math.round(cashflow.netMonthlyCashflowAfterLoan),
    },
    scenarios,
    carbon,
    leadScore,
    factorsSource: factors.source,
  }
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}

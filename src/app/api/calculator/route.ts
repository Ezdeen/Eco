import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/authorization'

// Investment calculator - runs entirely server-side, no external dependencies
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
      financingRate, // 0-1
      loanTermYears,
      tariffRetail,
      tariffFeedIn,
      selfConsumptionRate, // 0-1
      inflationRate,
      discountRate,
      systemLifetimeYears,
      location,
    } = body

    // Validate required
    if (!capacityKwp || !capex || !tariffRetail) {
      return NextResponse.json({ error: 'capacityKwp, capex, tariffRetail are required' }, { status: 400 })
    }

    // Estimate annual energy production (simple model)
    // PSH = Peak Sun Hours, varies by location
    const PSH_MAP: Record<string, number> = {
      riyadh: 6.5,
      jeddah: 6.2,
      dammam: 6.3,
      mecca: 6.4,
      medina: 6.6,
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

    // Carbon avoided
    const emissionFactor = 0.432 // kg CO2e/kWh Saudi grid
    const annualCo2AvoidedYear1 = annualEnergyYear1 * emissionFactor // kg

    // Year-by-year cash flows
    const cashFlows: {
      year: number
      energy: number
      revenue: number
      opex: number
      netCashFlow: number
      cumulativeCashFlow: number
      co2Avoided: number
    }[] = []

    let totalEnergy = 0
    let totalRevenue = 0
    let totalOpex = 0
    let totalCo2 = 0
    let cumulativeCashFlow = -capex

    // Year 0 (initial investment)
    cashFlows.push({
      year: 0,
      energy: 0,
      revenue: 0,
      opex: 0,
      netCashFlow: -capex,
      cumulativeCashFlow: -capex,
      co2Avoided: 0,
    })

    for (let year = 1; year <= (systemLifetimeYears || 25); year++) {
      const degradation = Math.pow(1 - (degradationRate || 0.005), year - 1)
      const energy = annualEnergyYear1 * degradation
      const revenue = annualRevenueYear1 * degradation * Math.pow(1 + (inflationRate || 0.02), year - 1)
      const opex = (opexAnnual || capex * 0.015) * Math.pow(1 + (inflationRate || 0.02), year - 1)
      const netCashFlow = revenue - opex
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
        netCashFlow: Math.round(netCashFlow),
        cumulativeCashFlow: Math.round(cumulativeCashFlow),
        co2Avoided: Math.round(energy * emissionFactor),
      })
    }

    // Payback period (simple)
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

    // NPV
    const dr = discountRate || 0.08
    let npv = -capex
    for (let year = 1; year < cashFlows.length; year++) {
      npv += cashFlows[year].netCashFlow / Math.pow(1 + dr, year)
    }

    // IRR (bisection)
    let irr = 0
    const findNpv = (rate: number) => {
      let n = -capex
      for (let year = 1; year < cashFlows.length; year++) {
        n += cashFlows[year].netCashFlow / Math.pow(1 + rate, year)
      }
      return n
    }
    let low = 0
    let high = 1
    for (let i = 0; i < 50; i++) {
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

    // LCOE
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

    // === NEW: Debt Service (Loan Amortization) ===
    const loanAmount = capex * (financingRate || 0)
    const loanTermMonths = (loanTermYears || 0) * 12
    const monthlyInterestRate = dr / 12
    const monthlyPayment = loanTermMonths > 0 && loanAmount > 0
      ? loanAmount * (monthlyInterestRate * Math.pow(1 + monthlyInterestRate, loanTermMonths)) /
        (Math.pow(1 + monthlyInterestRate, loanTermMonths) - 1)
      : 0
    const annualDebtService = monthlyPayment * 12
    const totalDebtService = annualDebtService * (loanTermYears || 0)
    const dscr = annualDebtService > 0
      ? Math.round(((annualRevenueYear1 - (opexAnnual || capex * 0.015)) / annualDebtService) * 100) / 100
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

    // Sensitivity analysis
    const sensitivity = {
      capex: [-20, -10, 0, 10, 20].map((delta) => ({
        change: `${delta}%`,
        npv: npv - (capex * delta) / 100,
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
      // NEW: Advanced metrics
      p50p90: { p50: Math.round(p50Energy), p90: Math.round(p90Energy), p10: Math.round(p10Energy), method: 'statistical (8% variability)' },
      detailedLosses: { ...losses, total: totalLossesPct, performanceRatio: Math.round((1 - totalLossesPct / 100) * 1000) / 10 },
      debtService: {
        loanAmount: Math.round(loanAmount), monthlyPayment: Math.round(monthlyPayment),
        annualDebtService: Math.round(annualDebtService), totalDebtService: Math.round(totalDebtService),
        dscr, loanTermYears: loanTermYears || 0,
      },
      irradianceScenarios,
      inputs: {
        capacityKwp,
        capex,
        opexAnnual: opexAnnual || capex * 0.015,
        tariffRetail,
        tariffFeedIn: tariffFeedIn || tariffRetail * 0.5,
        selfConsumptionRate: selfConsumptionRate || 0.7,
        degradationRate: degradationRate || 0.005,
        discountRate: dr,
        systemLifetimeYears: systemLifetimeYears || 25,
        location,
        psh,
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
        npv: Math.round(npv),
        irr: Math.round(irr * 1000) / 10, // percentage with 1 decimal
        paybackYears: paybackYears ? Math.round(paybackYears * 10) / 10 : null,
        lcoe: Math.round(lcoe * 10000) / 10000, // per kWh
        lcoe_fils: Math.round(lcoe * 1000 * 10) / 10, // fils/kWh for SAR
      },
      cashFlows,
      scenarios,
      sensitivity,
      disclaimer:
        'هذه النتائج تقديرية لأغراض التخطيط فقط ولا تشكل استشارة مالية أو استثمارية. يرجى الرجوع لمستشار مالي قبل اتخاذ قرارات الاستثمار.',
    })
  } catch (error) {
    console.error('Calculator API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

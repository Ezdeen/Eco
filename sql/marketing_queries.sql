-- ============================================================================
-- Solar Calculator — analytics & lead-extraction queries for marketing automation
-- Run against the same PostgreSQL database as prisma/schema.prisma
-- (tables: "SolarCalculatorLead", "SolarCalculatorEvent")
-- ============================================================================

-- 1) High-value SME leads not yet contacted — top of the outreach queue.
SELECT "id", "fullName", "email", "phone", "companyName",
       "monthlyElectricityBill", "estimatedSystemCost", "loanAmount",
       "priorityScore", "priority", "createdAt"
FROM "SolarCalculatorLead"
WHERE "userType" = 'sme'
  AND "status" = 'new'
ORDER BY "priorityScore" DESC, "createdAt" DESC
LIMIT 100;

-- 2) Loan-seeking prospects (financing a large share of the system) — hand off
-- to the green-loan banking partner.
SELECT "id", "fullName", "email", "phone", "userType", "companyName",
       "loanPercent", "loanAmount", "loanTermYears", "loanInterestRatePct",
       "monthlyPMT", "priority", "createdAt"
FROM "SolarCalculatorLead"
WHERE "loanPercent" >= 50
  AND "status" IN ('new', 'contacted')
ORDER BY "loanAmount" DESC;

-- 3) Overall priority distribution — quick health check of lead quality.
SELECT "priority", "userType", COUNT(*) AS lead_count,
       ROUND(AVG("priorityScore")::numeric, 1) AS avg_score,
       ROUND(AVG("monthlyElectricityBill")::numeric, 0) AS avg_monthly_bill
FROM "SolarCalculatorLead"
GROUP BY "priority", "userType"
ORDER BY "priority" DESC, "userType";

-- 4) Funnel conversion rate: anonymous calculator sessions vs. captured leads,
-- by day (assumes SolarCalculatorEvent.sessionId is present on both when the
-- client is instrumented to send it on the lead POST as well — otherwise use
-- the day-level ratio below, which needs no session join).
SELECT
    day,
    events,
    leads,
    ROUND(100.0 * leads / NULLIF(events, 0), 2) AS conversion_rate_pct
FROM (
    SELECT date_trunc('day', "createdAt") AS day, COUNT(*) AS events
    FROM "SolarCalculatorEvent"
    GROUP BY 1
) e
FULL OUTER JOIN (
    SELECT date_trunc('day', "createdAt") AS day, COUNT(*) AS leads
    FROM "SolarCalculatorLead"
    GROUP BY 1
) l USING (day)
ORDER BY day DESC
LIMIT 30;

-- 5) Leads with the fastest projected payback — strongest "sell" for follow-up
-- (most convincing numbers to close on a call).
SELECT "id", "fullName", "email", "userType", "simplePaybackYears",
       "discountedPaybackYears", "cumulativeROI20yrPct", "monthlySavings"
FROM "SolarCalculatorLead"
WHERE "simplePaybackYears" IS NOT NULL
  AND "status" = 'new'
ORDER BY "simplePaybackYears" ASC
LIMIT 50;

-- 6) High-carbon-impact leads — useful for a separate ESG/carbon-credit
-- partner outreach track, independent of loan size.
SELECT "id", "fullName", "email", "userType", "companyName",
       "annualCo2AvoidedTons", "lifetimeCo2AvoidedTons",
       "potentialCarbonCreditIncomeAnnual"
FROM "SolarCalculatorLead"
WHERE "annualCo2AvoidedTons" >= 5
ORDER BY "annualCo2AvoidedTons" DESC
LIMIT 100;

-- 7) Stale "new" leads (>72h untouched) — SLA breach alert for the sales team.
SELECT "id", "fullName", "email", "phone", "priority", "createdAt"
FROM "SolarCalculatorLead"
WHERE "status" = 'new'
  AND "createdAt" < now() - INTERVAL '72 hours'
ORDER BY "priority" DESC, "createdAt" ASC;

-- 8) UTM campaign performance — leads and avg. priority score per campaign,
-- for ad-spend attribution.
SELECT COALESCE("utmSource", '(direct)') AS utm_source,
       COALESCE("utmCampaign", '(none)') AS utm_campaign,
       COUNT(*) AS leads,
       ROUND(AVG("priorityScore")::numeric, 1) AS avg_score,
       COUNT(*) FILTER (WHERE "priority" = 'high') AS high_priority_leads
FROM "SolarCalculatorLead"
GROUP BY 1, 2
ORDER BY leads DESC;

-- 9) Report engagement — leads who never opened their PDF (re-send / nudge
-- candidates) vs. leads who downloaded it multiple times (strong intent).
SELECT "id", "fullName", "email", "reportDownloadCount", "reportLastDownloadedAt", "createdAt"
FROM "SolarCalculatorLead"
WHERE "reportDownloadCount" = 0
  AND "createdAt" < now() - INTERVAL '24 hours'
ORDER BY "createdAt" ASC
LIMIT 100;

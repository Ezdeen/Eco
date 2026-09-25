-- ============================================================================
-- Solar Green Loan & Investment Calculator — PostgreSQL schema (reference DDL)
-- ============================================================================
-- SOURCE OF TRUTH IS prisma/schema.prisma (models SolarCalculatorLead and
-- SolarCalculatorEvent). This file is a hand-written, exact mirror of what
-- `prisma migrate` / `prisma db push` generates from that schema, provided as
-- a standalone deliverable for DBAs / BI tooling that read raw SQL directly
-- (per the project brief). Do NOT run this against a database already
-- managed by Prisma migrations — use `bun run db:migrate` instead; run this
-- only against a fresh/unmanaged database, or use it as documentation.
--
-- Naming matches Prisma's default (no @@map/@map used anywhere in this
-- codebase's schema): table and column names are exactly the model/field
-- names, case-sensitive, hence the double-quoted identifiers throughout.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Table: SolarCalculatorEvent
-- Anonymous, pre-gate funnel-tracking log (no PII) — every time a visitor's
-- sliders settle, the current calculation is logged for conversion analysis.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "SolarCalculatorEvent" (
    "id"                     TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "sessionId"              TEXT,
    "userType"               TEXT NOT NULL CHECK ("userType" IN ('individual', 'sme')),
    "monthlyElectricityBill" DOUBLE PRECISION NOT NULL,
    "loanPercent"            DOUBLE PRECISION NOT NULL,
    "loanTermYears"          INTEGER NOT NULL,
    "countryCode"            TEXT NOT NULL DEFAULT 'SA',
    "currency"               TEXT NOT NULL DEFAULT 'SAR',
    "resultSnapshot"         JSONB NOT NULL,
    "ipHash"                 TEXT,
    "userAgent"              TEXT,
    "utmSource"              TEXT,
    "utmCampaign"            TEXT,
    "locale"                 TEXT NOT NULL DEFAULT 'ar',
    "createdAt"              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "SolarCalculatorEvent_createdAt_idx"
    ON "SolarCalculatorEvent" ("createdAt");
CREATE INDEX IF NOT EXISTS "SolarCalculatorEvent_userType_createdAt_idx"
    ON "SolarCalculatorEvent" ("userType", "createdAt");

-- ----------------------------------------------------------------------------
-- Table: SolarCalculatorLead
-- A visitor who crossed the "full report" gate (name + email at minimum).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "SolarCalculatorLead" (
    "id"                                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,

    -- Contact
    "fullName"                            TEXT NOT NULL,
    "email"                               TEXT NOT NULL,
    "phone"                               TEXT,
    "companyName"                         TEXT,
    "userType"                            TEXT NOT NULL CHECK ("userType" IN ('individual', 'sme')),
    "locale"                              TEXT NOT NULL DEFAULT 'ar',
    "countryCode"                         TEXT NOT NULL DEFAULT 'SA',

    -- Inputs
    "monthlyElectricityBill"              DOUBLE PRECISION NOT NULL,
    "estimatedSystemCostOverride"         DOUBLE PRECISION,
    "loanPercent"                         DOUBLE PRECISION NOT NULL,
    "loanTermYears"                       INTEGER NOT NULL,
    "loanInterestRatePct"                 DOUBLE PRECISION NOT NULL,
    "savingsRatio"                        DOUBLE PRECISION NOT NULL DEFAULT 0.85,

    -- Financial outputs (server-computed, DB-backed reference factors)
    "currency"                            TEXT NOT NULL,
    "estimatedSystemCost"                 DOUBLE PRECISION NOT NULL,
    "loanAmount"                          DOUBLE PRECISION NOT NULL,
    "equityDownPayment"                   DOUBLE PRECISION NOT NULL,
    "monthlyPMT"                          DOUBLE PRECISION NOT NULL,
    "monthlySavings"                      DOUBLE PRECISION NOT NULL,
    "netMonthlyCashflowDuringLoan"        DOUBLE PRECISION NOT NULL,
    "netMonthlyCashflowAfterLoan"         DOUBLE PRECISION NOT NULL,
    "simplePaybackYears"                  DOUBLE PRECISION,
    "discountedPaybackYears"              DOUBLE PRECISION,
    "cumulativeROI20yrPct"                DOUBLE PRECISION,
    "cumulativeNetCashflow20yr"           DOUBLE PRECISION NOT NULL,

    -- Environmental outputs
    "annualCo2AvoidedTons"                DOUBLE PRECISION NOT NULL,
    "lifetimeCo2AvoidedTons"              DOUBLE PRECISION NOT NULL,
    "potentialCarbonCreditIncomeAnnual"   DOUBLE PRECISION NOT NULL,
    "treesEquivalentPerYear"              DOUBLE PRECISION NOT NULL,
    "carsRemovedEquivalent"               DOUBLE PRECISION NOT NULL,

    -- Lead scoring
    "priorityScore"                       INTEGER NOT NULL CHECK ("priorityScore" BETWEEN 0 AND 100),
    "priority"                            TEXT NOT NULL CHECK ("priority" IN ('low', 'medium', 'high')),
    "scoreReasons"                        JSONB,
    "resultSnapshot"                      JSONB NOT NULL,

    -- Lifecycle
    "status"                              TEXT NOT NULL DEFAULT 'new'
                                           CHECK ("status" IN ('new', 'contacted', 'qualified', 'converted', 'rejected')),

    -- Report / PDF
    "reportToken"                         TEXT NOT NULL UNIQUE,
    "reportGeneratedAt"                   TIMESTAMPTZ,
    "reportSentAt"                        TIMESTAMPTZ,
    "reportDownloadCount"                 INTEGER NOT NULL DEFAULT 0,
    "reportLastDownloadedAt"              TIMESTAMPTZ,
    "reportVerificationHash"              TEXT,

    -- Marketing / audit
    "utmSource"                           TEXT,
    "utmCampaign"                         TEXT,
    "ipHash"                              TEXT,
    "userAgent"                           TEXT,

    "createdAt"                           TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt"                           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "SolarCalculatorLead_priority_status_createdAt_idx"
    ON "SolarCalculatorLead" ("priority", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "SolarCalculatorLead_email_idx"
    ON "SolarCalculatorLead" ("email");
CREATE INDEX IF NOT EXISTS "SolarCalculatorLead_userType_createdAt_idx"
    ON "SolarCalculatorLead" ("userType", "createdAt");
CREATE INDEX IF NOT EXISTS "SolarCalculatorLead_createdAt_idx"
    ON "SolarCalculatorLead" ("createdAt");

-- ----------------------------------------------------------------------------
-- Trigger: keep "updatedAt" current on every UPDATE (Prisma's @updatedAt does
-- this at the application layer already; this trigger makes the guarantee
-- hold even for direct SQL/BI writes that bypass Prisma).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_solar_calculator_lead_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_solar_calculator_lead_updated_at ON "SolarCalculatorLead";
CREATE TRIGGER trg_solar_calculator_lead_updated_at
    BEFORE UPDATE ON "SolarCalculatorLead"
    FOR EACH ROW
    EXECUTE FUNCTION set_solar_calculator_lead_updated_at();

COMMIT;

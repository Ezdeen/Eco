-- AlterTable
ALTER TABLE "CalculationRun" ADD COLUMN     "claimGrade" TEXT,
ADD COLUMN     "methodologyHash" TEXT,
ADD COLUMN     "methodologyVersionId" TEXT;

-- AlterTable
ALTER TABLE "GridEmissionFactor" ADD COLUMN     "bmFactor" DOUBLE PRECISION,
ADD COLUMN     "omFactor" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Methodology" ADD COLUMN     "formulaId" TEXT;

-- CreateTable
CREATE TABLE "MethodologyVersion" (
    "id" TEXT NOT NULL,
    "methodologyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "formulaId" TEXT NOT NULL,
    "formulaRevision" INTEGER NOT NULL,
    "parameters" TEXT NOT NULL,
    "guardianSourcePath" TEXT,
    "guardianPolicyUuid" TEXT,
    "guardianSourceHash" TEXT,
    "guardianCommit" TEXT,
    "contentHash" TEXT NOT NULL,
    "changeNote" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MethodologyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MethodologyVersion_contentHash_idx" ON "MethodologyVersion"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "MethodologyVersion_methodologyId_version_key" ON "MethodologyVersion"("methodologyId", "version");

-- CreateIndex
CREATE INDEX "CalculationRun_methodologyVersionId_idx" ON "CalculationRun"("methodologyVersionId");

-- AddForeignKey
ALTER TABLE "CalculationRun" ADD CONSTRAINT "CalculationRun_methodologyVersionId_fkey" FOREIGN KEY ("methodologyVersionId") REFERENCES "MethodologyVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MethodologyVersion" ADD CONSTRAINT "MethodologyVersion_methodologyId_fkey" FOREIGN KEY ("methodologyId") REFERENCES "Methodology"("id") ON DELETE CASCADE ON UPDATE CASCADE;

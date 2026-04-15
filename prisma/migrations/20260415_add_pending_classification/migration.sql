-- F-AO2-06: PendingClassification review queue for low-confidence LLM
-- classifier suggestions. Admins approve / reject / reassign from the
-- operations panel instead of auto-attaching every suggestion.

-- CreateEnum
CREATE TYPE "PendingClassificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "pending_classifications" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "suggestedAliasId" TEXT,
    "suggestedAlias" TEXT,
    "suggestedBrand" TEXT,
    "confidence" DOUBLE PRECISION,
    "reason" TEXT,
    "status" "PendingClassificationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pending_classifications_modelId_key" ON "pending_classifications"("modelId");

-- CreateIndex
CREATE INDEX "pending_classifications_status_createdAt_idx" ON "pending_classifications"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "pending_classifications" ADD CONSTRAINT "pending_classifications_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ROLLBACK: revert commit; manual SQL recovery required (composite migration: DROP TABLE for new tables; DROP INDEX for new indexes; ALTER TABLE DROP CONSTRAINT for new constraints)
-- CreateTable
CREATE TABLE "template_test_runs" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "totalTokens" INTEGER,
    "totalCost" DECIMAL(12,8),
    "totalLatency" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_test_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "template_test_runs_templateId_createdAt_idx" ON "template_test_runs"("templateId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "template_test_runs_userId_createdAt_idx" ON "template_test_runs"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "template_test_runs_userId_templateId_createdAt_idx" ON "template_test_runs"("userId", "templateId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "template_test_runs" ADD CONSTRAINT "template_test_runs_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_test_runs" ADD CONSTRAINT "template_test_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ROLLBACK: revert commit; manual SQL recovery required (composite migration: DROP TABLE for new tables; DROP INDEX for new indexes; DROP TYPE for new types)
-- CreateEnum
CREATE TYPE "SystemLogCategory" AS ENUM ('SYNC', 'INFERENCE', 'HEALTH_CHECK', 'AUTO_RECOVERY');

-- CreateEnum
CREATE TYPE "SystemLogLevel" AS ENUM ('INFO', 'WARN', 'ERROR');

-- CreateTable
CREATE TABLE "system_logs" (
    "id" TEXT NOT NULL,
    "category" "SystemLogCategory" NOT NULL,
    "level" "SystemLogLevel" NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "system_logs_category_idx" ON "system_logs"("category");

-- CreateIndex
CREATE INDEX "system_logs_createdAt_idx" ON "system_logs"("createdAt");

-- BL-BILLING-AUDIT-EXT-P2 F-BAP2-02: 对账记录表。
-- tier=1 用 Tier 1 fetcher per-model；tier=2 用余额 delta；status MATCH/MINOR_DIFF/BIG_DIFF。
-- unique(providerId,reportDate,modelName) 让同日重跑做 upsert。

CREATE TABLE "bill_reconciliation" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "reportDate" DATE NOT NULL,
    "tier" INTEGER NOT NULL,
    "modelName" TEXT,
    "upstreamAmount" DECIMAL(12,6) NOT NULL,
    "gatewayAmount" DECIMAL(12,6) NOT NULL,
    "delta" DECIMAL(12,6) NOT NULL,
    "deltaPercent" DECIMAL(8,2),
    "status" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bill_reconciliation_pkey" PRIMARY KEY ("id")
);

-- modelName 可空；Postgres 默认把多个 NULL 视为不同值，正合本意：
-- tier=2 行（modelName=NULL）按 (providerId,reportDate) 唯一即可。
CREATE UNIQUE INDEX "bill_reconciliation_providerId_reportDate_modelName_key"
  ON "bill_reconciliation"("providerId", "reportDate", "modelName");

CREATE INDEX "bill_reconciliation_reportDate_idx"
  ON "bill_reconciliation"("reportDate");

ALTER TABLE "bill_reconciliation" ADD CONSTRAINT "bill_reconciliation_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

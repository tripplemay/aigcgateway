-- BL-BILLING-AUDIT-EXT-P2 F-BAP2-01: Tier 2 上游余额快照表。
-- 每日 cron 拉一次，前后日 snapshot 求 delta = upstream usage。

CREATE TABLE "balance_snapshots" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currency" TEXT NOT NULL,
    "balance" DECIMAL(12,4) NOT NULL,
    "totalUsage" DECIMAL(12,4),
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "balance_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "balance_snapshots_providerId_snapshotAt_idx"
  ON "balance_snapshots"("providerId", "snapshotAt");

ALTER TABLE "balance_snapshots" ADD CONSTRAINT "balance_snapshots_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

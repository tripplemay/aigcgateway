-- F-AF2-09: Add batchId to transactions for grouping related refunds
ALTER TABLE "transactions" ADD COLUMN "batchId" TEXT;

CREATE INDEX "transactions_batchId_idx" ON "transactions"("batchId");

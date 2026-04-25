-- BL-BILLING-AUDIT-EXT-P2 F-BAP2-04: call_logs 查询性能 index。
-- 配合 30 天 TTL cleanup，把按 source / channel / 时间范围 GROUP BY 的对账查询提速。
-- IF NOT EXISTS 让生产 deploy 幂等（即便手动建过同名 index 也无副作用）。

CREATE INDEX IF NOT EXISTS "idx_call_logs_source_date"
  ON "call_logs"("source", "createdAt");

CREATE INDEX IF NOT EXISTS "idx_call_logs_channel_source_date"
  ON "call_logs"("channelId", "source", "createdAt");

CREATE INDEX IF NOT EXISTS "idx_call_logs_created_at"
  ON "call_logs"("createdAt");

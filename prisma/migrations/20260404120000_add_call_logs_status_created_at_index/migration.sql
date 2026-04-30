-- ROLLBACK: DROP INDEX for indexes created in this migration
-- 补 (status, createdAt DESC) 复合索引
-- 用于 usage/route.ts 的 count({ where: { status: "SUCCESS", createdAt: { gte } } }) 查询
CREATE INDEX IF NOT EXISTS "call_logs_status_createdAt_idx"
  ON call_logs (status, "createdAt" DESC);

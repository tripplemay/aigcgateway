-- K1: API Key 用户级迁移 + 余额模型收敛
-- 不兼容旧数据，清空 API Key 表重建

-- 1. 清空旧 API Key 数据（用户需重新创建）
TRUNCATE TABLE "api_keys";

-- 2. 删除旧的外键和索引
ALTER TABLE "api_keys" DROP CONSTRAINT IF EXISTS "api_keys_projectId_fkey";
DROP INDEX IF EXISTS "api_keys_projectId_idx";

-- 3. 重建 ApiKey 表结构：projectId → userId
ALTER TABLE "api_keys" DROP COLUMN "projectId";
ALTER TABLE "api_keys" ADD COLUMN "userId" TEXT NOT NULL;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "api_keys_userId_idx" ON "api_keys" ("userId");

-- 4. User 加 defaultProjectId（回填第一个项目）
ALTER TABLE "users" ADD COLUMN "defaultProjectId" TEXT;
UPDATE "users" SET "defaultProjectId" = (
  SELECT "id" FROM "projects" WHERE "projects"."userId" = "users"."id"
  ORDER BY "createdAt" ASC LIMIT 1
);

-- 5. 删除 Project.balance 字段
ALTER TABLE "projects" DROP COLUMN IF EXISTS "balance";

-- 6. RechargeOrder: projectId → userId
-- 先清空（开发阶段无真实充值数据）
TRUNCATE TABLE "recharge_orders";
ALTER TABLE "recharge_orders" DROP CONSTRAINT IF EXISTS "recharge_orders_projectId_fkey";
DROP INDEX IF EXISTS "recharge_orders_projectId_createdAt_idx";
ALTER TABLE "recharge_orders" DROP COLUMN "projectId";
ALTER TABLE "recharge_orders" ADD COLUMN "userId" TEXT NOT NULL;
ALTER TABLE "recharge_orders" ADD CONSTRAINT "recharge_orders_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "recharge_orders_userId_createdAt_idx" ON "recharge_orders" ("userId", "createdAt" DESC);

-- 7. deduct_balance 函数改为直接接收 userId
CREATE OR REPLACE FUNCTION deduct_balance(
  p_user_id TEXT,
  p_project_id TEXT,
  p_amount DECIMAL(16,8),
  p_call_log_id TEXT,
  p_description TEXT DEFAULT 'API call deduction',
  p_trace_id TEXT DEFAULT NULL
)
RETURNS TABLE(new_balance DECIMAL(16,8)) AS $$
DECLARE
  v_new_balance DECIMAL(16,8);
BEGIN
  -- Lock the user row and deduct (p_user_id is now direct, no project lookup)
  UPDATE "users"
  SET "balance" = "balance" - p_amount, "updatedAt" = NOW()
  WHERE "id" = p_user_id AND "balance" >= p_amount
  RETURNING "balance" INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient balance for user %', p_user_id;
  END IF;

  -- Insert transaction record (p_project_id kept for audit trail, may be NULL)
  INSERT INTO "transactions" ("id", "projectId", "userId", "type", "amount", "balanceAfter", "status", "callLogId", "traceId", "description", "createdAt")
  VALUES (
    gen_random_uuid()::TEXT,
    p_project_id,
    p_user_id,
    'DEDUCTION',
    -p_amount,
    v_new_balance,
    'COMPLETED',
    p_call_log_id,
    p_trace_id,
    p_description,
    NOW()
  );

  RETURN QUERY SELECT v_new_balance;
END;
$$ LANGUAGE plpgsql;

-- 8. check_balance 函数改为直接接收 userId
CREATE OR REPLACE FUNCTION check_balance(
  p_user_id TEXT,
  p_amount DECIMAL(16,8)
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM "users" WHERE "id" = p_user_id AND "balance" >= p_amount
  );
END;
$$ LANGUAGE plpgsql;

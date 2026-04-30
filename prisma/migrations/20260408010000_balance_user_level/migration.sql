-- ROLLBACK: revert commit; manual SQL recovery required (composite migration: ALTER TABLE DROP COLUMN for new columns; DROP INDEX for new indexes; ALTER TABLE DROP CONSTRAINT for new constraints; DROP FUNCTION for new functions; data ops require restore from backup)
-- F-BU-01: User.balance 字段 + 数据迁移
-- F-BU-02: deduct_balance / check_balance SQL 函数重写

-- Step 1: Add balance column to users table
ALTER TABLE "users" ADD COLUMN "balance" DECIMAL(16,8) NOT NULL DEFAULT 0;

-- Step 2: Add userId column to transactions table
ALTER TABLE "transactions" ADD COLUMN "userId" TEXT;

-- Step 3: Migrate balances — aggregate Project.balance by userId into User.balance
UPDATE "users" u
SET "balance" = COALESCE(
  (SELECT SUM(p."balance") FROM "projects" p WHERE p."userId" = u."id"),
  0
);

-- Step 4: Backfill transactions.userId from projects
UPDATE "transactions" t
SET "userId" = p."userId"
FROM "projects" p
WHERE t."projectId" = p."id" AND t."userId" IS NULL;

-- Step 5: Create indexes
CREATE INDEX "transactions_userId_createdAt_idx" ON "transactions"("userId", "createdAt" DESC);

-- Step 6: Add foreign key
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 7: Drop old functions and recreate for users.balance
DROP FUNCTION IF EXISTS deduct_balance(TEXT, DECIMAL, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS deduct_balance(TEXT, DECIMAL, TEXT, TEXT);
DROP FUNCTION IF EXISTS check_balance(TEXT);

CREATE OR REPLACE FUNCTION deduct_balance(
  p_project_id TEXT,
  p_amount DECIMAL(16,8),
  p_call_log_id TEXT,
  p_description TEXT DEFAULT 'API call deduction',
  p_trace_id TEXT DEFAULT NULL
)
RETURNS TABLE(new_balance DECIMAL(16,8)) AS $$
DECLARE
  v_user_id TEXT;
  v_new_balance DECIMAL(16,8);
BEGIN
  -- Find the userId from the project
  SELECT "userId" INTO v_user_id FROM "projects" WHERE "id" = p_project_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Project not found: %', p_project_id;
  END IF;

  -- Lock the user row and deduct
  UPDATE "users"
  SET "balance" = "balance" - p_amount, "updatedAt" = NOW()
  WHERE "id" = v_user_id AND "balance" >= p_amount
  RETURNING "balance" INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient balance for user of project %', p_project_id;
  END IF;

  -- Insert transaction record
  INSERT INTO "transactions" ("id", "projectId", "userId", "type", "amount", "balanceAfter", "status", "callLogId", "traceId", "description", "createdAt")
  VALUES (
    gen_random_uuid()::TEXT,
    p_project_id,
    v_user_id,
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

-- Step 8: Rewrite check_balance to check users.balance via project
CREATE OR REPLACE FUNCTION check_balance(p_project_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM "projects" p
    JOIN "users" u ON u."id" = p."userId"
    WHERE p."id" = p_project_id AND u."balance" > 0
  );
END;
$$ LANGUAGE plpgsql;

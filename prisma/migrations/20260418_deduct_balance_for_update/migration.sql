-- ROLLBACK: revert commit; manual SQL recovery required (composite migration: DROP FUNCTION for new functions; data ops require restore from backup)
-- BL-SEC-BILLING-AI / F-BA-01
-- deduct_balance: explicit SELECT ... FOR UPDATE row lock (no EPQ reliance).
-- Signature and return type are kept identical to 20260410120000_apikey_to_user_level
-- so post-process.ts callers require no changes.

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
  v_balance DECIMAL(16,8);
  v_new_balance DECIMAL(16,8);
BEGIN
  -- Explicit row lock: concurrent deductions on the same user serialize here.
  SELECT "balance" INTO v_balance
  FROM "users"
  WHERE "id" = p_user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance for user %', p_user_id;
  END IF;

  UPDATE "users"
  SET "balance" = "balance" - p_amount, "updatedAt" = NOW()
  WHERE "id" = p_user_id
  RETURNING "balance" INTO v_new_balance;

  -- Preserve existing transactions INSERT (kept identical to 20260410120000).
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

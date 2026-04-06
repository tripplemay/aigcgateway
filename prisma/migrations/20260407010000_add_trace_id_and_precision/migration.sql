-- Transaction: add traceId column
ALTER TABLE "transactions" ADD COLUMN "traceId" TEXT;

-- Transaction: upgrade amount precision from Decimal(12,6) to Decimal(16,8)
ALTER TABLE "transactions" ALTER COLUMN "amount" TYPE DECIMAL(16,8);
ALTER TABLE "transactions" ALTER COLUMN "balanceAfter" TYPE DECIMAL(16,8);

-- Project: upgrade balance precision from Decimal(12,6) to Decimal(16,8)
ALTER TABLE "projects" ALTER COLUMN "balance" TYPE DECIMAL(16,8);

-- Update deduct_balance function to accept traceId and use higher precision
CREATE OR REPLACE FUNCTION deduct_balance(
  p_project_id TEXT,
  p_amount DECIMAL(16,8),
  p_call_log_id TEXT,
  p_description TEXT DEFAULT NULL,
  p_trace_id TEXT DEFAULT NULL
) RETURNS TABLE(success BOOLEAN, new_balance DECIMAL, transaction_id TEXT) AS $$
DECLARE
  v_balance DECIMAL(16,8);
  v_new_balance DECIMAL(16,8);
  v_txn_id TEXT;
BEGIN
  SELECT balance INTO v_balance
  FROM projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::DECIMAL, NULL::TEXT;
    RETURN;
  END IF;

  IF v_balance < p_amount THEN
    RETURN QUERY SELECT FALSE, v_balance, NULL::TEXT;
    RETURN;
  END IF;

  v_new_balance := v_balance - p_amount;
  UPDATE projects SET balance = v_new_balance, "updatedAt" = NOW()
  WHERE id = p_project_id;

  v_txn_id := gen_random_uuid()::TEXT;
  INSERT INTO transactions (id, "projectId", type, amount, "balanceAfter", status, "callLogId", "traceId", description, "createdAt")
  VALUES (v_txn_id, p_project_id, 'DEDUCTION', -p_amount, v_new_balance, 'COMPLETED', p_call_log_id, p_trace_id, p_description, NOW());

  RETURN QUERY SELECT TRUE, v_new_balance, v_txn_id;
END;
$$ LANGUAGE plpgsql;

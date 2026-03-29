-- 全文搜索: 添加 tsvector 列
ALTER TABLE call_logs ADD COLUMN search_vector tsvector;

-- 创建 GIN 索引
CREATE INDEX idx_call_logs_search ON call_logs USING GIN(search_vector);

-- 创建触发器函数: 自动更新 tsvector
CREATE OR REPLACE FUNCTION call_logs_search_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', COALESCE(NEW."modelName", '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW."responseContent", '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(
      (SELECT string_agg(msg->>'content', ' ')
       FROM jsonb_array_elements(NEW."promptSnapshot"::jsonb) AS msg), '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 创建触发器
CREATE TRIGGER call_logs_search_trigger
  BEFORE INSERT OR UPDATE OF "promptSnapshot", "responseContent", "modelName"
  ON call_logs
  FOR EACH ROW
  EXECUTE FUNCTION call_logs_search_update();

-- 余额扣费函数（并发安全，SELECT ... FOR UPDATE）
CREATE OR REPLACE FUNCTION deduct_balance(
  p_project_id TEXT,
  p_amount DECIMAL(12,6),
  p_call_log_id TEXT,
  p_description TEXT DEFAULT NULL
) RETURNS TABLE(success BOOLEAN, new_balance DECIMAL, transaction_id TEXT) AS $$
DECLARE
  v_balance DECIMAL(12,6);
  v_new_balance DECIMAL(12,6);
  v_txn_id TEXT;
BEGIN
  -- 锁定项目行，防止并发超扣
  SELECT balance INTO v_balance
  FROM projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::DECIMAL, NULL::TEXT;
    RETURN;
  END IF;

  -- 检查余额是否充足
  IF v_balance < p_amount THEN
    RETURN QUERY SELECT FALSE, v_balance, NULL::TEXT;
    RETURN;
  END IF;

  -- 扣减余额
  v_new_balance := v_balance - p_amount;
  UPDATE projects SET balance = v_new_balance, "updatedAt" = NOW()
  WHERE id = p_project_id;

  -- 写入交易记录
  v_txn_id := gen_random_uuid()::TEXT;
  INSERT INTO transactions (id, "projectId", type, amount, "balanceAfter", status, "callLogId", description, "createdAt")
  VALUES (v_txn_id, p_project_id, 'DEDUCTION', -p_amount, v_new_balance, 'COMPLETED', p_call_log_id, p_description, NOW());

  RETURN QUERY SELECT TRUE, v_new_balance, v_txn_id;
END;
$$ LANGUAGE plpgsql;

-- 余额检查函数（API 网关中间件预检，不锁行）
CREATE OR REPLACE FUNCTION check_balance(p_project_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM projects WHERE id = p_project_id AND balance > 0
  );
END;
$$ LANGUAGE plpgsql;

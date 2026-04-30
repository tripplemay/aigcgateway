-- ROLLBACK: revert commit; PostgreSQL ALTER TYPE ... ADD VALUE is not reversible — manual SQL recovery required (drop + recreate enum or accept residual value)
-- RATE-LIMIT F-RL-07 — add RATE_LIMIT category to SystemLogCategory enum.

ALTER TYPE "SystemLogCategory" ADD VALUE IF NOT EXISTS 'RATE_LIMIT';

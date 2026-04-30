-- ROLLBACK: revert commit; PostgreSQL ALTER TYPE ... ADD VALUE is not reversible — manual SQL recovery required (drop + recreate enum or accept residual value)
-- ONBOARDING-ENHANCE F-OE-01: add BONUS to TransactionType enum
-- Idempotent: safe to re-run if value already exists.
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'BONUS';

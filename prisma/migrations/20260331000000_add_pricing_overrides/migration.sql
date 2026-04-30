-- ROLLBACK: ALTER TABLE ... DROP COLUMN for columns added in this migration
-- AlterTable
ALTER TABLE "provider_configs" ADD COLUMN IF NOT EXISTS "pricing_overrides" JSONB;

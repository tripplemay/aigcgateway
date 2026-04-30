-- ROLLBACK: ALTER TABLE ... DROP COLUMN for columns added in this migration
-- AlterTable
ALTER TABLE "provider_configs" ADD COLUMN "health_check_endpoint" TEXT;

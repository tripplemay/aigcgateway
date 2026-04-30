-- ROLLBACK: ALTER TABLE ... DROP COLUMN for columns added in this migration
-- AlterTable
ALTER TABLE "model_aliases" ADD COLUMN     "sellPrice" JSONB;

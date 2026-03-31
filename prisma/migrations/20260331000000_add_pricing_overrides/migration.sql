-- AlterTable
ALTER TABLE "provider_configs" ADD COLUMN IF NOT EXISTS "pricing_overrides" JSONB;

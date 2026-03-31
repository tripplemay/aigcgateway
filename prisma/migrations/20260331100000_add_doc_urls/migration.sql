-- AlterTable
ALTER TABLE "provider_configs" ADD COLUMN IF NOT EXISTS "doc_urls" JSONB;

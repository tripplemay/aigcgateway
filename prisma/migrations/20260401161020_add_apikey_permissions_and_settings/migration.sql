-- ROLLBACK: ALTER TABLE ... DROP COLUMN for columns added in this migration
-- AlterTable: API Keys 扩展字段
ALTER TABLE "api_keys" ADD COLUMN     "description" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "ipWhitelist" JSONB,
ADD COLUMN     "permissions" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "rateLimit" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now();

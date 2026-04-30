-- ROLLBACK: revert commit; manual SQL recovery required (composite migration: DROP TABLE for new tables; ALTER TABLE DROP COLUMN for new columns; DROP INDEX for new indexes; ALTER TABLE DROP CONSTRAINT for new constraints; data ops require restore from backup)
-- Step 1: Clear old ModelAlias data (dev phase, no data preservation needed)
DELETE FROM "model_aliases";

-- Step 2: Drop old column
ALTER TABLE "model_aliases" DROP COLUMN "modelName";

-- Step 3: Drop old index
DROP INDEX IF EXISTS "model_aliases_modelName_idx";

-- Step 4: Add new columns to model_aliases
ALTER TABLE "model_aliases" ADD COLUMN "brand" TEXT;
ALTER TABLE "model_aliases" ADD COLUMN "modality" "ModelModality" NOT NULL DEFAULT 'TEXT';
ALTER TABLE "model_aliases" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "model_aliases" ADD COLUMN "contextWindow" INTEGER;
ALTER TABLE "model_aliases" ADD COLUMN "maxTokens" INTEGER;
ALTER TABLE "model_aliases" ADD COLUMN "capabilities" JSONB;
ALTER TABLE "model_aliases" ADD COLUMN "description" TEXT;
ALTER TABLE "model_aliases" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Step 5: Create indexes on model_aliases
CREATE INDEX "model_aliases_enabled_idx" ON "model_aliases"("enabled");
CREATE INDEX "model_aliases_brand_idx" ON "model_aliases"("brand");

-- Step 6: Create alias_model_links table
CREATE TABLE "alias_model_links" (
    "id" TEXT NOT NULL,
    "aliasId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,

    CONSTRAINT "alias_model_links_pkey" PRIMARY KEY ("id")
);

-- Step 7: Create unique constraint and foreign keys
CREATE UNIQUE INDEX "alias_model_links_aliasId_modelId_key" ON "alias_model_links"("aliasId", "modelId");

ALTER TABLE "alias_model_links" ADD CONSTRAINT "alias_model_links_aliasId_fkey" FOREIGN KEY ("aliasId") REFERENCES "model_aliases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alias_model_links" ADD CONSTRAINT "alias_model_links_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

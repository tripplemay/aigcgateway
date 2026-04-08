-- P4 Model Aggregation: Schema migration
-- 1. Clear existing model/channel data (channels first due to FK)
-- 2. Drop deprecated fields from models
-- 3. Create ModelAlias table
-- 4. Change Channel unique constraint from (providerId, modelId, realModelId) to (providerId, modelId)

-- Step 1: Clear data (channels references models via FK)
DELETE FROM "health_checks";
DELETE FROM "channels";
DELETE FROM "models";

-- Step 2: Drop deprecated fields from models
ALTER TABLE "models" DROP COLUMN IF EXISTS "canonicalName";
ALTER TABLE "models" DROP COLUMN IF EXISTS "isVariant";

-- Step 3: Create ModelAlias table
CREATE TABLE "model_aliases" (
    "id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_aliases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "model_aliases_alias_key" ON "model_aliases"("alias");
CREATE INDEX "model_aliases_modelName_idx" ON "model_aliases"("modelName");

-- Step 4: Change Channel unique constraint
DROP INDEX IF EXISTS "channels_providerId_modelId_realModelId_key";
CREATE UNIQUE INDEX "channels_providerId_modelId_key" ON "channels"("providerId", "modelId");

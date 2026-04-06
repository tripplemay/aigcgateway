-- AlterTable: add enabled, canonicalName, isVariant to models
ALTER TABLE "models" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "models" ADD COLUMN "canonicalName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "models" ADD COLUMN "isVariant" BOOLEAN NOT NULL DEFAULT false;

-- Migrate existing models: enable all current models (preserve service continuity)
UPDATE "models" SET "enabled" = true;

-- Compute canonicalName for existing models:
-- Strip provider prefix (e.g. "openrouter/anthropic/claude-sonnet-4" -> "anthropic/claude-sonnet-4")
-- For single-segment names (e.g. "gpt-4o"), canonicalName = name
UPDATE "models" SET "canonicalName" = CASE
  WHEN "name" LIKE 'openrouter/%' THEN SUBSTRING("name" FROM 12)
  ELSE "name"
END;

-- Mark variants: models whose canonicalName appears more than once
UPDATE "models" SET "isVariant" = true
WHERE "canonicalName" IN (
  SELECT "canonicalName" FROM "models" GROUP BY "canonicalName" HAVING COUNT(*) > 1
)
AND "name" != "canonicalName";

-- Create index on enabled
CREATE INDEX "models_enabled_idx" ON "models"("enabled");

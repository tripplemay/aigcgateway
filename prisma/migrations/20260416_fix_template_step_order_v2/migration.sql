-- ROLLBACK: revert commit; manual SQL recovery required (composite migration: ALTER TABLE DROP CONSTRAINT for new constraints; data ops require restore from backup)
-- F-AF2-08 v2: Normalize template step order to 1-based.
-- Replaces the failed 20260416_fix_template_step_order_base migration.
-- Handles the partially-applied state: constraint may already be dropped,
-- some rows may already be shifted.
--
-- Strategy: idempotent two-pass update to avoid unique constraint violations.

-- Step 1: Ensure constraint/index is dropped (may already be from failed v1)
DROP INDEX IF EXISTS "template_steps_templateId_order_key";
ALTER TABLE "template_steps" DROP CONSTRAINT IF EXISTS "template_steps_templateId_order_key";

-- Step 2: Only process templates that STILL have order=0
-- (skip any that were already fixed by the partial v1 run)
-- Pass 1: shift to high offset to clear collision space
UPDATE "template_steps"
SET "order" = "order" + 10000
WHERE "templateId" IN (
  SELECT DISTINCT "templateId" FROM "template_steps" WHERE "order" = 0
);

-- Pass 2: shift back to target values (original + 1)
UPDATE "template_steps"
SET "order" = "order" - 9999
WHERE "order" >= 10000;

-- Step 3: Re-create the unique constraint
ALTER TABLE "template_steps" ADD CONSTRAINT "template_steps_templateId_order_key" UNIQUE ("templateId", "order");

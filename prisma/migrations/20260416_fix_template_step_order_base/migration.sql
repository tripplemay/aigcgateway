-- F-AF2-08: Normalize template step order to 1-based.
-- Some public templates have steps starting from order=0 while user templates
-- start from order=1. This migration shifts all 0-based steps to 1-based.

-- Temporarily drop the unique constraint to allow the shift
ALTER TABLE "template_steps" DROP CONSTRAINT IF EXISTS "template_steps_templateId_order_key";

-- Shift orders up by 1 for all templates that have a step with order=0
UPDATE "template_steps"
SET "order" = "order" + 1
WHERE "templateId" IN (
  SELECT DISTINCT "templateId" FROM "template_steps" WHERE "order" = 0
);

-- Re-create the unique constraint
ALTER TABLE "template_steps" ADD CONSTRAINT "template_steps_templateId_order_key" UNIQUE ("templateId", "order");

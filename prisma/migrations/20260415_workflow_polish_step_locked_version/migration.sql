-- ROLLBACK: ALTER TABLE ... DROP COLUMN for columns added in this migration
-- WORKFLOW-POLISH F-WP-03 — lock a TemplateStep to a specific ActionVersion.

ALTER TABLE "template_steps" ADD COLUMN "lockedVersionId" TEXT;

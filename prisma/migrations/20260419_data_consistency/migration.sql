-- ROLLBACK: revert commit; manual SQL recovery required (composite migration: ALTER TABLE DROP COLUMN for new columns; DROP INDEX for new indexes; ALTER TABLE DROP CONSTRAINT for new constraints)
-- BL-DATA-CONSISTENCY
-- H-1: TemplateStep.actionId index
-- H-2: AliasModelLink.aliasId + .modelId single-column indexes
-- H-17: EmailVerificationToken.userId FK onDelete=Cascade
-- H-20: Notification.expiresAt column + index

-- ── H-1 ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "template_steps_actionId_idx" ON "template_steps" ("actionId");

-- ── H-2 ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "alias_model_links_aliasId_idx" ON "alias_model_links" ("aliasId");
CREATE INDEX IF NOT EXISTS "alias_model_links_modelId_idx" ON "alias_model_links" ("modelId");

-- ── H-17: email_verification_tokens.userId FK → ON DELETE CASCADE ──
ALTER TABLE "email_verification_tokens"
  DROP CONSTRAINT IF EXISTS "email_verification_tokens_userId_fkey";
ALTER TABLE "email_verification_tokens"
  ADD CONSTRAINT "email_verification_tokens_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── H-20: notifications.expiresAt + index ────────────────────
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "notifications_expiresAt_idx" ON "notifications" ("expiresAt");

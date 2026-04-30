-- ROLLBACK: ALTER TABLE ... DROP COLUMN for columns added in this migration
-- RATE-LIMIT F-RL-04 — User.rateLimit JSON for per-user spending overrides.

ALTER TABLE "users" ADD COLUMN "rateLimit" JSONB;

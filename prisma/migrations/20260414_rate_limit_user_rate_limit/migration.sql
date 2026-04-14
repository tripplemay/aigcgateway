-- RATE-LIMIT F-RL-04 — User.rateLimit JSON for per-user spending overrides.

ALTER TABLE "users" ADD COLUMN "rateLimit" JSONB;

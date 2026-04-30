-- ROLLBACK: ALTER TABLE ... DROP COLUMN for columns added in this migration
-- User: add suspended + deletedAt for account management
ALTER TABLE "users" ADD COLUMN "suspended" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "deletedAt" TIMESTAMP(3);

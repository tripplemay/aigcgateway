-- ROLLBACK: DROP INDEX for indexes created in this migration
-- Performance indexes for admin queries
-- User: filtered + sorted listing by role and createdAt
CREATE INDEX IF NOT EXISTS "users_role_createdAt_idx" ON "users" ("role", "createdAt" DESC);

-- Model: sorting by name in channel listings
CREATE INDEX IF NOT EXISTS "models_name_idx" ON "models" ("name");

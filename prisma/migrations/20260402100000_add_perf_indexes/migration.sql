-- Performance indexes for admin queries
-- User: filtered + sorted listing by role and createdAt
CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_role_createdAt_idx" ON "users" ("role", "createdAt" DESC);

-- Model: sorting by name in channel listings
CREATE INDEX CONCURRENTLY IF NOT EXISTS "models_name_idx" ON "models" ("name");

-- ROLLBACK: revert commit; manual SQL recovery required (composite migration: DROP TABLE for new tables; ALTER TABLE DROP COLUMN for new columns; DROP INDEX for new indexes; ALTER TABLE DROP CONSTRAINT for new constraints; data ops require restore from backup)
-- TEMPLATE-LIBRARY-UPGRADE F-TL-01
-- Template: add category + ratingCount + ratingSum
ALTER TABLE "templates" ADD COLUMN "category" TEXT;
ALTER TABLE "templates" ADD COLUMN "ratingCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "templates" ADD COLUMN "ratingSum" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "templates_category_idx" ON "templates"("category");

-- Backfill existing public templates with default category
UPDATE "templates" SET "category" = 'dev-review' WHERE "isPublic" = true AND "category" IS NULL;

-- New table: template_ratings
CREATE TABLE "template_ratings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_ratings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "template_ratings_userId_templateId_key" ON "template_ratings"("userId", "templateId");
CREATE INDEX "template_ratings_templateId_idx" ON "template_ratings"("templateId");

ALTER TABLE "template_ratings" ADD CONSTRAINT "template_ratings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "template_ratings" ADD CONSTRAINT "template_ratings_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

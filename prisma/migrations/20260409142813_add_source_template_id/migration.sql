-- ROLLBACK: revert commit; manual SQL recovery required (composite migration: ALTER TABLE DROP COLUMN for new columns; DROP INDEX for new indexes; ALTER TABLE DROP CONSTRAINT for new constraints; ALTER COLUMN must be reversed manually)
-- AlterTable
ALTER TABLE "actions" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "api_keys" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "templates" ADD COLUMN     "sourceTemplateId" TEXT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "templates_sourceTemplateId_idx" ON "templates"("sourceTemplateId");

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_sourceTemplateId_fkey" FOREIGN KEY ("sourceTemplateId") REFERENCES "templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

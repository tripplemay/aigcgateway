-- ROLLBACK: revert commit; manual SQL recovery required (composite migration: DROP TABLE for new tables; ALTER TABLE DROP COLUMN for new columns; DROP INDEX for new indexes; ALTER TABLE DROP CONSTRAINT for new constraints)
-- CreateTable: templates
CREATE TABLE "templates" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "activeVersionId" TEXT,
    "forkedFromId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable: template_versions
CREATE TABLE "template_versions" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "messages" JSONB NOT NULL,
    "variables" JSONB NOT NULL,
    "changelog" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_versions_pkey" PRIMARY KEY ("id")
);

-- AlterTable: call_logs add template_version_id
ALTER TABLE "call_logs" ADD COLUMN "template_version_id" TEXT;

-- CreateIndex
CREATE INDEX "templates_projectId_idx" ON "templates"("projectId");
CREATE INDEX "templates_forkedFromId_idx" ON "templates"("forkedFromId");

CREATE UNIQUE INDEX "template_versions_templateId_versionNumber_key" ON "template_versions"("templateId", "versionNumber");
CREATE INDEX "template_versions_templateId_idx" ON "template_versions"("templateId");

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

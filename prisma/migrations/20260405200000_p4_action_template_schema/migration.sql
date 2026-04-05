-- P4: Action + Template 统一重构 Schema
-- 破坏性变更：生产数据为测试数据，允许删除旧表

-- 1. 新增 StepRole 枚举
CREATE TYPE "StepRole" AS ENUM ('SEQUENTIAL', 'SPLITTER', 'BRANCH', 'MERGE');

-- 2. 删除旧表（先删依赖表）
DROP TABLE IF EXISTS "template_versions" CASCADE;
DROP TABLE IF EXISTS "templates" CASCADE;

-- 3. 新建 actions 表
CREATE TABLE "actions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "model" TEXT NOT NULL,
    "activeVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "actions_pkey" PRIMARY KEY ("id")
);

-- 4. 新建 action_versions 表
CREATE TABLE "action_versions" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "messages" JSONB NOT NULL,
    "variables" JSONB NOT NULL,
    "changelog" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_versions_pkey" PRIMARY KEY ("id")
);

-- 5. 新建 templates 表（重建，新 schema）
CREATE TABLE "templates" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- 6. 新建 template_steps 表
CREATE TABLE "template_steps" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "role" "StepRole" NOT NULL DEFAULT 'SEQUENTIAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_steps_pkey" PRIMARY KEY ("id")
);

-- 7. CallLog 字段更新：删除旧字段，新增新字段
ALTER TABLE "call_logs" DROP COLUMN IF EXISTS "templateId";
ALTER TABLE "call_logs" DROP COLUMN IF EXISTS "template_version_id";
ALTER TABLE "call_logs" DROP COLUMN IF EXISTS "templateVariables";

ALTER TABLE "call_logs" ADD COLUMN "actionId" TEXT;
ALTER TABLE "call_logs" ADD COLUMN "actionVersionId" TEXT;
ALTER TABLE "call_logs" ADD COLUMN "templateRunId" TEXT;

-- 8. 索引
CREATE INDEX "actions_projectId_idx" ON "actions"("projectId");
CREATE INDEX "action_versions_actionId_idx" ON "action_versions"("actionId");
CREATE INDEX "templates_projectId_idx" ON "templates"("projectId");
CREATE INDEX "template_steps_templateId_idx" ON "template_steps"("templateId");

-- 9. 唯一约束
CREATE UNIQUE INDEX "action_versions_actionId_versionNumber_key" ON "action_versions"("actionId", "versionNumber");
CREATE UNIQUE INDEX "template_steps_templateId_order_key" ON "template_steps"("templateId", "order");

-- 10. 外键
ALTER TABLE "actions" ADD CONSTRAINT "actions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "action_versions" ADD CONSTRAINT "action_versions_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "templates" ADD CONSTRAINT "templates_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "template_steps" ADD CONSTRAINT "template_steps_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "template_steps" ADD CONSTRAINT "template_steps_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

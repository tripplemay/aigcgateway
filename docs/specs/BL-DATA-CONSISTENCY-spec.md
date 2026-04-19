# BL-DATA-CONSISTENCY Spec

**批次：** BL-DATA-CONSISTENCY（P1-data 第 1 批）
**负责人：** Planner = Kimi / Generator = 默认映射 / Evaluator = Reviewer
**创建：** 2026-04-19
**工时：** 1 day
**源：** `docs/code-review/batch-05-database.md` H-1/2/17/18/20 + `daily/2026-04-17.md` H-1

## 背景

Code Review 批次 5（数据层）发现 6 个数据一致性问题。所有 file:line 均已核实。

### H-1 — `TemplateStep.actionId` 外键无索引（`[已核实]`）

`prisma/schema.prisma:608-625` model TemplateStep：
- ✅ 有 `@@index([templateId])`
- ❌ **缺 `@@index([actionId])`**

删除/关联查询 action 的 templateSteps 时全表扫描。

### H-2 — `AliasModelLink` 两外键无单列索引（`[已核实]`）

`prisma/schema.prisma:303-313` model AliasModelLink：
- 有 `@@unique([aliasId, modelId])` 复合 unique
- ❌ **缺 `@@index([aliasId])` 和 `@@index([modelId])` 单列索引**

路由反查（给定 aliasId 找所有 model，或给定 modelId 反查 alias）走复合 index 不够高效。

### H-17 — `EmailVerificationToken.userId` FK 无 onDelete（`[已核实]`）

`prisma/schema.prisma:138-151` model EmailVerificationToken：
```prisma
user User @relation(fields: [userId], references: [id])
// ❌ 缺 onDelete
```

硬删除用户时阻止（默认 Restrict）。现有业务层需先清 token 才能删 user，风险分散。

### H-18 — migration WHERE order >= 10000 粗粒度修复（`[已核实 pre-existing]`）

`prisma/migrations/20260416_fix_template_step_order_v2/migration.sql` 含 `WHERE "order" >= 10000`。问题：
- 二次运行或未来其他 migration 使用相同阈值会覆盖
- 无具体 templateId 列表，风险面大

本批次做两件事：**(1) 不改已上线的 20260416 migration**（Planner 铁律：不原位改已上线 migration）；**(2) 新建 migration 精确修正**（如有残留数据）或标注为 **已完成，保留作为历史** + schema.prisma 注释。

### H-20 — `notifications` 表无 TTL（`[已核实]`）

`prisma/schema.prisma:698-717` model Notification：3 个索引齐全，但 **无 `expiresAt` 字段**，高频事件（balance alert / rate limit 告警）无限堆积。

### daily H-1 — `listPublicTemplates` 全表加载内存排序（`[待 Generator 核实行号]`）

`src/lib/public-templates.ts:69-87`（daily 报告提及）：`findMany` 无 skip/take → 全量 `sortTemplates(mapped)` → `arr.slice(start, start+pageSize)`。当前数量 12 条尚可，>500 条后线性劣化。

## 目标

1. 补齐 3 个缺失索引，删除/关联查询不全表扫描
2. EmailVerificationToken 加 onDelete=Cascade，允许用户硬删级联清理
3. notifications 加 `expiresAt` 字段 + 后台 cron 清理（或使用 pg_cron / Prisma scheduled task）
4. listPublicTemplates 改 DB 级 orderBy + skip/take 分页

## 改动范围

### F-DC-01：schema.prisma 索引 + onDelete + expiresAt（+ migration）

**文件：** `prisma/schema.prisma` + 新建 `prisma/migrations/20260419_data_consistency/migration.sql`

**schema 改动：**

```prisma
// TemplateStep (line 608-625)
model TemplateStep {
  // ... existing fields
  @@unique([templateId, order])
  @@index([templateId])
  @@index([actionId])         // 新增
  @@map("template_steps")
}

// AliasModelLink (line 303-313)
model AliasModelLink {
  // ... existing fields
  @@unique([aliasId, modelId])
  @@index([aliasId])           // 新增
  @@index([modelId])           // 新增
  @@map("alias_model_links")
}

// EmailVerificationToken (line 138-151)
model EmailVerificationToken {
  // ...
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)  // 新增 onDelete
  // ... existing indexes
}

// Notification (line 698-717)
model Notification {
  // ... existing fields
  expiresAt DateTime?     // 新增：null = 永不过期，默认 null 兼容存量
  // ...
  @@index([expiresAt])    // 新增：支持 cron 清理查询
}
```

**migration SQL：**

```sql
CREATE INDEX "template_steps_actionId_idx" ON "template_steps" ("actionId");
CREATE INDEX "alias_model_links_aliasId_idx" ON "alias_model_links" ("aliasId");
CREATE INDEX "alias_model_links_modelId_idx" ON "alias_model_links" ("modelId");

-- EmailVerificationToken onDelete=Cascade（DROP + ADD FK with ON DELETE CASCADE）
ALTER TABLE "email_verification_tokens" DROP CONSTRAINT IF EXISTS "email_verification_tokens_userId_fkey";
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- notifications 加 expiresAt + index
ALTER TABLE "notifications" ADD COLUMN "expiresAt" TIMESTAMP(3);
CREATE INDEX "notifications_expiresAt_idx" ON "notifications" ("expiresAt");
```

### F-DC-02：listPublicTemplates DB 级分页

**文件：** `src/lib/public-templates.ts:69-87`（Generator 开工前核实具体行号）

**改动：**

- 当前 `findMany + sortTemplates(mapped) + slice` → DB 级 `orderBy + skip + take`
- sort_by 维度映射：
  - `latest` → `orderBy: { updatedAt: 'desc' }`
  - `popular` → 计算字段较复杂，保留内存排序但先 `findMany where + take 200` 限制 + mem sort + slice（上限兜底）
  - `top_rated` → `orderBy: [{ ratingSum: 'desc' }, { ratingCount: 'desc' }]`
  - `recommended` → 复合公式，保留内存排序并标注"建议未来加 recommendedScore 预计算字段"
- 先做 skip/take：`offset = (page - 1) * pageSize`；pageSize 默认 20，max 100（现有约束）

**单测：** `src/lib/__tests__/public-templates.test.ts` 新增（或扩展现有）：
- sort_by='latest' 按 updatedAt desc 返回
- pageSize=2, page=2 返回第 3-4 条
- category 过滤正确
- `[latest, popular, top_rated, recommended]` 四种 sort 不报错

### F-DC-03：notifications 过期清理策略（cron 或 helper）

**文件：** 新建 `src/lib/notifications/cleanup.ts` + 某处定时调度

**改动：**

1. 新增 `cleanupExpiredNotifications()`：`DELETE FROM notifications WHERE expiresAt < NOW()` 或 Prisma `prisma.notification.deleteMany({ where: { expiresAt: { lt: new Date() } } })`
2. **调度：** 复用 `src/lib/health/scheduler.ts` 已有的 leader-lock 机制（BL-SEC-INFRA-GUARD 的产物），每日执行一次（24h interval，non-transient 任务）
3. 现有 `src/lib/notifications/triggers.ts` 或 `dispatcher.ts` 创建 notification 时按类型注入默认 expiresAt：
   - balance 告警：30 天
   - rate limit 告警：7 天
   - 其他：null（永不过期，读取后由用户 readAt 标记）
4. 存量 notifications 保持 expiresAt=null（不主动清理历史数据）

**单测：** 补 cleanup + triggers 默认 expiresAt 注入的单元测试。

### F-DC-04：全量验收（Evaluator）

**migration 验证（5 项）：**

1. `npx prisma migrate dev` 本地跑通（通过）
2. `\d template_steps` 显示 `template_steps_actionId_idx`
3. `\d alias_model_links` 显示 `alias_model_links_aliasId_idx` + `alias_model_links_modelId_idx`
4. `\d email_verification_tokens` 显示 FK `ON DELETE CASCADE`
5. `\d notifications` 显示 `expiresAt` column + `notifications_expiresAt_idx`

**功能验证（4 项）：**

6. 手动 `DELETE FROM users WHERE id='<test>';` → EmailVerificationToken 级联删除（新 onDelete 生效）
7. `SELECT * FROM notifications WHERE "expiresAt" IS NULL` 存量 ≥ 1 条（old records 保留）
8. 新创建 balance alert notification 有 expiresAt ≠ NULL
9. listPublicTemplates?sort_by=latest&page=1&pageSize=5 → SQL EXPLAIN 有 `LIMIT 5`（DB 级分页生效）

**构建（3 项）：**

10. `npm run build` 通过
11. `npx tsc --noEmit` 通过
12. `npx vitest run` 全过

**冒烟回归（2 项）：**

13. 登录 + 访问 /notifications 正常显示
14. MCP `list_public_templates` 正常返回分页结果

**生产数据预检（Codex 生产只读 SSH）：**

15. SELECT COUNT(*) FROM template_steps；新索引在 migration 前不影响行数
16. SELECT COUNT(*) FROM notifications 确认存量，migration 后 expiresAt 全 null

17. 生成 signoff 报告 `docs/test-reports/BL-DATA-CONSISTENCY-signoff-2026-04-19.md`。

## 非目标

- 不做 call_logs 月度分区（留 BL-INFRA-ARCHIVE）
- 不做 system_logs / health_checks TTL（BL-INFRA-ARCHIVE）
- 不做 recommendedScore 预计算字段（留未来批次）
- 不做 Notification 主动迁移 expiresAt（只新数据有，存量保 null 接受）
- 不改 20260416_fix_template_step_order_v2 migration（铁律：不原位改已上线 migration）

## Risks

| 风险 | 缓解 |
|---|---|
| 补索引导致 ALTER 锁表 | Postgres CREATE INDEX CONCURRENTLY 可避免锁表；但 Prisma migrate 默认不带 CONCURRENTLY → 生产跑 migration 有短暂锁。表体积小（< 1000 行级）可接受；若大表需手动改 SQL 加 CONCURRENTLY |
| onDelete=Cascade 导致意外级联 | EmailVerificationToken 本来就是 user 派生，级联正确；不影响其他表 |
| expiresAt 字段加 null 兼容存量 | 默认 null = 不过期，存量数据不受影响；新创建按业务类型注入 |
| listPublicTemplates 改动破坏 sort_by=popular/recommended 复杂排序 | popular/recommended 保留内存 sort + 200 行上限兜底；future work 做 recommendedScore 预计算 |

## 部署

- 1 个 migration（`20260419_data_consistency`）+ 1 处 backend 改动（public-templates.ts）+ 1 个新模块（notifications/cleanup.ts）
- 部署：`git pull + npm ci + npm run build + npx prisma migrate deploy + pm2 restart`
- 回滚：revert commit + `ALTER TABLE ... DROP CONSTRAINT / DROP INDEX / DROP COLUMN`

## 验收标准

- [ ] F-DC-04 的 17 项全 PASS
- [ ] migration 本地 + 生产预检通过
- [ ] build + tsc + vitest 全过
- [ ] signoff 报告归档

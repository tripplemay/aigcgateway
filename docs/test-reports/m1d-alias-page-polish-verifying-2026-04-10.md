# M1d 验收报告（verifying）

## 测试目标
验证 M1d 批次（别名管理页优化 + 售价上提 + capabilities 推断）是否满足 F-M1d-01~06 验收标准。

## 测试环境
- L1 本地：`http://localhost:3099`
- 启动方式：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`

## 执行结果
- 结论：FAIL（阻塞）
- 阻塞点：测试环境无法启动，数据库迁移失败，导致 F-M1d-06 无法执行动态验收。

## 失败项
### F-M1d-06 — 环境阻塞（Migration 失败）
- 严重级别：High
- 稳定复现：是

复现步骤：
1. 执行 `bash scripts/test/codex-setup.sh`
2. 观察步骤 `[3/5] Prisma generate + migrate deploy + seed`
3. 迁移 `20260409234127_add_sell_price_to_model_alias` 失败

错误证据：
- 报错：`ERROR: column "updatedAt" of relation "model_aliases" does not exist`（Postgres 42703）
- 迁移文件：`prisma/migrations/20260409234127_add_sell_price_to_model_alias/migration.sql`
  - SQL: `ALTER TABLE "model_aliases" ... ALTER COLUMN "updatedAt" DROP DEFAULT;`
- 对照：`updatedAt` 列是在后续迁移 `prisma/migrations/20260410000000_upgrade_model_alias_schema/migration.sql` 才新增。

## 风险
- 验收无法进行，M1d 无法签收。
- 新环境/CI 按当前迁移顺序部署会失败。

## 结论
本轮 `verifying` 不通过，状态应流转至 `fixing`。修复迁移顺序或迁移 SQL 后，再进入 `reverifying`。

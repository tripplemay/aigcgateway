# K1 复验报告（reverifying）

## 测试目标
- 复验 K1 批次 `F-K1-08`，确认 API Key 用户级迁移后的本地 L1 环境可启动，并继续执行 chat/actions、用户级充值、MCP 与 keys 管理相关验收。

## 测试环境
- L1 本地：`http://localhost:3099`
- 启动方式：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- 计划执行脚本：`npx tsx scripts/test/k1-apikey-user-level-verifying-e2e-2026-04-10.ts`
- 执行日期：2026-04-10

## 执行结果
- 结论：FAIL（阻塞）
- 阻塞阶段：环境初始化 `[3/5] Prisma generate + migrate deploy + seed`
- 影响：服务未能启动，`/v1/models` smoke 未就绪，K1 业务复验未进入执行阶段

## 失败项
### F-K1-08 — 本地测试环境阻塞（Migration 失败）
- 严重级别：High
- 稳定复现：是

复现步骤：
1. 执行 `bash scripts/test/codex-setup.sh`
2. 观察步骤 `[3/5] Prisma generate + migrate deploy + seed`
3. Prisma 在迁移 `20260410043537_transaction_projectid_optional` 失败，服务未启动

错误证据：
- 报错：`ERROR: constraint "api_keys_userId_fkey" of relation "api_keys" does not exist`（Postgres 42704 / Prisma P3018）
- 迁移文件：[migration.sql](/Users/yixingzhou/project/aigcgateway/prisma/migrations/20260410043537_transaction_projectid_optional/migration.sql)
- 失败 SQL：`ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_userId_fkey";`
- 现象：`bash scripts/test/codex-wait.sh` 持续等待 `http://localhost:3099/v1/models`，因为应用未能启动

## 风险项
- 新环境或 CI 在全量迁移时会被同一问题阻断，不只是本地 Codex 验收失败。
- 因环境未起来，本轮无法确认上一轮失败项是否已修复：
- `POST /api/admin/users/:id/recharge` 是否仍触发 `transactions_projectId_fkey` 错误
- `chat/actions` 主链路是否仍返回 503

## 最终结论
本轮 `reverifying` 不通过，状态应回退到 `fixing`。需要先修复迁移脚本的约束删除逻辑，确保 `codex-setup.sh` 能完成建库、迁移、seed 和启动，之后才能继续 K1 业务复验。

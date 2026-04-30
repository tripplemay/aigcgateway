# CI1-test-infrastructure Reverifying Round 2 Report 2026-04-10

## 结论

- 总体结论：**FAIL（回退 fixing）**
- 通过项：F-CI1-03、F-CI1-04
- 失败项：F-CI1-01、F-CI1-02

## 环境

- 本地 L1：`http://localhost:3099`
- 启动方式：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- 阶段：`reverifying`（fix round 2）

## 执行结果

1. `npx vitest run`
   - PASS：`11/11`（鉴权模块）

2. `npx tsx scripts/test/_archive_2026Q1Q2/mcp-dx-round2-e2e-2026-04-06.ts`
   - FAIL：`createTestApiKey: failed (404)`
   - 报错点：`tests/factories/index.ts:171`

3. `npx tsx scripts/test/_archive_2026Q1Q2/mcp-finops-hardening-e2e-2026-04-07.ts`
   - FAIL：`createTestApiKey: failed (404)`
   - 报错点：`tests/factories/index.ts:171`

4. `npx tsx scripts/test/_archive_2026Q1Q2/security-billing-polish-e2e-2026-04-07.ts`
   - FAIL：`createTestApiKey: failed (404)`
   - 报错点：`tests/factories/index.ts:171`

## 根因判断

- round 1 的 Prisma 复合键问题已修复（本轮未再出现）。
- 新阻塞点是测试工厂 `createTestApiKey` 访问路径返回 404：
  - 当前工厂调用：`POST /api/projects/${projectId}/keys`（`tests/factories/index.ts:169`）
  - 实际执行返回 Next.js 404 页面，导致三条 E2E 脚本在创建 key 阶段统一失败。

## 影响

- “3 个改造脚本改造后仍通过”仍不成立，CI1 无法签收。
- 需 Generator 修复工厂 API 路径（或配套路由）后再次复验。

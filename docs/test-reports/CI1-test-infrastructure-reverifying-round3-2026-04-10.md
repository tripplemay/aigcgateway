# CI1-test-infrastructure Reverifying Round 3 Report 2026-04-10

## 结论

- 总体结论：**FAIL（回退 fixing）**
- 通过项：F-CI1-03、F-CI1-04
- 失败项：F-CI1-01、F-CI1-02

## 环境

- 本地 L1：`http://localhost:3099`
- 启动方式：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- 阶段：`reverifying`（fix round 3）

## 执行结果

1. `npx vitest run`
   - PASS：`11/11`（鉴权模块）

2. `npx tsx scripts/test/mcp-dx-round2-e2e-2026-04-06.ts`
   - FAIL：`PrismaClientValidationError`
   - 关键信息：`Unknown argument balance`
   - 报错点：`scripts/test/mcp-dx-round2-e2e-2026-04-06.ts:126`

3. `npx tsx scripts/test/mcp-finops-hardening-e2e-2026-04-07.ts`
   - FAIL：`PrismaClientValidationError`
   - 关键信息：`Unknown argument balance`
   - 报错点：`scripts/test/mcp-finops-hardening-e2e-2026-04-07.ts:154`

4. `npx tsx scripts/test/security-billing-polish-e2e-2026-04-07.ts`
   - FAIL：`PrismaClientValidationError`
   - 关键信息：`Unknown argument balance`
   - 报错点：`scripts/test/security-billing-polish-e2e-2026-04-07.ts:164`

## 根因判断

- round 2 的 `createTestApiKey` 404 已修复（本轮未再出现）。
- 新阻塞点是脚本仍在直接更新 `Project.balance`，但当前 schema 中 `Project` 已无该字段（余额已迁移到用户级）。
- 三个脚本在同一类旧字段写入处统一失败。

## 影响

- “3 个改造脚本改造后仍通过”仍不成立，CI1 不能签收。
- 需 Generator 将脚本中的余额准备逻辑改为当前用户级余额模型后再复验。

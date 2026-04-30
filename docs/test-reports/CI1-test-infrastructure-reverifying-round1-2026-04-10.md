# CI1-test-infrastructure Reverifying Round 1 Report 2026-04-10

## 结论

- 总体结论：**FAIL（回退 fixing）**
- 通过项：F-CI1-03、F-CI1-04
- 失败项：F-CI1-01、F-CI1-02

## 环境

- 本地 L1：`http://localhost:3099`
- 启动方式：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- 阶段：`reverifying`（fix round 1）

## 执行结果

1. `npx vitest run`
   - PASS：`11/11` 用例通过（鉴权模块）

2. `npx tsx scripts/test/_archive_2026Q1Q2/mcp-dx-round2-e2e-2026-04-06.ts`
   - FAIL：`PrismaClientValidationError`
   - 关键信息：`Unknown argument providerId_modelId_realModelId`
   - 报错点：`scripts/test/_archive_2026Q1Q2/mcp-dx-round2-e2e-2026-04-06.ts:197`

3. `npx tsx scripts/test/_archive_2026Q1Q2/mcp-finops-hardening-e2e-2026-04-07.ts`
   - FAIL：`PrismaClientValidationError`
   - 关键信息：`Unknown argument providerId_modelId_realModelId`
   - 报错点：`scripts/test/_archive_2026Q1Q2/mcp-finops-hardening-e2e-2026-04-07.ts:226`

4. `npx tsx scripts/test/_archive_2026Q1Q2/security-billing-polish-e2e-2026-04-07.ts`
   - FAIL：`PrismaClientValidationError`
   - 关键信息：`Unknown argument providerId_modelId_realModelId`
   - 报错点：`scripts/test/_archive_2026Q1Q2/security-billing-polish-e2e-2026-04-07.ts:216`

## 根因判断

- `MOCK_BASE` 未定义问题已修复（本轮未再出现该错误）。
- 新的阻塞点是 3 个脚本都使用了不存在的 Prisma 复合唯一键名 `providerId_modelId_realModelId`。
- 从 Prisma 错误提示可见当前可用键为 `providerId_modelId`，因此 `upsert.where` 与当前 schema/客户端不一致。

## 影响

- 无法证明“改造后 3 个脚本仍通过”，F-CI1-01/F-CI1-02 继续不满足验收标准。
- CI1 仍不能签收，需 Generator 修正脚本后再次进入 `reverifying`。

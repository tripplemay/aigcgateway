# CI1-test-infrastructure Reverifying Round 6 Report 2026-04-11

## 结论

- 总体结论：**FAIL（回退 fixing）**
- 通过项：F-CI1-03、F-CI1-04
- 失败项：F-CI1-01、F-CI1-02

## 环境

- 本地 L1：`http://localhost:3099`
- 启动方式：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- 阶段：`reverifying`（fix round 6）

## 执行结果

1. `npx vitest run`
   - PASS：`11/11`（鉴权模块）

2. `npx tsx scripts/test/_archive_2026Q1Q2/mcp-dx-round2-e2e-2026-04-06.ts`
   - FAIL：`PrismaClientKnownRequestError (P2025)`
   - 报错点：`scripts/test/_archive_2026Q1Q2/mcp-dx-round2-e2e-2026-04-06.ts:125`
   - 错误：`prisma.user.update` 未找到记录

3. `npx tsx scripts/test/_archive_2026Q1Q2/mcp-finops-hardening-e2e-2026-04-07.ts`
   - FAIL：`PrismaClientKnownRequestError (P2025)`
   - 报错点：`scripts/test/_archive_2026Q1Q2/mcp-finops-hardening-e2e-2026-04-07.ts:150`
   - 错误：`prisma.user.update` 未找到记录

4. `npx tsx scripts/test/_archive_2026Q1Q2/security-billing-polish-e2e-2026-04-07.ts`
   - FAIL：`PrismaClientKnownRequestError (P2025)`
   - 报错点：`scripts/test/_archive_2026Q1Q2/security-billing-polish-e2e-2026-04-07.ts:160`
   - 错误：`prisma.user.update` 未找到记录

## 根因判断

- round 6 的“用 userId 替代 email”方向正确，但当前脚本拿到的 `userId` 与 Prisma update 使用处仍存在不一致，导致统一命中 `P2025`。
- 3 个脚本都在同一类步骤（创建项目后回填用户余额/defaultProjectId）中断，尚未进入主体断言。

## 影响

- F-CI1-01/F-CI1-02 仍未满足“改造后脚本通过”。
- CI1 不能签收，需继续 fixing 后再复验。

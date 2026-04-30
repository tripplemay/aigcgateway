# CI1-test-infrastructure Reverifying Round 5 Report 2026-04-11

## 结论

- 总体结论：**FAIL（回退 fixing）**
- 通过项：F-CI1-03、F-CI1-04
- 失败项：F-CI1-01、F-CI1-02

## 环境

- 本地 L1：`http://localhost:3099`
- 启动方式：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- 阶段：`reverifying`（fix round 5）

## 执行结果

1. `npx vitest run`
   - PASS：`11/11`（鉴权模块）

2. `npx tsx scripts/test/_archive_2026Q1Q2/mcp-dx-round2-e2e-2026-04-06.ts`
   - FAIL：脚本结果 `passed=2, failed=9`
   - 主要失败：`no_project`、`insufficient_balance`、空模型列表断言失败

3. `npx tsx scripts/test/_archive_2026Q1Q2/mcp-finops-hardening-e2e-2026-04-07.ts`
   - FAIL：脚本结果 `pass=3, fail=6`
   - 主要失败：`no_project`、`insufficient_balance`

4. `npx tsx scripts/test/_archive_2026Q1Q2/security-billing-polish-e2e-2026-04-07.ts`
   - FAIL：脚本结果 `pass=3, fail=2`
   - 关键失败：
     - `F-SB-03` 被余额不足拦截（未命中预期空内容错误分支）
     - `F-SB-02` 在 `prisma.user.findFirstOrThrow` 未找到记录（脚本中的用户定位条件不成立）

## 根因判断

- round 5 已修复部分适配问题（路径/字段迁移继续推进），但脚本仍未与当前默认项目和余额初始化流程完全对齐。
- 三个脚本仍无法达到“改造后通过”的验收标准。

## 影响

- F-CI1-01/F-CI1-02 继续不满足 acceptance。
- CI1 不能签收，需继续 fixing 后再复验。

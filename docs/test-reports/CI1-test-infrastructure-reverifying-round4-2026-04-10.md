# CI1-test-infrastructure Reverifying Round 4 Report 2026-04-10

## 结论

- 总体结论：**FAIL（回退 fixing）**
- 通过项：F-CI1-03、F-CI1-04
- 失败项：F-CI1-01、F-CI1-02

## 环境

- 本地 L1：`http://localhost:3099`
- 启动方式：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- 阶段：`reverifying`（fix round 4）

## 执行结果

1. `npx vitest run`
   - PASS：`11/11`（鉴权模块）

2. `npx tsx scripts/test/mcp-dx-round2-e2e-2026-04-06.ts`
   - FAIL：脚本结果 `passed=2, failed=9`
   - 主要失败：`[no_project] No default project configured.`、`Insufficient balance`

3. `npx tsx scripts/test/mcp-finops-hardening-e2e-2026-04-07.ts`
   - FAIL：脚本结果 `pass=3, fail=6`
   - 主要失败：`[no_project] No default project configured.`、`Insufficient balance`

4. `npx tsx scripts/test/security-billing-polish-e2e-2026-04-07.ts`
   - FAIL：脚本结果 `pass=3, fail=2`
   - 关键错误：`Project` 查询/写入仍含 `balance` 字段（`Unknown field/argument balance`）

## 根因判断

- round 4 修复后，key 创建路径与部分余额逻辑已前进，但脚本整体仍未与当前用户级余额 + 默认项目语义完全对齐。
- 三个脚本均未达到“改造后仍通过”的验收要求。

## 影响

- F-CI1-01/F-CI1-02 继续不满足验收标准。
- CI1 仍不能签收，需继续 fixing 后再复验。

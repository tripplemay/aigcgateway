# CI1-test-infrastructure Verifying Report 2026-04-10

## 结论

- 总体结论：**FAIL（进入 fixing）**
- 通过项：F-CI1-03、F-CI1-04
- 失败项：F-CI1-01、F-CI1-02（脚本运行失败，无法满足“改造后仍通过”）

## 环境

- 本地 L1：`http://localhost:3099`
- 启动方式：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- 分支：`main`（2026-04-10）

## 执行记录

1. `npx vitest run`
   - 结果：PASS
   - 数据：`1` file, `11` tests 全通过（鉴权模块 `authenticateApiKey`）

2. `npx tsx scripts/test/mcp-dx-round2-e2e-2026-04-06.ts`
   - 结果：FAIL
   - 错误：`ReferenceError: MOCK_BASE is not defined`
   - 位置：`scripts/test/mcp-dx-round2-e2e-2026-04-06.ts:189`

3. `npx tsx scripts/test/mcp-finops-hardening-e2e-2026-04-07.ts`
   - 结果：FAIL
   - 错误：`ReferenceError: MOCK_BASE is not defined`
   - 位置：`scripts/test/mcp-finops-hardening-e2e-2026-04-07.ts:218`

4. `npx tsx scripts/test/security-billing-polish-e2e-2026-04-07.ts`
   - 结果：FAIL
   - 错误：`ReferenceError: MOCK_BASE is not defined`
   - 位置：`scripts/test/security-billing-polish-e2e-2026-04-07.ts:207`

## 代码证据

- 三个脚本均存在 `data: { baseUrl: MOCK_BASE, ... }` 的调用，但文件顶部未定义 `MOCK_BASE` 常量。
- 可见行：
  - `scripts/test/mcp-dx-round2-e2e-2026-04-06.ts:189`
  - `scripts/test/mcp-finops-hardening-e2e-2026-04-07.ts:218`
  - `scripts/test/security-billing-polish-e2e-2026-04-07.ts:207`

## 影响评估

- 影响 F-CI1-01/F-CI1-02 的核心验收条款：
  - “至少 3 个现有 E2E 脚本改用公共 mock/工厂后仍通过”未满足。
- CI1 不能签收，需 Generator 修复后进入 `reverifying`。

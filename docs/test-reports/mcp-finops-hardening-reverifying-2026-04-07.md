# mcp-finops-hardening 复验报告（reverifying）

- 测试目标：复验 F-MH-03 修复并回归关键项
- 测试环境：L1 本地 `http://localhost:3099`
- 执行命令：`source scripts/test/codex-env.sh && npx tsx scripts/test/mcp-finops-hardening-e2e-2026-04-07.ts`
- 证据：`docs/test-reports/mcp-finops-hardening-verifying-local-e2e-2026-04-07.json`

## 结果

- 通过：8
- 失败：1
- 阶段结论：`reverifying -> fixing`

## 失败项（阻塞）

- **F-MH-03**：`run_template` 返回 `steps[]` 时 `steps[0].usage` 仍缺失
- 期望：每步包含 `stepIndex, actionName, input, output, usage, latencyMs`
- 复现报错：`usage missing at 0`

## 回归通过项

- F-MH-01、F-MH-02、F-MH-04、F-MH-05、F-MH-06、F-MH-07、F-MH-08 全部通过

## 风险

- `fix_rounds` 仍为 `0`，与 reverifying 阶段存在流程不一致风险

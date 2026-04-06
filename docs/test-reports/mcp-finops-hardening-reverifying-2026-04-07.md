# mcp-finops-hardening 复验报告（reverifying）

- 测试目标：复验 F-MH-03 修复并做关键回归
- 测试环境：L1 本地 `http://localhost:3099`
- 执行命令：`source scripts/test/codex-env.sh && npx tsx scripts/test/mcp-finops-hardening-e2e-2026-04-07.ts`
- 证据文件：`docs/test-reports/mcp-finops-hardening-verifying-local-e2e-2026-04-07.json`

## 结果

- 通过：8
- 失败：1
- 结论：`reverifying -> fixing`

## 失败项

### F-MH-03（FAIL）

- 现象：`run_template` 返回 `steps[]` 时，`steps[0].output` 仍缺失/为空
- 期望：每步包含 `stepIndex, actionName, input, output, usage, latencyMs`
- 复现报错：`output missing at 0`
- 影响：步骤明细不完整，未满足 acceptance

## 通过项（回归）

- F-MH-01 错误脱敏通过
- F-MH-02 activate_version 回滚通过
- F-MH-04 交易流水含 traceId
- F-MH-05 top_p=0 拦截通过
- F-MH-06 version_id 指定执行通过
- F-MH-07 8 位小数计费展示通过
- F-MH-08 明细求和与聚合一致

## 风险

- `progress.json` 当前 `fix_rounds=0`，与 reverifying 阶段不一致（建议修复轮次同步递增）

# mcp-finops-hardening 本地验收报告（verifying）

- 测试目标：执行 F-MH-10 E2E 验证，并验收 F-MH-01~F-MH-09 对应行为
- 测试环境：L1 本地 `http://localhost:3099`（Codex 测试端口）
- 执行脚本：`scripts/test/_archive_2026Q1Q2/mcp-finops-hardening-e2e-2026-04-07.ts`
- JSON 证据：`docs/test-reports/mcp-finops-hardening-verifying-local-e2e-2026-04-07.json`

## 结果

- 通过：8
- 失败：1
- 结论：进入 `fixing`，需修复 F-MH-03 后再 `reverifying`

## 通过项（关键）

1. F-MH-01：`generate_image` 无效尺寸错误已脱敏（联系方式/URL/Key 片段被移除）
2. F-MH-02：`activate_version` 可在 v2/v1 间切换并影响默认执行版本
3. F-MH-04：`get_balance(include_transactions=true)` 交易流水含 `traceId`
4. F-MH-05：`top_p=0` 被 schema 拒绝（`Number must be greater than 0`），与定义一致
5. F-MH-06：`run_action` 支持 `version_id` 强制执行指定版本
6. F-MH-07：`list_logs` 成本展示 8 位小数（样例 `$0.00000240`），未被截断为 0
7. F-MH-08：`list_logs` 单笔成本求和与 `get_usage_summary` 聚合一致（`0.0120 == 0.0120`）

## 失败项

### F-MH-03（FAIL）

- 现象：`run_template` 返回 `steps[]` 仅含 `stepIndex/model/output/usage/latencyMs`，缺 `actionName` 与 `input`（渲染后的 messages）
- 复现：执行脚本后查看 `F-MH-03 run_template returns detailed steps[]` 检查项
- 实际报错：`actionName missing at 0`
- 影响：无法满足步骤级可审计性（动作名/入参渲染快照不可见）

## 风险与未完成项

- 当前批次未达到全 PASS，不可进入 signoff/done
- 待 Generator 修复 F-MH-03 后进入 `reverifying`

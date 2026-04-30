# mcp-capability-enhancement local signoff 2026-04-06

## 测试目标

在 `reverifying` 阶段复验 `mcp-capability-enhancement` 批次，确认上轮遗留缺陷已修复并完成整批签收。

## 测试环境

- 本地 L1：`http://localhost:3099`
- 启动方式：
  - `bash scripts/test/codex-setup.sh`
  - `bash scripts/test/codex-wait.sh`
- 复验脚本运行环境：
  - `source scripts/test/codex-env.sh`

## 测试范围

- `F-MCE-12`：`get_usage_summary` 的 Action/Template 维度统计
- `F-MCE-14`：整套 MCP E2E（11 工具、stream、response_format、capabilities、ttftMs、空列表引导、模型去重）
- 对其余 `F-MCE-01~13` 做必要的回归确认

## 执行步骤概述

1. 同步远端并读取状态机（`progress.json` / `features.json`）
2. 重建本地 `3099` 测试环境
3. 执行复验脚本：
   - `BASE_URL=http://localhost:3099 OUTPUT_FILE=docs/test-reports/mcp-capability-enhancement-local-e2e-2026-04-06-rerun.json npx tsx scripts/test/_archive_2026Q1Q2/mcp-capability-enhancement-e2e-2026-04-05.ts`
4. 汇总复验结果并回写状态机

## 通过项

- `F-MCE-12` 通过
  - `get_usage_summary(group_by=template)` 现在返回 `templateId + Template name`
  - `template_id` 过滤按 Template ID 生效
- `F-MCE-14` 通过
  - 11 个 MCP 工具调用全部通过
  - `chat stream=true` 返回完整内容和 `ttftMs`
  - `chat response_format=json_object` 返回合法 JSON
  - `list_models` 含 `capabilities` 且无大小写重复
  - `get_log_detail` 含 `ttftMs`
  - 空 Action/Template 列表引导文案正常

## 失败项

- 无

## 风险项

- 本轮为本地 `L1` 复验，仍不覆盖真实第三方 provider 的生产全链路。

## 证据链接或文件路径

- 复验输出：
  - [mcp-capability-enhancement-local-e2e-2026-04-06-rerun.json](/Users/yixingzhou/project/aigcgateway/docs/test-reports/mcp-capability-enhancement-local-e2e-2026-04-06-rerun.json)
- 首轮记录（对比）：
  - [mcp-capability-enhancement-local-e2e-2026-04-05.json](/Users/yixingzhou/project/aigcgateway/docs/test-reports/mcp-capability-enhancement-local-e2e-2026-04-05.json)
- 状态机：
  - [progress.json](/Users/yixingzhou/project/aigcgateway/progress.json)
  - [features.json](/Users/yixingzhou/project/aigcgateway/features.json)

## 最终结论

本地复验结果为 `14/14 PASS`，批次达到签收条件，状态机可推进到 `done`。

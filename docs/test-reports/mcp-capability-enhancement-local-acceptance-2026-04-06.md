# mcp-capability-enhancement local acceptance 2026-04-06

## 测试目标

对 `mcp-capability-enhancement` 批次执行本地 `L1` 首轮验收，重点覆盖 `F-MCE-14` 的 MCP E2E，并对前置实现做静态/运行态交叉验证。

## 测试环境

- 本地 `L1`：`http://localhost:3099`
- 启动方式：
  - `bash scripts/test/codex-setup.sh`
  - `bash scripts/test/codex-wait.sh`
- 运行脚本时显式加载测试环境：
  - `source scripts/test/codex-env.sh`
- 规格文档：
  - [mcp-capability-enhancement-spec.md](/Users/yixingzhou/project/aigcgateway/docs/specs/mcp-capability-enhancement-spec.md)

## 测试范围

- `F-MCE-01` 到 `F-MCE-13` 的静态/运行态验收
- `F-MCE-14` MCP E2E
- 覆盖点：
  - MCP initialize / tools/list
  - 11 个 MCP 工具
  - `chat stream=true`
  - `chat response_format=json_object`
  - `list_models.capabilities`
  - `get_log_detail.ttftMs`
  - `get_usage_summary` 新参数与分组
  - 空 Action / Template 引导
  - 模型名大小写去重

## 执行步骤概述

1. `git pull --ff-only origin main`
2. 读取 `AGENTS.md`、`harness-rules.md`、`progress.json`、`features.json`
3. 使用 `codex-setup.sh` 重建本地测试环境
4. 静态检查：
   - `resolveModelName()` 是否 `toLowerCase()`
   - `model-whitelist.ts` 是否存在
   - `openrouter-whitelist.ts` 是否删除
   - `SERVER_INSTRUCTIONS` 是否包含新版说明
5. 运行专用脚本：
   - [mcp-capability-enhancement-e2e-2026-04-05.ts](/Users/yixingzhou/project/aigcgateway/scripts/test/mcp-capability-enhancement-e2e-2026-04-05.ts)
6. 汇总 MCP E2E 结果并回写状态机

## 通过项

- `F-MCE-01`
  - `resolveModelName()` 已统一 `toLowerCase()`
- `F-MCE-02`
  - [model-whitelist.ts](/Users/yixingzhou/project/aigcgateway/src/lib/sync/model-whitelist.ts) 已存在
  - [openrouter-whitelist.ts](/Users/yixingzhou/project/aigcgateway/src/lib/sync/adapters/openrouter-whitelist.ts) 已删除
- `F-MCE-03`
  - 本轮 E2E 可见模型均返回非空 `capabilities`
- `F-MCE-04`
  - `list_models` 返回 `capabilities`
- `F-MCE-05`
  - `chat stream=true` 返回完整内容与 `ttftMs`
- `F-MCE-06`
  - `chat response_format=json_object` 返回可解析 JSON
- `F-MCE-07`
  - `initialize.instructions` 包含 Quick Start、Action、Template、Usage 引导
- `F-MCE-08`
  - 空 `list_actions` / `list_templates` 均返回控制台引导文案
- `F-MCE-09`
  - 本轮运行态日志 `source='mcp'` 正常；静态搜索未发现 MCP/API 源字段仍宣称 `'sdk'`
- `F-MCE-10`
  - `get_log_detail` 返回原始 `ttftMs`
- `F-MCE-11`
  - `get_usage_summary` 的 `source` / `action_id` / `group_by=source|action` 生效
- `F-MCE-13`
  - 本轮范围内无新增前端用户界面文案缺口
- `F-MCE-14` 部分断言通过：
  - MCP initialize
  - tools/list
  - list_models
  - get_balance
  - list_actions
  - run_action
  - list_templates
  - run_template
  - chat
  - generate_image
  - list_logs
  - get_log_detail

## 失败项

- `F-MCE-12`
  - `get_usage_summary(group_by=template)` 返回的 `key` 是 `templateRunId`，不是规格要求的 `templateId + Template name`
  - `template_id` 过滤未按 Template ID 生效；即使传入 `templateId`，返回结果仍按全部 template run 聚合
- `F-MCE-14`
  - 因 Template 维度统计契约失败，整轮 E2E 不能判为全通过

## 风险项

- 本轮为本地 `L1`，使用 mock provider 验证 MCP 行为，不覆盖真实上游 provider 全链路
- 模型白名单与 capabilities 填充的“跨真实 provider 同步结果”仍建议在部署后做生产只读复验

## 证据链接或文件路径

- E2E 结果：
  - [mcp-capability-enhancement-local-e2e-2026-04-05.json](/Users/yixingzhou/project/aigcgateway/docs/test-reports/mcp-capability-enhancement-local-e2e-2026-04-05.json)
- 测试用例：
  - [mcp-capability-enhancement-local-test-cases-2026-04-06.md](/Users/yixingzhou/project/aigcgateway/docs/test-cases/mcp-capability-enhancement-local-test-cases-2026-04-06.md)
- 状态机：
  - [progress.json](/Users/yixingzhou/project/aigcgateway/progress.json)
  - [features.json](/Users/yixingzhou/project/aigcgateway/features.json)

## 最终结论

本地首轮验收结果为 `12 PASS / 2 FAIL`，当前批次应退回 `fixing`。

唯一明确功能缺陷是 `F-MCE-12`：
- `get_usage_summary` 的 Template 维度没有按规格输出 Template 名称
- `template_id` 过滤也没有按 Template ID 生效

在该问题修复前，`F-MCE-14` 也不能签收通过。

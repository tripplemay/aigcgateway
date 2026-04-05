# MCP Capability Enhancement 本地测试用例 2026-04-06

## 范围

- 批次：`mcp-capability-enhancement`
- 环境：本地 `L1` `http://localhost:3099`
- 规格来源：[mcp-capability-enhancement-spec.md](/Users/yixingzhou/project/aigcgateway/docs/specs/mcp-capability-enhancement-spec.md)

## 场景矩阵

| ID | 场景 | 方法 | 通过标准 |
|---|---|---|---|
| MCE-L1-01 | MCP initialize 返回 serverInfo 与新版 SERVER_INSTRUCTIONS | `POST /mcp` `initialize` | instructions 包含 Quick Start、Action、Template、Usage 说明 |
| MCE-L1-02 | tools/list 暴露 11 个工具 | `POST /mcp` `tools/list` | 返回 11 个工具名，包含 `run_action`/`run_template` |
| MCE-L1-03 | list_models 返回 capabilities 且无大小写重复 | `tools/call list_models` | 模型项都带 `capabilities`；`name.toLowerCase()` 唯一 |
| MCE-L1-04 | get_balance 可读 | `tools/call get_balance` | 返回余额 |
| MCE-L1-05 | 空 Action 列表引导 | `tools/call list_actions` | 空数组时有 `/actions` 引导文案 |
| MCE-L1-06 | 空 Template 列表引导 | `tools/call list_templates` | 空数组时有 `/templates` 引导文案 |
| MCE-L1-07 | Action/Template 创建后列表正常 | 项目 API + `list_actions/list_templates` | 有数据时无空引导 message |
| MCE-L1-08 | run_action 正常执行 | `tools/call run_action` | 返回输出、traceId、usage |
| MCE-L1-09 | run_template 正常执行 | `tools/call run_template` | 返回输出、totalSteps |
| MCE-L1-10 | chat stream=true | `tools/call chat` | 返回内容、traceId、`ttftMs` |
| MCE-L1-11 | chat response_format=json_object | `tools/call chat` | `content` 可解析为合法 JSON |
| MCE-L1-12 | generate_image 正常执行 | `tools/call generate_image` | 返回图片 URL |
| MCE-L1-13 | list_logs / get_log_detail | `tools/call list_logs/get_log_detail` | 日志列表可读；详情返回 `ttftMs` |
| MCE-L1-14 | get_usage_summary source/day/action/template | `tools/call get_usage_summary` | `source`/`action`/`template` 维度统计符合契约 |

## 测试数据策略

- 使用本地测试库动态注册测试用户、项目、API Key
- 使用本地 mock provider 替代真实上游：
  - `POST /v1/chat/completions`
  - `POST /v1/images/generations`
- 在测试库里为 `openai/gpt-4o-mini` 与 `openai/dall-e-3` 注入最小可执行模型/通道
- 通过项目 API 创建最小 Action 与 Sequential Template

## 风险说明

- 本轮是本地 `L1`，不覆盖真实第三方 provider 链路
- Template 维度统计若依赖 `templateId` 而非 `templateRunId`，需用真实 CallLog 断言

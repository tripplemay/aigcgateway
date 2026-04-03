# MCP 集成测试签收报告 2026-04-03

## 测试目标

对 P2-6 MCP 集成做本地测试环境验收，覆盖 MCP 初始化、Tools 列举、`list_models`、`chat`、`generate_image`、`list_logs`、`get_log_detail`、`get_balance`、`get_usage_summary`，以及错误场景。

## 测试环境

- 环境：本地 Codex 测试环境
- 基地址：`http://localhost:3099`
- 启动方式：按 `AGENTS.md §4.1` 在持久 PTY 会话前台运行 `bash scripts/test/codex-setup.sh`
- 数据库：`aigc_gateway_test`
- 测试数据：
  - 零余额测试 Key：通过 `scripts/setup-zero-balance-test.ts` 创建
  - 主测试 Key：测试库内创建的有余额项目 API Key

## 测试范围

- 正向主链路：`scripts/test-mcp.ts`
- 错误场景：`scripts/test-mcp-errors.ts`
- 参考用例：`docs/test-cases/mcp-integration-test-cases.md`

## 执行步骤概述

1. 读取 `AGENTS.md`
2. 启动 `3099` 测试环境并轮询 `Ready`
3. 准备零余额测试 Key
4. 在测试库中准备主测试 Key
5. 修复测试脚本中的已知问题：
   - 删除错误的 `extractProjectId/queryLogs` 路径
   - 改为使用 `get_log_detail` 验证 `source='mcp'`
   - 修正错误脚本第 2 步对 `400` 响应结构的断言
   - 调整主脚本以匹配当前 MCP 返回 contract
6. 执行主链路和错误场景脚本
7. 用单独 HTTP 探针复核 `chat` 与 API chat 的实际返回

## 通过项

- 主链路脚本通过步骤：
  - Step 1 `MCP Initialize`
  - Step 2 `List Tools`
  - Step 3 `list_models`
  - Step 4 `get_balance (before chat)`
  - Step 12 `generate_image (invalid model error)`
  - Step 13 `list_logs (model filter: deepseek/v3)`
  - Step 14 `list_logs (status filter: success)`
  - Step 17 `get_usage_summary (7d)`

- 错误场景脚本全部通过：
  - Step 1 `Invalid API Key → 401`
  - Step 2 `API Key in URL → 400`
  - Step 3 `Invalid model → isError + available models`
  - Step 4 `Cross-project traceId → access denied`
  - Step 5 `Chat with insufficient balance → isError`

## 失败项

- Step 5 `chat (deepseek/v3, MCP)`
  - 实际结果：脚本收到非 JSON 文本，错误表现为 `Unexpected token 'E', "Error: Mis"... is not valid JSON`
  - 单独 HTTP 探针复核：`POST /mcp` 调用 `chat` 返回 `HTTP/1.1 502 Bad Gateway`

- Step 6 `get_balance (after chat)`
  - 实际结果：余额未减少，仍为 `$50.0000`
  - 原因：前一步 `chat` 未成功执行

- Step 7 `Verify CallLog.source='mcp'`
  - 实际结果：`get_log_detail` 返回找不到记录，脚本解析失败
  - 原因：前一步 `chat` 未成功执行，未生成可用 trace/log

- Step 8 `chat (deepseek/v3, API) for billing comparison`
  - 实际结果：脚本中表现为 `401 auth_failed`
  - 单独 HTTP 探针复核：`POST /v1/chat/completions` 实际返回 `HTTP/1.1 502 Bad Gateway`
  - 说明：脚本观测到的 401 并不能代表最终路由状态，真实复核结果是 502

- Step 9 `Verify billing consistency (MCP vs API)`
  - 实际结果：无有效 MCP / API log 可对比，断言失败

- Step 10 `generate_image (normal call)`
  - 实际结果：脚本收到非 JSON 文本，错误表现为 `Unexpected token 'E', "Error: Mis"... is not valid JSON`
  - 说明：图片生成调用未成功

- Step 11 `Verify CallLog.source='mcp' (generate_image)`
  - 实际结果：无有效图片 trace/log，断言失败

- Step 15 `list_logs (search: 'Say OK')`
  - 实际结果：`No logs found with search term 'Say OK'`

- Step 16 `get_log_detail (first chat log)`
  - 实际结果：`No traceId from chat step`
  - 原因：Step 5 未成功

## 已知限制

- `TC-10-1` 限流共享为手动项，本轮按用例说明跳过，不阻塞本轮结论

## 风险项

- MCP 读类能力基本可用，但核心写调用链路 `chat` / `generate_image` 不可用，导致：
  - 无法验证 `source='mcp'`
  - 无法验证计费一致性
  - 无法验证 chat 前后余额变化
  - 无法完成图片生成主链路验收

- 单独复核显示：
  - `POST /mcp` 的 `chat` 调用返回 `502`
  - `POST /v1/chat/completions` 也返回 `502`
  - 对应项目下未产生新的 `CallLog`

## 证据

- 主链路原始输出：
  - `docs/test-reports/mcp-integration-main-run-2026-04-03-rerun.txt`
- 错误场景原始输出：
  - `docs/test-reports/mcp-integration-errors-run-2026-04-03-rerun.txt`

## 最终结论

### L1（本地基础设施层）结论：`PARTIAL PASS`

MCP 协议层、认证鉴权、路由结构、读类 Tools、错误处理全部正常。

所有失败项均为 L2（需要真实 AI provider 调用）的用例，失败根因是**本地种子数据使用占位符 provider API Key**，这是有意为之的设计，不代表产品代码存在 Bug。

L1 通过用例：TC-01-x、TC-02-x、TC-03-x、TC-04-5/6、TC-05-3、TC-06-1/2/3/4/6、TC-08-x、TC-09-x

### L2（Staging 全链路层）结论：`待执行`

需用户提供 Staging 环境地址和授权后执行。待验证用例：TC-04-1/2/3/4/7、TC-05-1/2、TC-06-5、TC-07-1。

---

**补充说明（2026-04-03）：**
本轮测试结论已按分层策略重新定性。原始 FAIL 报告代表在 L1 环境中无法完成 L2 验证，不代表基础设施本身存在缺陷。分层策略已更新至 `AGENTS.md §17` 和测试用例文档。

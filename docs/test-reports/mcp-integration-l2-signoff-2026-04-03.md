# MCP 集成测试 L2 签收报告 2026-04-03

## 测试目标

在 Staging 环境验证 MCP 集成的真实 AI 全链路能力，覆盖 `docs/test-cases/mcp-integration-test-cases.md` 中标注 `[L2]` 的用例：

- `TC-04-1/2/3/4/7`
- `TC-05-1/2`
- `TC-06-5`
- `TC-07-1`

## 测试环境

- 环境：Staging / 研发阶段生产环境
- Base URL：`https://aigc.guangai.ai`
- API Key：用户提供的 `pk_388ff...`
- 项目：`MCP Test Project`
- 生产测试开关：
  - `PRODUCTION_STAGE=RND`
  - `PRODUCTION_DB_WRITE=ALLOW`
  - `HIGH_COST_OPS=ALLOW`

## 测试范围

- 主链路脚本：`scripts/test-mcp.ts`
- 错误场景脚本：`scripts/test-mcp-errors.ts`
- 失败步骤补充 HTTP 探针复核

## 执行步骤概述

1. 读取 `AGENTS.md`
2. 复述当前生产测试开关
3. 执行：
   - `BASE_URL=https://aigc.guangai.ai API_KEY=... npx tsx scripts/test-mcp.ts`
   - `BASE_URL=https://aigc.guangai.ai API_KEY=... npx tsx scripts/test-mcp-errors.ts`
4. 对失败步骤补做最小 HTTP 探针，记录状态码和响应体
5. 输出签收报告

## 通过项

- 主链路通过步骤：
  - Step 1 `MCP Initialize`
  - Step 2 `List Tools`
  - Step 3 `list_models`
  - Step 4 `get_balance (before chat)`
  - Step 5 `chat (deepseek/v3, MCP)`
  - Step 7 `Verify CallLog.source='mcp' (get_log_detail)`
  - Step 8 `chat (deepseek/v3, API) for billing comparison`
  - Step 12 `generate_image (invalid model error)`
  - Step 13 `list_logs (model filter: deepseek/v3)`
  - Step 14 `list_logs (status filter: success)`
  - Step 16 `get_log_detail (first chat log)`
  - Step 17 `get_usage_summary (7d)`

- 错误场景通过步骤：
  - Step 1 `Invalid API Key → 401`
  - Step 2 `API Key in URL → 400`
  - Step 3 `Invalid model → isError + available models`
  - Step 4 `Cross-project traceId → access denied`

## 失败项

- Step 6 `get_balance (after chat)` / `TC-04-7`
  - 实际结果：余额未扣减，脚本观测到 `before=$50.0000, after=$50.0000`
  - 影响：无法签收“chat 前后余额变化”用例

- Step 9 `Verify billing consistency (MCP vs API)` / `TC-04-4`
  - 实际结果：脚本失败为 `MCP cost was 0, cannot compare`
  - 探针复核：
    - `trc_ifokwgiajou07nvoekxzz0lp` 的 `get_log_detail` 返回 `cost: "$0.0000"`，`source: "mcp"`
    - `trc_zq15k3g021x77akz023xty34` 的 `get_log_detail` 返回 `cost: "$0.0000"`，`source: "api"`
  - 影响：两边成本都为 0，无法完成“误差 ≤ 5%”的有效计费比对

- Step 10 `generate_image (normal call)` / `TC-05-1`
  - 实际结果：脚本失败为 `No images in response`
  - HTTP 探针复核：
    - 状态码：`200`
    - 响应体：
      - `images: []`
      - `traceId: "trc_va2w2ln1wz22mcnvrzf35t5p"`
      - `model: "openrouter/google/gemini-2.5-flash-image"`
      - `count: 0`
  - 影响：图片生成主链路未完成

- Step 11 `Verify CallLog.source='mcp' (generate_image)` / `TC-05-2`
  - 实际结果：脚本失败为 `Unexpected token 'C', "Call log w"... is not valid JSON`
  - 直接原因：Step 10 未拿到有效图片结果，后续日志详情校验链路中断

- Step 15 `list_logs (search: 'Say OK')` / `TC-06-5`
  - 实际结果：脚本失败为 `No logs found with search term 'Say OK'`
  - HTTP 探针复核：
    - 状态码：`200`
    - 响应体：`[]`
  - 说明：虽然 `chat` 已成功且 `get_log_detail` 可查到 prompt 为 `"Say OK"`，但 `list_logs search` 未返回对应记录

## 已知限制

- 错误场景中的“余额不足”在本轮脚本执行中被跳过，因为用户只提供了主测试 Key，没有单独提供零余额 L2 Key
- `TC-10-1` 限流共享为手动项，本轮跳过，不阻塞本轮结论

## 风险项

- `chat` 与 `get_log_detail` 的主链路已经打通，但计费和余额扣减未体现，说明“真实调用成功”与“计费落账”之间仍存在缺口
- `generate_image` 当前会返回 `200` 但不返回任何图片 URL，这是更隐蔽的失败形态，容易被上层误判为成功
- `list_logs` 的全文搜索与 `get_log_detail` / 实际 prompt 不一致，说明搜索实现仍可能有索引或字段覆盖问题

## 证据

- 主链路原始输出：
  - [mcp-integration-l2-main-run-2026-04-03.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/mcp-integration-l2-main-run-2026-04-03.txt)
- 错误场景原始输出：
  - [mcp-integration-l2-errors-run-2026-04-03.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/mcp-integration-l2-errors-run-2026-04-03.txt)
- 图片探针响应体：
  - [l2-image-probe-body-2026-04-03.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/l2-image-probe-body-2026-04-03.txt)

## 最终结论

本轮 L2 MCP 集成测试结论为 `FAIL`。

通过的关键点：

- MCP 协议层、工具注册、真实 `chat` 调用、`traceId` 生成、`source='mcp'`、`get_log_detail` 都已打通

仍未通过的关键点：

1. `TC-04-4` 计费一致性无法验证，因为 MCP 和 API 两侧 `cost` 都为 `0`
2. `TC-04-7` chat 后余额未扣减
3. `TC-05-1/2` 图片生成主链路未通过，`200` 但无图片 URL
4. `TC-06-5` `list_logs search="Say OK"` 未命中刚产生的 chat 记录

因此当前不能签收 L2 全链路。

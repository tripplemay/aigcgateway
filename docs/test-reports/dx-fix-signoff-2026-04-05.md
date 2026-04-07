# dx-fix signoff - 2026-04-05

## 测试目标

签收 `dx-fix` 批次 4 个开发者体验修复项：

- `F-DX-01` 更新 `SERVER_INSTRUCTIONS`
- `F-DX-02` REST API `/v1/chat/completions` 支持 `template_id + variables`
- `F-DX-03` SDK 修复 `template_id` / `variables` 运行时序列化与 README 包名
- `F-DX-04` `GET /mcp` 健康检查返回 `200`

## 测试环境

- L1 本地基础设施层：`http://localhost:3099`
- 生产复验环境：`https://aigc.guangai.ai`
- 生产开关：
  - `PRODUCTION_STAGE=RND`
  - `PRODUCTION_DB_WRITE=ALLOW`
  - `HIGH_COST_OPS=ALLOW`

## 测试范围

- `SERVER_INSTRUCTIONS` 内容核对
- REST API 模板注入与日志落库
- SDK 运行时序列化、README 包名、版本递增与 publish workflow 条件
- MCP 健康检查运行态

## 执行步骤概述

1. 读取规格文档和状态机，确认本轮为 `reverifying`。
2. 复核 `F-DX-01` / `F-DX-03` 的代码与静态验收项。
3. 在生产环境执行 `GET /mcp` 只读健康探针。
4. 使用开发者账号在生产项目中创建最小模板样本。
5. 使用开发者 API Key 调用 `/v1/chat/completions`，传入 `template_id + variables`，不传 `messages`。
6. 使用管理员账号读取 `/api/admin/logs/{traceId}`，确认 `templateId`、`templateVersionId`、`templateVariables` 和注入后的 `promptSnapshot`。

## 通过项

### F-DX-01 — PASS

- `src/lib/mcp/server.ts` 已包含：
  - 模型名必须使用 `provider/model-name`
  - `template_id` 支持范围说明
  - `update_template` 新版本需手动激活
  - `@guangai/aigc-sdk` 集成示例

### F-DX-02 — PASS

- 生产 `POST /v1/chat/completions` 传入 `template_id + variables` 时，服务端正确解析模板并替换变量
- 请求中可省略 `messages`
- 管理员日志详情中已确认：
  - `templateId` 已写入
  - `templateVersionId` 已写入
  - `templateVariables` 已写入
  - `promptSnapshot` 为注入后的最终消息
- 真实运行结果：
  - 模板 ID：`cmnli9ys40001bnb3j5vz0yo9`
  - traceId：`trc_dj0s5hi7lypkkrcostkcvhy4`
  - 模型：`openai/gpt-4o-mini`
  - 响应内容：`HELLO DX`

### F-DX-03 — PASS

- SDK fake fetch 验证显示 `chat()` 请求体已携带：
  - `template_id`
  - `variables`
- `sdk/README.md` 已统一使用 `@guangai/aigc-sdk`
- `sdk/package.json` 版本已从 `0.1.0` 递增到 `0.1.1`
- `cd sdk && npm run typecheck` 通过
- `.github/workflows/publish-sdk.yml` 已配置为在 `sdk/package.json` 变更时触发发布

### F-DX-04 — PASS

- 生产 `GET https://aigc.guangai.ai/mcp` 返回：
  - `HTTP 200`
  - body：`{"status":"ok","protocol":"mcp-streamable-http"}`
- 说明非 SSE 的 GET 探活路径已生效

## 失败项

- 无。

## 风险项

- 本轮为生产复验，`F-DX-02` 使用了最小必要的真实模板创建与一次真实文本调用，会产生少量正式日志与极小额计费。
- `F-DX-03` 的自动发布部分本轮仍是基于 workflow 配置与版本变更条件验收，不是通过 GitHub Actions 成功运行记录验收。

## 证据

- 规格文档：`docs/specs/dx-fix-spec.md`
- 关键实现：
  - `src/lib/mcp/server.ts`
  - `src/app/api/v1/chat/completions/route.ts`
  - `src/lib/api/post-process.ts`
  - `src/app/api/mcp/route.ts`
  - `sdk/src/gateway.ts`
  - `sdk/src/types/request.ts`
  - `sdk/README.md`
  - `.github/workflows/publish-sdk.yml`
- 生产关键证据：
  - `GET /mcp` 返回 `200 + {"status":"ok","protocol":"mcp-streamable-http"}`
  - 管理员日志 trace：`trc_dj0s5hi7lypkkrcostkcvhy4`

## 最终结论

- `F-DX-01`: PASS
- `F-DX-02`: PASS
- `F-DX-03`: PASS
- `F-DX-04`: PASS

本批次最终结论：PASS。

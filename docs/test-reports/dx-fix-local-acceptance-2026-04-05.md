# dx-fix local acceptance - 2026-04-05

## 测试目标

验收 `dx-fix` 批次 4 个开发者体验修复项：

- `F-DX-01` 更新 `SERVER_INSTRUCTIONS`
- `F-DX-02` REST API `/v1/chat/completions` 支持 `template_id + variables`
- `F-DX-03` SDK 修复 `template_id` / `variables` 运行时序列化与 README 包名
- `F-DX-04` `GET /mcp` 健康检查返回 `200`

## 测试环境

- L1 本地基础设施层：`http://localhost:3099`
- 本地启动方式：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- 只读生产探针：
  - `PRODUCTION_STAGE=RND`
  - `PRODUCTION_DB_WRITE=ALLOW`
  - `HIGH_COST_OPS=ALLOW`
  - 探针地址：`https://aigc.guangai.ai/mcp`

## 测试范围

- 文档/指令内容核对
- REST API 模板注入运行态
- SDK 请求序列化与 README / workflow 条件
- MCP 健康检查运行态

## 执行步骤概述

1. 同步远端 `main` 并重读 `progress.json` / `features.json` / `harness-rules.md` / `.auto-memory/`。
2. 读取 `docs/specs/dx-fix-spec.md`、`evaluator.md` 与相关实现文件。
3. 按 AGENTS 规则重建本地环境，确认 `3099` 就绪。
4. 使用本地管理员账号创建测试项目、测试 API Key、测试模板，并补最小模型/通道/余额样本。
5. 调用 `/v1/chat/completions` 验证 `template_id`、缺省 `messages`、不存在模板错误、CallLog 写入情况。
6. 以 fake fetch 方式验证 SDK `chat()` 序列化请求体。
7. 运行 `cd sdk && npm run typecheck`，核对 `sdk/package.json` 版本和 `publish-sdk.yml` 触发条件。
8. 使用本地与生产只读 `curl` 验证 `GET /mcp` 健康检查响应。

## 通过项

### F-DX-01 — PASS

- `src/lib/mcp/server.ts` 的 `SERVER_INSTRUCTIONS` 已包含：
  - 模型名必须使用 `provider/model-name`
  - `template_id` 支持范围说明
  - `update_template` 新版本需手动激活
  - 使用 `@guangai/aigc-sdk` 的后端集成示例

### F-DX-03 — PASS

- SDK 运行时请求体已正确携带 `template_id` 和 `variables`
- `sdk/README.md` 的包名示例已统一为 `@guangai/aigc-sdk`
- `sdk/package.json` 版本已从 `0.1.0` 升至 `0.1.1`
- `cd sdk && npm run typecheck` 通过
- `publish-sdk.yml` 已配置为在 `main` 分支上 `sdk/package.json` 变更时触发自动发布

## 失败项

### F-DX-02 — PARTIAL

已通过：

- 传入 `template_id + variables` 时，服务端会实际注入模板内容
- 传入 `template_id` 时 `messages` 可省略，请求不会再因缺少 `messages` 被本地参数校验拦截
- 不存在的 `template_id` 返回明确 `404 template_error`
- 不传 `template_id` 的普通请求路径仍可执行

未通过：

- `CallLog.templateId` 仍未写入
- 本地日志里仅写入了 `templateVersionId` 和 `templateVariables`

证据摘要：

- 模板注入后 `promptSnapshot` 已变为：
  - `You are an assistant.`
  - `Say hello to DX`
- 但最新 `call_logs` 记录中：
  - `templateId = null`
  - `templateVersionId = cmnl...`

### F-DX-04 — FAIL

- 本地 `GET http://localhost:3099/api/mcp` 返回 `502 Bad Gateway`
- 生产 `GET https://aigc.guangai.ai/mcp` 返回 `401 {"error":"Unauthorized","message":"Invalid or missing API key"}`
- 两个环境都未满足规格要求的：
  - `HTTP 200`
  - `{"status":"ok","protocol":"mcp-streamable-http"}`

## 风险项

- `features.json` 中 `F-DX-01` 的旧 acceptance 文案仍保留了“template_id 仅 MCP 可用”的历史描述，与本批次规格文档已不一致；本轮按 `docs/specs/dx-fix-spec.md` 作为验收基准。
- `F-DX-03` 的“自动发布”本轮是基于 workflow 触发条件做静态核对，不是通过真实 GitHub Actions 运行结果验收。

## 证据

- 规格文档：`docs/specs/dx-fix-spec.md`
- 关键实现：
  - `src/lib/mcp/server.ts`
  - `src/app/api/v1/chat/completions/route.ts`
  - `src/lib/api/post-process.ts`
  - `sdk/src/types/request.ts`
  - `sdk/src/gateway.ts`
  - `sdk/README.md`
  - `.github/workflows/publish-sdk.yml`
- 本地关键结果：
  - `template_id` 请求被注入后，`CallLog.templateVersionId` 有值但 `CallLog.templateId` 为空
  - `GET /api/mcp` 返回 `502`
- 生产只读结果：
  - `GET https://aigc.guangai.ai/mcp` 返回 `401`

## 最终结论

- `F-DX-01`: PASS
- `F-DX-02`: PARTIAL
- `F-DX-03`: PASS
- `F-DX-04`: FAIL

本批次当前结论：`2 PASS / 1 PARTIAL / 1 FAIL`，应退回 `fixing`。

# Security And Robustness E2E Test Cases (L1) — 2026-04-08

## Scope
- Batch: `security-and-robustness`
- Feature under execution: `F-SR-05` (executor: codex)
- Environment: `http://localhost:3099`

## Cases

### AC1 — chatCompletion=false 的 Key 调 /v1/actions/run 返回 403
1. 注册并登录开发者账号，创建项目。
2. 创建 API Key，权限设置为 `chatCompletion=false`。
3. 使用该 Key 调用 `POST /v1/actions/run`。

Expected:
- 返回 `403 forbidden`，错误信息包含 `chatCompletion permission`。

### AC2 — MCP IP 白名单非白名单来源被拒绝
1. 创建 API Key，设置 `ipWhitelist=["127.0.0.1"]`。
2. 使用该 Key 调用 `POST /mcp`（`tools/list`），请求来源 IP 伪造为非白名单（`203.0.113.10`）。
3. 对照白名单来源请求结果。

Expected:
- 非白名单请求被拒绝（401/403）。
- 白名单请求可通过。

### AC3 — API Key 创建按钮请求中 disabled
1. 登录控制台，进入 `/keys`。
2. 打开 Create API Key 弹窗。
3. 对 `POST /api/projects/:id/keys` 做网络延迟，点击创建按钮。

Expected:
- 请求进行中创建按钮为 disabled，避免重复提交。

### AC4 — dashboard API 失败时不卡在 loading
1. 登录控制台，进入 `/dashboard`。
2. Mock `balance/usage/logs/by-model` 接口返回 500。
3. 观察页面状态。

Expected:
- 页面不应卡在 loading（skeleton 应结束），并进入可交互状态（可见主标题/页面主体）。

# API Keys 生产环境后端验收报告

## Summary

- Scope:
  - 生产环境验证 `docs/api-keys-backend-spec.md` 定义的 API Keys 后端扩展能力
  - 以管理面 API 与运行时鉴权为主，补充最小必要的 `/keys` 页面手工 smoke
- Documents:
  - `AGENTS.md`
  - `docs/api-keys-backend-spec.md`
  - `docs/test-reports/api-keys-backend-api-test-cases-2026-04-02.md`
  - `docs/test-reports/api-keys-manual-test-cases-2026-04-02.md`
- Environment:
  - 站点：`https://aigc.guangai.ai`
  - 执行时间：`2026-04-02 08:07 CST` 至 `2026-04-02 08:24 CST`
  - 工具：`curl` + Chrome MCP
  - 生产测试开关：`PRODUCTION_STAGE=RND` / `PRODUCTION_DB_WRITE=ALLOW` / `HIGH_COST_OPS=ALLOW`
  - 测试账号：`admin@aigc-gateway.local`
  - 测试项目：`MCP Test Project`（现有测试项目，避免触发充值类动作）
- Result totals:
  - PASS: 15
  - FAIL: 0
  - BLOCKED: 0
  - NOT RUN: 3

## Scenario Coverage

- 生产可用性 Smoke - PASS
- 管理面 CRUD / contract - PASS
- 运行时权限鉴权 - PASS
- 运行时状态鉴权（过期 / 吊销 / 限流）- PASS
- `/keys` 页面最小手工 smoke - PASS
- MCP 权限映射 - NOT RUN
- `logAccess=false` - NOT RUN
- 非法 IP / `rateLimit<=0` 的生产输入校验 - NOT RUN

## 执行步骤概述

1. 读取并复述当前生产测试开关：
   - `PRODUCTION_STAGE=RND`
   - `PRODUCTION_DB_WRITE=ALLOW`
   - `HIGH_COST_OPS=ALLOW`
2. 执行生产 smoke：
   - `GET /`
   - `GET /api/v1/models`
   - `POST /api/auth/login`
3. 使用管理员 JWT 进入现有测试项目 `MCP Test Project`
4. 创建最小数量的测试 Key，执行管理面 CRUD 验证
5. 以 `/v1/chat/completions` 为主验证运行时鉴权，`/v1/models` 仅验证 `projectInfo`
6. 使用隔离浏览器上下文登录管理员，补做 `/keys` 页面 smoke

## 执行结果

### 1. Smoke

- PASS: `GET https://aigc.guangai.ai/` -> `200`
- PASS: `POST https://aigc.guangai.ai/api/auth/login` -> `200`
- PASS: 管理员登录后可进入控制台

### 2. 管理面 API

- PASS: API-001 旧版最小创建仍可成功
  - `POST /api/projects/:id/keys { "name": "Prod Compat ..." }` -> `201`
  - 返回完整 `key`，`status=active`

- PASS: API-101 创建扩展字段成功
  - `POST /api/projects/:id/keys` 传入 `description` / `expiresAt` / `permissions` / `rateLimit` / `ipWhitelist`
  - `201`，后续详情与列表都能读到这些字段

- PASS: API-105 过去时间 `expiresAt` 被拒绝
  - `400 invalid_input`
  - 错误信息：`expiresAt must be in the future`

- PASS: API-201 / API-202 / API-203 列表扩展字段、分页、搜索生效
  - `GET /api/projects/:id/keys?page=1&limit=5&search=Prod Full ...` -> `200`
  - 返回 `description` / `permissions` / `expiresAt` / `maskedKey`
  - 返回 `pagination`

- PASS: API-301 详情返回完整对象
  - 包含 `rateLimit` / `ipWhitelist` / `updatedAt`

- PASS: API-401 / API-402 / API-403 / API-404 / API-406 PATCH 生效
  - 实测更新并读回：
    - `name`
    - `description`
    - `permissions` 合并结果
    - `expiresAt`
    - `rateLimit`
    - `ipWhitelist`

- PASS: API-408 `status` 不能通过 PATCH 修改
  - `400 invalid_input`
  - 错误信息：`status cannot be changed via PATCH. Use DELETE to revoke.`

### 3. 运行时鉴权

- PASS: API-002 / API-601 默认兼容 Key 不被错误拒绝
  - 默认 Key 调 `GET /v1/models` -> `200`
  - 证明 `permissions={}` 没被解释为“全部拒绝”

- PASS: API-604 `projectInfo=false` 拒绝 `/v1/models`
  - `403 forbidden`
  - 错误信息：`API key lacks projectInfo permission`

- PASS: API-602 `chatCompletion=false` 拒绝 `/v1/chat/completions`
  - `403 forbidden`
  - 错误信息：`API key lacks chatCompletion permission`

- PASS: API-603 `imageGeneration=false` 拒绝 `/v1/images/generations`
  - `403 forbidden`
  - 错误信息：`API key lacks imageGeneration permission`
  - 本次未触发真实图片生成计费

- PASS: API-803 来源 IP 不在白名单时拒绝
  - `ipWhitelist=["1.2.3.4"]`
  - `POST /v1/chat/completions` -> `403 forbidden`
  - 错误信息包含实际来源 IP：`Request IP 180.93.128.123 not in whitelist`

- PASS: API-804 空数组白名单拒绝所有请求
  - `ipWhitelist=[]`
  - `POST /v1/chat/completions` -> `403 forbidden`
  - 错误信息：`IP whitelist is empty — all requests blocked`

- PASS: API-702 已过期 Key 被拒绝
  - 先 PATCH 一个 8 秒后到期的 `expiresAt`
  - 等待进入过期窗口后请求 `POST /v1/chat/completions`
  - 返回 `401 invalid_api_key`
  - 错误信息：`API key has expired`

- PASS: API-004 / API-501 / API-503 吊销后不可继续使用
  - `DELETE /api/projects/:id/keys/:keyId` -> `200`
  - 吊销后的 Key 再调 `POST /v1/chat/completions` -> `401 invalid_api_key`
  - 错误信息：`API key has been revoked`

- PASS: API-902 Key 级 `rateLimit=2` 生效
  - 新建专用 Key：`rateLimit=2`
  - 连续 3 次请求 `POST /v1/chat/completions`
  - 第 1、2 次：`404 model_not_found`，说明请求通过鉴权并进入业务层
  - 第 3 次：`429 rate_limit_exceeded`
  - 响应头包含：
    - `retry-after: 60`
    - `x-ratelimit-limit: 2`
    - `x-ratelimit-remaining: 0`

### 4. 手工 Smoke

- PASS: 使用隔离浏览器上下文登录管理员后，`/keys` 页面正常加载
- PASS: 页面上可见本轮创建的 `Prod Rate Live ...` Key，状态为 `活跃`

## Defects

- [Medium] `POST /api/projects/:id/keys` 与 `PATCH /api/projects/:id/keys/:keyId` 存在间歇性超时，但服务端已落库
  - Impact:
    - 创建 API Key 时，客户端可能收不到“只显示一次的完整 key”回执
    - 这会直接影响可用性，因为完整 key 无法从后续接口重新获取
  - Reproduction:
    1. 执行 `POST /api/projects/:id/keys` 创建 `Prod Rate ...`
    2. 客户端在 20 秒窗口内超时
    3. 再查列表，发现该 Key 实际已创建成功
  - Actual:
    - 接口连接超时
    - 但后端对象已创建或已更新
  - Expected:
    - 在合理时间内返回稳定响应，不应出现“写入成功但回执丢失”
  - Evidence:
    - 本轮第一次 `Prod Rate` 创建超时后，列表仍出现 `Prod Rate 20260402-082123`
    - `chatCompletion=false` 的 PATCH 也出现过相同模式：请求阶段超时，但随后详情读取显示字段已更新

## 风险项

- `/v1/chat/completions` 的控制基线使用了一个 `/v1/models` 返回可见、但聊天路由返回 `404 model_not_found` 的模型 ID。
  - 这不影响本轮权限、状态和限流结论，因为这些用例关注的是鉴权层是否先返回 `403/401/429`。
  - 但它说明“模型列表可见”与“聊天路由可解析”之间仍存在契约差异，建议另开模型路由专项回归。

## Not Run

- API-605 / API-1004：`logAccess=false` 与 MCP logs tools
- API-1001 / API-1002 / API-1003：MCP 权限映射
- API-405 / API-407：生产环境下 `rateLimit<=0`、非法 IP/CIDR 的输入校验

未执行原因：
- 本轮优先覆盖用户明确关心的后端主链路和高风险运行时鉴权。
- MCP 工具链验证需要额外 JSON-RPC / MCP 会话编排，本轮未继续展开。
- 非法输入校验在本地已验证过，生产侧本轮未重复扩大写入面。

## 最终结论

- 结论：`PARTIAL PASS`
- 本次 API Keys 后端开发的核心目标在生产环境已通过：
  - 管理面扩展字段创建、列表、详情、编辑、吊销
  - 运行时权限控制：`projectInfo` / `chatCompletion` / `imageGeneration`
  - 运行时状态控制：过期 / 吊销 / Key 级限流
  - 运行时来源控制：IP 白名单与空白名单
- 当前没有发现会直接否决本次后端功能上线的功能级失败项。
- 但存在 1 条中等级稳定性风险：部分 `POST` / `PATCH` 在生产环境会出现“后端已成功写入，但客户端请求超时”的行为，尤其会影响“创建后仅返回一次完整 key”的关键体验。

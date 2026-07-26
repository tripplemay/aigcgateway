# Backend Static Review Report — 2026-04-08

## 总体结论
后端存在多处阻断级风险，当前不建议直接上线生产。最严重问题集中在支付回调验签缺失与 API Key 权限边界不一致。

## 问题清单

### 1. [High] 支付回调未验签，可伪造成功支付通知
- 证据：
  - `src/app/api/webhooks/alipay/route.ts:30`
  - `src/app/api/webhooks/wechat/route.ts:30`
  - `src/lib/billing/payment.ts:17`
- 影响：攻击者可伪造回调触发入账，造成资金风险。
- 触发路径：对 webhook 端点发送伪造成功交易参数。

### 2. [High] API Key 权限可被 `/v1/actions/run` 与 `/v1/templates/run` 绕过
- 证据：
  - `src/lib/api/auth-middleware.ts:42`
  - `src/lib/api/auth-middleware.ts:105`
  - `src/app/api/v1/actions/run/route.ts:16`
  - `src/app/api/v1/templates/run/route.ts:19`
- 影响：`chatCompletion=false` 的 Key 仍可通过 Action/Template 间接调用模型并触发计费流程。
- 触发路径：`detectEndpoint()` 未覆盖 actions/templates，权限分支未命中。

### 3. [Medium] MCP 鉴权未执行 IP 白名单，和 REST 不一致
- 证据：
  - `src/lib/api/auth-middleware.ts:124`
  - `src/lib/mcp/auth.ts:25`
- 影响：配置 IP 白名单的 Key 在 MCP 入口仍可被非白名单来源使用。

### 4. [Medium] 限流超限分支“回滚计数”未真正执行
- 证据：
  - `src/lib/api/rate-limit.ts:73`
- 影响：超限请求可能污染计数，导致后续请求被误限。

### 5. [Medium] TPM 仅记录不校验，配置项与行为不一致
- 证据：
  - `src/lib/api/rate-limit.ts:23`
  - `src/lib/api/rate-limit.ts:109`
  - `src/lib/api/post-process.ts:137`
- 影响：实际只限制 RPM，不限制 token 吞吐。

## 评分卡
- Correctness（正确性）: 2/5
- Regression Risk（回归风险）: 2/5
- Security（安全性）: 1/5
- Reliability（可靠性）: 2/5
- Performance（性能）: 3/5
- Maintainability（可维护性）: 3/5
- Test Readiness（测试完备度）: 2/5

## 待确认事项
- webhook 是否仅用于内网/沙箱；若公网可达，风险优先级需立即提升。
- 权限模型是否要求 Action/Template 严格继承 `chatCompletion` 权限。

## 最终结论
- 加权结果：2.05/5
- 最终等级：F
- 可推进性：Not ready

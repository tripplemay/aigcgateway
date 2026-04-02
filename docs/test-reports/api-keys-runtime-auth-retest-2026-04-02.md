# API Keys 运行时鉴权重测报告

## 测试目标

在本地重建测试环境后，重新验证 API Key 运行时鉴权。

本轮按用户要求调整验证口径：

- `/v1/chat/completions`：作为主要运行时鉴权验证端点
- `/v1/models`：仅用于验证 `projectInfo` 权限

## 测试环境

- 环境：本地 Codex 测试环境
- 地址：`http://localhost:3099`
- 启动方式：`bash scripts/test/codex-setup.sh`
- 就绪检查：`GET /v1/models` 返回 `200`
- 管理员账号：`admin@aigc-gateway.local / admin123`
- 本轮测试项目：`Codex Runtime Auth Final Retest 20260402`

## 测试准备

1. 使用管理员账号登录
2. 创建隔离测试项目
3. 通过管理员手动充值接口为测试项目充值 `$50`
4. 创建不同权限 / 状态 / 配置的测试 Key
5. 对聊天端点统一使用：

```json
{
  "model": "openai/gpt-4o-mini",
  "messages": [
    { "role": "user", "content": "Say ok" }
  ],
  "max_tokens": 8
}
```

## 基线现象

当 Key 通过本地鉴权后，`/api/v1/chat/completions` 当前会继续落到上游 provider，并返回：

```json
{
  "error": {
    "type": "authentication_error",
    "code": "auth_failed",
    "message": "Missing Authentication header"
  }
}
```

因此，本轮判断标准如下：

- 若本地鉴权生效，应优先返回本地 `401 / 403 / 429`
- 若仍返回上面的 provider 侧 `auth_failed`，说明本地未拦截，请求已经错误放行到上游

## 测试结果

### 通过项

- `projectInfo=false` 已生效
  - 端点：`GET /v1/models`
  - 结果：`403`
  - 返回：`API key lacks projectInfo permission`

- `chatCompletion=false` 已生效
  - 端点：`POST /v1/chat/completions`
  - 结果：`403`
  - 返回：`API key lacks chatCompletion permission`

- 过期 Key 已生效
  - 端点：`POST /v1/chat/completions`
  - 过期前：请求已通过本地鉴权并继续落到 provider，返回 provider 侧 `401 auth_failed`
  - 过期后：本地返回 `401 invalid_api_key`
  - 返回：`API key has expired`

- 已撤销 Key 已生效
  - 端点：`POST /v1/chat/completions`
  - DELETE 撤销返回：`200`
  - 撤销后聊天请求返回：`401 invalid_api_key`
  - 返回：`API key has been revoked`

### 失败项

- IP 白名单未生效
  - 用例 1：`ipWhitelist=["1.2.3.4"]`
  - 预期：本地返回 `403`
  - 实际：`POST /v1/chat/completions` 返回 provider 侧 `401 auth_failed`
  - 结论：请求未被本地白名单逻辑拦截

- 空白名单 `[]` 未按“拒绝全部”语义执行
  - 预期：本地拒绝
  - 实际：`POST /v1/chat/completions` 返回 provider 侧 `401 auth_failed`
  - 结论：当前实现把空数组当成“无白名单限制”处理

- Key 级 RPM 限流未生效
  - 用例：`rateLimit=2`
  - 连续 3 次调用 `POST /v1/chat/completions`
  - 预期：第 3 次返回 `429`
  - 实际：
    - 第 1 次：provider 侧 `401 auth_failed`
    - 第 2 次：provider 侧 `401 auth_failed`
    - 第 3 次：provider 侧 `401 auth_failed`
  - 结论：本地 RPM 拦截没有触发

## 结果汇总

| 项目 | 端点 | 结果 |
|---|---|---|
| `projectInfo=false` | `/v1/models` | PASS |
| `chatCompletion=false` | `/v1/chat/completions` | PASS |
| 过期 Key | `/v1/chat/completions` | PASS |
| 已撤销 Key | `/v1/chat/completions` | PASS |
| 非命中 IP 白名单 | `/v1/chat/completions` | FAIL |
| 空白名单 `[]` | `/v1/chat/completions` | FAIL |
| `rateLimit=2` 第三次限流 | `/v1/chat/completions` | FAIL |

## 风险项

- 当前运行时鉴权已部分恢复，但还不完整
- 已修复的是“权限 / 状态”类拦截：
  - `projectInfo`
  - `chatCompletion`
  - `expired`
  - `revoked`
- 仍未修复的是“来源 / 配额”类拦截：
  - IP 白名单
  - 空白名单语义
  - Key 级 RPM

这意味着：

- 某些被禁用的 Key 已不会继续访问核心聊天接口
- 但来源控制和调用频率控制仍然不能验收通过

## 最终结论

本轮运行时鉴权重测结论为：`部分通过`。

和上一轮相比，关键进展是：

- `/v1/chat/completions` 上的 `chatCompletion=false` 已经真的拦住
- 过期与撤销也已在聊天端点前置生效
- `/v1/models` 上的 `projectInfo=false` 已生效

当前仍阻塞验收的运行时问题只剩三项：

- IP 白名单不生效
- 空白名单 `[]` 不按“拒绝全部”执行
- Key 级 RPM 限流不生效


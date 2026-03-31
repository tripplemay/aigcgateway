# 生产环境验证测试报告

Summary
- Scope:
  - 生产环境公开访问与开发者最小主链路验证
  - 只读验证：`/`、`/docs`、`/v1/models`
  - 受控写入验证：注册、登录、创建项目、创建 API Key
  - 低风险业务边界验证：零余额拦截、无效 Key、吊销 Key 后调用、空交易记录
- Documents:
  - `AGENTS.md`
  - 生产测试开关：
    - `PRODUCTION_STAGE=RND`
    - `PRODUCTION_DB_WRITE=ALLOW`
    - `HIGH_COST_OPS=ALLOW`
- Environment:
  - 生产站点：`https://aigc.guangai.ai`
  - 本轮未触发支付、Webhook、删除或批量修改
- Result totals:
  - PASS：9
  - FAIL：0
  - BLOCKED / DEGRADED：5

## 测试范围和源文档

- 生产环境公开页面与公开 API
- 开发者账号注册 / 登录
- 项目创建
- API Key 创建
- 零余额下 `/v1/chat/completions` 的计费拦截

## 执行日志或命令摘要

Command / Tool:
- `curl -sS -i https://aigc.guangai.ai/docs`
Environment:
- 生产环境
Observed Status:
- `200`
Observed Body / Key Fields:
- HTML 正常返回
Observed Side Effects:
- 无

Command / Tool:
- `curl -sS -i https://aigc.guangai.ai/v1/models`
Environment:
- 生产环境
Observed Status:
- `200`
Observed Body / Key Fields:
- 返回模型列表
- provider 分布：
  - `DeepSeek=2`
  - `OpenRouter=290`
  - `智谱 AI=10`
  - `火山引擎方舟=2`
  - `硅基流动=83`
Observed Side Effects:
- 无

Command / Tool:
- `POST /api/auth/register`
- `POST /api/auth/login`
Environment:
- 生产环境
Observed Status:
- `register` 请求超时
- `login` 成功
Observed Body / Key Fields:
- 登录成功返回：
  - `email=codex.prod.test.1774946265@example.com`
  - `role=DEVELOPER`
Observed Side Effects:
- 说明注册实际已落库，但注册接口响应存在超时

Command / Tool:
- `POST /api/projects`
Environment:
- 生产环境
Observed Status:
- `201`
Observed Body / Key Fields:
- 创建项目成功：
  - `id=cmned77rg082arnnsq5xfsnlm`
  - `name=Codex Prod Test Project`
  - `balance=0`
Observed Side Effects:
- 创建了测试项目记录

Command / Tool:
- `POST /api/projects/:id/keys`
Environment:
- 生产环境
Observed Status:
- `201`
Observed Body / Key Fields:
- 创建 API Key 成功：
  - `id=cmned85ch083lrnnsx1mdx30b`
  - `prefix=pk_03060`
Observed Side Effects:
- 创建了测试 API Key

Command / Tool:
- `GET /api/projects/:id/balance`
Environment:
- 生产环境
Observed Status:
- `200`
Observed Body / Key Fields:
- `{"balance":0,"alertThreshold":null,"lastRecharge":null}`
Observed Side Effects:
- 无

Command / Tool:
- `POST /v1/chat/completions`
Environment:
- 生产环境
Observed Status:
- `402`
Observed Body / Key Fields:
- `code=insufficient_balance`
- `Current balance: $0.000000`
Observed Side Effects:
- 未触发真实成功调用

Command / Tool:
- `GET /api/projects/:id/transactions`
Environment:
- 生产环境
Observed Status:
- `200`
Observed Body / Key Fields:
- `data=[]`
- `pagination.total=0`
Observed Side Effects:
- 无

Command / Tool:
- `POST /v1/chat/completions` with invalid API key
Environment:
- 生产环境
Observed Status:
- `401`
Observed Body / Key Fields:
- `code=invalid_api_key`
Observed Side Effects:
- 无

Command / Tool:
- `DELETE /api/projects/:id/keys/:keyId`
- `POST /v1/images/generations` with revoked key
Environment:
- 生产环境
Observed Status:
- 删除请求超时
- 图片接口随后返回 `401`
Observed Body / Key Fields:
- `message="API key has been revoked"`
Observed Side Effects:
- 说明 Key 实际已被吊销

## 测试结果

### PASS

- PASS-001 生产站点 `/docs` 可访问，返回 `200`
- PASS-002 生产 `GET /v1/models` 可访问，返回 `200`
- PASS-003 生产环境公开模型列表包含多来源数据，至少有 `DeepSeek`、`OpenRouter`、`智谱 AI`、`火山引擎方舟`、`硅基流动`
- PASS-004 开发者登录成功，JWT 鉴权链路正常
- PASS-005 开发者项目创建成功
- PASS-006 API Key 创建成功，零余额下模型调用正确返回 `402 insufficient_balance`
- PASS-007 项目交易记录空状态正常，`GET /api/projects/:id/transactions` 返回空数组与分页信息
- PASS-008 无效 API Key 调用文本接口正确返回 `401 invalid_api_key`
- PASS-009 吊销后的 API Key 调用图片接口正确返回 `401`，错误信息为 `API key has been revoked`

### BLOCKED / DEGRADED

- DEGRADED-001 `POST /api/auth/register` 请求超时
  - 现象：
    - 注册请求在 20 秒内未返回
    - 但随后可用同一账号成功登录
  - 推断：
    - 注册实际成功落库，但响应链路存在超时或上游代理问题

- DEGRADED-002 `GET /api/projects/:id/keys` 列表请求超时
  - 现象：
    - 创建 Key 成功
    - 但随后的 Key 列表读取在 20 秒内未返回
  - 推断：
    - 该接口在生产环境存在稳定性问题，需进一步排查

- DEGRADED-003 `GET /api/projects` 项目列表请求超时
  - 现象：
    - 使用同一开发者 token 访问项目列表，20 秒内未返回
  - 推断：
    - 项目列表接口在生产环境存在稳定性问题

- DEGRADED-004 `GET /api/projects/:id/logs` 日志列表请求超时 / SSL 异常
  - 现象：
    - 一次请求返回 `SSL_ERROR_SYSCALL`
    - 一次请求在 20 秒内未返回
  - 推断：
    - 日志接口链路存在稳定性或网络层问题

- DEGRADED-005 `DELETE /api/projects/:id/keys/:keyId` 响应超时，但副作用已生效
  - 现象：
    - 删除请求自身超时
    - 但随后使用同一 API Key 调用图片接口，已返回 `API key has been revoked`
  - 推断：
    - 吊销逻辑已执行，但响应链路存在稳定性问题

- BLOCKED-003 本轮未覆盖管理员侧与支付链路
  - 原因：
    - 本轮按“最小必要副作用”原则执行
    - 未触发支付、Webhook、批量修改、删除等高风险动作

## 缺陷列表

- [Medium] `POST /api/auth/register` 在生产环境响应超时，但账户已实际创建
  - 影响：
    - 用户端可能误判注册失败并重复提交
  - 复现路径：
    - 使用新邮箱调用 `POST /api/auth/register`
    - 请求超时后，使用同账号 `POST /api/auth/login` 可成功登录

- [Medium] `GET /api/projects/:id/keys` 在生产环境读取超时
  - 影响：
    - 控制台或开发者端读取 Key 列表可能不稳定
  - 复现路径：
    - 创建项目
    - 创建 API Key
    - 再请求 Key 列表，20 秒内未返回

- [Medium] `GET /api/projects` 在生产环境读取超时
  - 影响：
    - 开发者项目列表页可能无法稳定加载

- [Medium] `GET /api/projects/:id/logs` 在生产环境读取不稳定
  - 影响：
    - 日志页或日志 API 观察能力不稳定

- [Medium] `DELETE /api/projects/:id/keys/:keyId` 响应超时，但后端状态已变更
  - 影响：
    - 前端或调用方可能误判吊销失败并重复操作

## 结论

- 生产环境当前可完成公开访问、开发者登录、项目创建、API Key 创建、零余额拦截、无效 Key 拦截以及吊销后 Key 拦截，核心最小链路可用。
- 生产环境存在多处接口稳定性问题，至少包括：
  - 注册响应超时
  - 项目列表读取超时
  - Key 列表读取超时
  - 日志列表读取不稳定
  - Key 吊销响应超时
- 本轮未执行支付、充值、真实成功模型调用、管理员写操作和删除型数据清理。

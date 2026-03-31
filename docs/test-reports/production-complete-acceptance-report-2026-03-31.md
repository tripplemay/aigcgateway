# 生产环境完整验收报告

Summary
- Scope:
  - 生产环境当前版本已计划实现需求的可执行验收
  - 公开接口、开发者主链路、管理员关键接口、模型同步结果
- Documents:
  - [features.json](/Users/yixingzhou/project/aigcgateway/features.json)
  - [progress.json](/Users/yixingzhou/project/aigcgateway/progress.json)
  - [production-validation-test-report-2026-03-31.md](/Users/yixingzhou/project/aigcgateway/docs/test-reports/production-validation-test-report-2026-03-31.md)
  - 当前 `AGENTS.md` 生产测试开关：
    - `PRODUCTION_STAGE=RND`
    - `PRODUCTION_DB_WRITE=ALLOW`
    - `HIGH_COST_OPS=ALLOW`
- Environment:
  - 生产站点：`https://aigc.guangai.ai`
  - 使用生产管理员账号与一次性开发者测试账号
- Result totals:
  - PASS：10
  - FAIL：1
  - DEGRADED / BLOCKED：6

## 验收范围

本轮重点围绕 `progress.json` 中当前目标：
- `P1.5 模型同步引擎完善 — 7 家服务商专属适配器 + pricingOverrides + 跨服务商去重`

以及 `features.json` 中 `F501-F512` 对应能力进行生产验收。

## 通过项

- PASS-001 生产站点公开访问正常，`/docs` 返回 `200`
- PASS-002 `GET /v1/models` 返回 `200` 且返回大规模模型列表
- PASS-003 生产公开模型来源已覆盖多家服务商：
  - `DeepSeek`
  - `OpenRouter`
  - `智谱 AI`
  - `火山引擎方舟`
  - `硅基流动`
- PASS-004 开发者注册后的登录链路正常
- PASS-005 开发者项目创建成功
- PASS-006 开发者 API Key 创建成功
- PASS-007 零余额下 `POST /v1/chat/completions` 正确返回 `402 insufficient_balance`
- PASS-008 无效 API Key 调用正确返回 `401 invalid_api_key`
- PASS-009 吊销后的 API Key 调用图片接口正确返回 `401`，错误为 `API key has been revoked`
- PASS-010 管理员登录与 `GET /api/admin/sync-status` 正常，可读到最近一次同步结果

## 失败项

- FAIL-001 跨服务商同模型去重在生产环境未达到验收预期
  - Requirement:
    - `F510` 要求“同一底层模型只创建一个 Model，多个 Channel”
  - Evidence:
    - 管理员接口搜索 `gpt-4o` 时，生产上同时存在：
      - `openai/gpt-4o`
      - `openrouter/gpt-4o`
    - `openai/gpt-4o` 当前只有 `OpenAI` 通道
    - `openrouter/gpt-4o` 当前只有 `OpenRouter` 通道
    - 没有聚合到同一个模型分组下
  - Impact:
    - 该项核心验收未通过

## 降级 / 阻塞项

- DEGRADED-001 `POST /api/auth/register` 响应超时，但账户实际已创建
- DEGRADED-002 `GET /api/projects` 项目列表请求超时
- DEGRADED-003 `GET /api/projects/:id/keys` 请求超时
- DEGRADED-004 `GET /api/projects/:id/logs` 请求超时 / SSL 异常
- DEGRADED-005 `DELETE /api/projects/:id/keys/:keyId` 响应超时，但副作用已生效
- BLOCKED-001 管理员全量 `GET /api/admin/models-channels` 与 `POST /api/admin/sync-models` 在生产环境多次超时，限制了全量数据面的稳定验收

## 同步状态结论

从生产 `GET /api/admin/sync-status` 可读到：
- 最近同步时间：`2026-03-31T04:00:15.466Z`
- 成功的 provider：
  - `deepseek`
  - `openrouter`
  - `siliconflow`
  - `volcengine`
  - `zhipu`
- 失败的 provider：
  - `openai`，错误：`OpenAI /models returned 401`
  - `anthropic`，错误：`Anthropic /models returned 401`

这说明生产环境并不是“5 家直连全失败”的状态，已有多家 provider 实际同步成功并对外提供模型。

## 完整验收结论

当前版本不能判定为“全部计划需求已通过完整生产验收”。

原因有两类：
- 一类是明确失败：
  - 跨服务商同模型去重未达到 `F510` 预期
- 一类是生产接口稳定性问题：
  - 注册、项目列表、Key 列表、日志列表、Key 吊销响应、管理员全量接口存在超时或不稳定

因此，本轮结论应为：
- 核心功能大部分可用
- 但完整生产验收结果是 `部分通过`
- 当前至少有 1 个明确业务验收失败项和多项生产稳定性问题，不能给出“全部通过”结论

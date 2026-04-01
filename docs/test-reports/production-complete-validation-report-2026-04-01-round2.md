# 生产环境完整验证报告（普通用户 + 管理员）

## 测试目标

- 在生产环境验证普通用户核心功能是否可用
- 在生产环境验证管理员核心功能是否可用
- 验证模型同步相关关键能力当前是否可正常工作

## 测试环境

- 环境：生产环境
- 站点：`https://aigc.guangai.ai`
- 执行日期：`2026-04-01`
- 生产测试开关：
  - `PRODUCTION_STAGE=RND`
  - `PRODUCTION_DB_WRITE=ALLOW`
  - `HIGH_COST_OPS=ALLOW`

## 测试范围

- 普通用户：
  - 站点可访问性
  - 注册
  - 登录
  - 用户资料读取
  - 创建项目
  - 创建 API Key
  - 项目列表 / Key 列表 / 余额 / 交易记录读取
  - 公开模型列表读取
  - 零余额调用拦截
- 管理员：
  - 登录
  - Provider 列表读取
  - ProviderConfig 读取
  - `sync-status` 读取
  - 手动触发 `sync-models`
  - `channels` / `models-channels` 读取
  - 同步关键结果核对

## 执行步骤概述

1. 验证首页、文档页、公开模型接口可访问
2. 使用新建普通用户账号完成注册、登录、创建项目、创建 Key、读取项目相关数据
3. 使用零余额项目调用 `POST /api/v1/chat/completions` 验证余额拦截
4. 使用管理员账号读取 Provider / Config / Sync 状态
5. 触发管理员手动同步，核对同步结果和通道统计
6. 抽样核对 DeepSeek、Volcengine、SiliconFlow 的生产数据表现

## 通过项

- 生产站点可访问
  - `GET /` 返回 `200`
  - `GET /docs` 返回 `200`
  - `GET /api/v1/models` 返回 `200`
- 普通用户主链路通过
  - 注册成功，返回新用户对象
  - 登录成功，返回 `DEVELOPER` token
  - `GET /api/auth/profile` 正常
  - `POST /api/projects` 成功创建项目
  - `POST /api/projects/:id/keys` 成功创建 API Key
  - `GET /api/projects` 正常返回项目列表
  - `GET /api/projects/:id/keys` 正常返回 Key 列表
  - `GET /api/projects/:id/balance` 正常返回余额 `0`
  - `GET /api/projects/:id/transactions` 正常返回空交易记录
  - 使用新创建 API Key 调用 `POST /api/v1/chat/completions`，正确返回 `insufficient_balance`
- 管理员主链路通过
  - 管理员登录成功
  - `GET /api/admin/providers` 正常返回 7 家 Provider
  - `GET /api/admin/sync-status` 正常返回同步结果
  - `GET /api/admin/channels` 正常返回通道列表
  - `GET /api/admin/models-channels` 正常返回模型与通道聚合视图
  - `POST /api/admin/sync-models` 本轮单次触发返回 `200`
  - 连续 3 次 `POST /api/admin/sync-models` 均返回 `200`
- 模型同步关键数据当前通过
  - `volcengine` 的 `ProviderConfig.staticModels` 已落库，数量为 `14`
  - `deepseek` 的 `ProviderConfig.docUrls` 已落库
  - 最新一次 `sync-status` 中：
    - `deepseek.apiModels=2`
    - `deepseek.aiEnriched=2`
    - `volcengine.apiModels=14`
    - `volcengine.modelCount=14`
    - `siliconflow.apiModels=95`
  - `GET /api/v1/models` 当前返回总模型数 `441`
  - 公开模型来源包含：
    - `DeepSeek`
    - `OpenRouter`
    - `智谱 AI`
    - `火山引擎方舟`
    - `硅基流动`
  - `火山引擎方舟` 当前公开可见模型数为 `14`
  - DeepSeek 在公开模型列表里已显示非零价格：
    - `input_per_1m=0.336`
    - `output_per_1m=0.504`

## 失败项

### FAIL-001 SiliconFlow 文档提取配置未生效

- 现象：
  - `GET /api/admin/providers/:id/config` 中，`siliconflow.docUrls=null`
- 预期：
  - 按 PRD / seed 设计，硅基流动应配置文档地址用于第 2 层 AI 补全
- 影响：
  - 生产上无法证明 SiliconFlow 第 2 层文档提取链路已正确配置

### FAIL-002 SiliconFlow 价格补全未生效

- 现象：
  - 最新 `sync-status` 中 `siliconflow.aiEnriched=0`
  - `GET /api/v1/models` 中，公开可见的 `95` 个硅基流动模型价格仍全部为 `0`
- 预期：
  - 至少部分缺失价格应由 AI 文档提取补全
- 影响：
  - 硅基流动定价展示不完整，当前仍不满足“AI 补充缺失价格”的目标

### FAIL-003 OpenAI / Anthropic 生产直连仍未可用

- 现象：
  - 最新 `sync-status` 中：
    - `openai.apiModels=0`，错误为 `OpenAI /models returned 401`
    - `anthropic.apiModels=0`，错误为 `Anthropic /models returned 401`
  - 管理员通道列表中：
    - `OpenAI` 共 `8` 条通道，当前均为 `DISABLED`
    - `Anthropic Claude` 共 `3` 条通道，当前均为 `DISABLED`
- 预期：
  - 直连 Provider 应能正常从 `/models` 拉取并形成可用通道
- 影响：
  - 直连 OpenAI / Anthropic 功能当前仍不可用
  - 多 Provider 聚合能力也会受样本不足影响

## 风险项

- `zhipu` 当前同步结果中仍出现 `overrides=2`
  - 说明生产上仍存在运营覆盖数据
  - 这不一定是缺陷，但会影响“纯 API / AI 补全路径”的可观察性
- 当前仅执行了最小必要生产写入
  - 未覆盖支付、充值、删除、批量修改、外部通知等高风险路径
- 本轮未复现 `sync-models` 的 `504`
  - 但此前历史回归出现过 nginx 超时
  - 当前只能判定为“本轮 3 次未复现”，不能判定风险完全消失

## 未执行项

- 未执行支付 / 充值 / 扣费 / 结算
  - 原因：属于高风险真实业务操作，本轮不纳入最小必要验证
- 未执行删除数据、批量修改、外部通知、Webhook、短信邮件
  - 原因：不属于本轮完整功能验证的必要范围
- 未执行真实成功模型调用
  - 原因：普通用户测试项目余额为 `0`，本轮仅验证余额拦截，不做充值

## 证据

- 公开接口与页面
  - `GET https://aigc.guangai.ai/`
  - `GET https://aigc.guangai.ai/docs`
  - `GET https://aigc.guangai.ai/api/v1/models`
- 普通用户链路
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `GET /api/auth/profile`
  - `POST /api/projects`
  - `POST /api/projects/:id/keys`
  - `GET /api/projects`
  - `GET /api/projects/:id/keys`
  - `GET /api/projects/:id/balance`
  - `GET /api/projects/:id/transactions`
  - `POST /api/v1/chat/completions`
- 管理员链路
  - `POST /api/auth/login`
  - `GET /api/admin/providers`
  - `GET /api/admin/providers/:id/config`
  - `GET /api/admin/sync-status`
  - `POST /api/admin/sync-models`
  - `GET /api/admin/channels`
  - `GET /api/admin/models-channels`

## 最终结论

本轮生产环境“普通用户功能 + 管理员功能”验证结论为：**部分通过**。

- 普通用户核心主链路本轮通过，站点、注册、登录、建项目、建 Key、余额拦截都正常。
- 管理员核心主链路本轮通过，登录、读取 Provider / Config / Channel / Sync 状态、手动同步都可正常执行。
- 但当前仍不能签收为“全部通过”，因为：
  - SiliconFlow 的 AI 文档提取配置与价格补全仍未生效
  - OpenAI / Anthropic 直连 `/models` 仍然返回 `401`

当前最准确的验收状态应为：**生产核心功能可用，但模型同步相关仍有明确失败项待继续处理。**

# 生产环境回归报告（Round 6）

## 测试目标

- 对最新生产更新执行一轮回归验证
- 覆盖普通用户关键功能与管理员关键功能
- 重点复核模型同步相关能力当前状态

## 测试环境

- 环境：生产环境
- 站点：`https://aigc.guangai.ai`
- 执行日期：`2026-04-01`
- 生产测试开关：
  - `PRODUCTION_STAGE=RND`
  - `PRODUCTION_DB_WRITE=ALLOW`
  - `HIGH_COST_OPS=ALLOW`

## 测试范围

- 公开访问：
  - 首页
  - `GET /api/v1/models`
- 普通用户：
  - 注册
  - 登录
  - 用户资料读取
  - 创建项目
  - 创建 API Key
  - 零余额模型调用拦截
- 管理员：
  - 登录
  - `providers`
  - `provider config`
  - `sync-status`
  - `channels`
  - `sync-models`

## 执行步骤概述

1. 验证站点和公开模型接口可访问
2. 注册新的普通用户并执行最小主链路
3. 管理员登录并检查同步状态、Provider 配置和通道状态
4. 触发手动同步，验证返回结果和同步状态是否更新

## 通过项

- 站点可用
  - `GET /` 返回 `200`
  - `GET /api/v1/models` 返回 `200`
- 普通用户主链路通过
  - 注册成功
  - 登录成功
  - `GET /api/auth/profile` 正常
  - `POST /api/projects` 成功
  - `POST /api/projects/:id/keys` 成功
  - 使用新建 API Key 调用 `POST /api/v1/chat/completions`，正确返回 `insufficient_balance`
- 管理员基础能力通过
  - 管理员登录成功
  - `GET /api/admin/providers` 正常
  - `GET /api/admin/providers/:id/config` 正常
  - `GET /api/admin/channels` 正常
  - `GET /api/admin/sync-status` 正常
- 同步配置与公开数据有新增进展
  - `deepseek.docUrls` 已存在
  - `volcengine.staticModels` 已存在且数量为 `14`
  - `volcengine.docUrls` 已存在
  - `siliconflow.docUrls` 已存在
  - `GET /api/v1/models` 当前总数为 `453`
  - 公开来源包含：
    - `DeepSeek`
    - `OpenAI`
    - `OpenRouter`
    - `智谱 AI`
    - `火山引擎方舟`
    - `硅基流动`
  - `火山引擎方舟` 当前公开可见模型数为 `14`
  - DeepSeek 当前有 `2` 个公开模型展示非零价格
- 管理员通道统计当前状态
  - 总通道数 `524`
  - `ACTIVE=453`
  - `DISABLED=71`
  - `OpenAI` 通道 `17` 条，其中 `ACTIVE=3`、`DISABLED=14`
  - `火山引擎方舟` 通道 `14` 条，均为 `ACTIVE`
  - `硅基流动` 通道 `110` 条，其中 `ACTIVE=95`

## 失败项

### FAIL-001 手动同步仍返回 504

- 复现步骤：
  1. 管理员登录
  2. 调用 `POST /api/admin/sync-models`
- 实际结果：
  - 本轮请求返回 `504`
  - 随后查询 `GET /api/admin/sync-status`，`lastSyncTime` 没有更新，仍停留在 `2026-04-01T02:47:11.257Z`
- 预期结果：
  - 手动同步应返回 `200`
  - `sync-status` 应刷新到本次触发时间
- 影响范围：
  - 管理员手动同步链路仍不稳定
  - 本轮不能确认同步任务是否成功执行

### FAIL-002 SiliconFlow 价格补全仍未生效

- 实际结果：
  - `sync-status` 中 `siliconflow.aiEnriched=0`
  - 公开侧 `95` 个 `硅基流动` 模型价格仍全部为 `0`
- 预期结果：
  - 至少部分模型价格应由 AI 文档提取补全
- 影响范围：
  - 开发者侧模型价格展示不完整

### FAIL-003 Anthropic 仍未恢复

- 实际结果：
  - `sync-status` 中 `anthropic.apiModels=0`
  - 错误为 `Anthropic /models returned 401`
  - `modelCount=0`
- 预期结果：
  - Anthropic 直连模型应可同步并形成可用模型

## 风险项

- OpenAI 当前虽然 `/models` 仍返回 `401`，但 `aiEnriched=7`，并新增了 `12` 个模型、`17` 条通道
  - 这说明第 2 层 AI 文档提取已经开始直接补模型
  - 但其中包含 `tts`、`whisper` 等非本期目标模型，存在过滤口径偏差风险
- `zhipu` 当前 `aiEnriched=14`、`modelCount=25`
  - 相比此前结果明显扩大
  - 需要后续确认是否引入了不应公开的文档提取模型
- 本轮未执行支付、充值、外部通知、删除等高风险动作
  - 这些仍不在本轮最小必要回归范围内

## 证据

- 公开接口
  - `GET https://aigc.guangai.ai/`
  - `GET https://aigc.guangai.ai/api/v1/models`
- 普通用户
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `GET /api/auth/profile`
  - `POST /api/projects`
  - `POST /api/projects/:id/keys`
  - `POST /api/v1/chat/completions`
- 管理员
  - `POST /api/auth/login`
  - `GET /api/admin/providers`
  - `GET /api/admin/providers/:id/config`
  - `GET /api/admin/channels`
  - `GET /api/admin/sync-status`
  - `POST /api/admin/sync-models`

## 最终结论

本轮生产回归结论为：**部分通过**。

- 普通用户关键主链路正常。
- 管理员读取类功能正常。
- 模型同步数据有新增进展：
  - OpenAI 已开始通过 AI 文档提取补出模型
  - SiliconFlow 的 `docUrls` 配置已落库
  - Volcengine 维持 `14` 个可见模型
- 但仍不能判定为通过，因为：
  - `POST /api/admin/sync-models` 本轮再次返回 `504`
  - SiliconFlow 价格补全仍无效果
  - Anthropic 仍然不可用

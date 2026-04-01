# 生产环境回归报告（Round 7）

## 测试目标

- 对最新生产更新执行一轮回归验证
- 覆盖普通用户核心功能与管理员核心功能
- 重点复核模型同步链路当前状态

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
  - 创建项目
  - 创建 API Key
  - 零余额模型调用拦截
- 管理员：
  - 登录
  - `sync-status`
  - `channels`
  - `sync-models`

## 执行步骤概述

1. 验证站点与公开模型接口可访问
2. 检查当前同步状态与公开模型统计
3. 注册新普通用户并走最小主链路
4. 检查管理员通道统计
5. 手动触发同步并验证状态是否刷新

## 通过项

- 站点与公开接口正常
  - `GET /` 返回 `200`
  - `GET /api/v1/models` 返回 `200`
- 普通用户主链路通过
  - 注册成功
  - 登录成功
  - 创建项目成功
  - 创建 API Key 成功
  - 使用新建 Key 调用 `POST /api/v1/chat/completions`，正确返回 `insufficient_balance`
- 管理员读接口通过
  - 管理员登录成功
  - `GET /api/admin/sync-status` 正常
  - `GET /api/admin/channels` 正常
- 手动同步本轮通过
  - `POST /api/admin/sync-models` 本轮返回 `200`
  - `sync-status.lastSyncTime` 已刷新到 `2026-04-01T03:45:20.155Z`
- 当前公开数据与通道状态
  - 公开模型总数 `480`
  - 公开来源包含：
    - `DeepSeek`
    - `OpenAI`
    - `OpenRouter`
    - `智谱 AI`
    - `火山引擎方舟`
    - `硅基流动`
  - `OpenAI` 当前公开可见模型数 `8`
  - `火山引擎方舟` 当前公开可见模型数 `15`
  - `硅基流动` 当前公开可见模型数 `95`
  - DeepSeek 当前有 `2` 个公开模型展示非零价格
  - 管理员通道统计：
    - 总通道数 `525`
    - `ACTIVE=480`
    - `DEGRADED=1`
    - `DISABLED=44`
    - `OpenAI`：`ACTIVE=8`、`DISABLED=9`
    - `火山引擎方舟`：`ACTIVE=15`、`DISABLED=0`
    - `硅基流动`：`ACTIVE=95`

## 失败项

### FAIL-001 SiliconFlow 价格补全仍未生效

- 实际结果：
  - `sync-status` 中 `siliconflow.aiEnriched=0`
  - 公开侧 `95` 个 `硅基流动` 模型价格仍全部为 `0`
- 预期结果：
  - 至少部分模型价格应由 AI 文档提取补全

### FAIL-002 Anthropic 仍不可用

- 实际结果：
  - `sync-status` 中 `anthropic.apiModels=0`
  - 错误为 `Anthropic /models returned 401`
  - `modelCount=0`
- 预期结果：
  - Anthropic 直连模型应能正常同步

## 风险项

### RISK-001 OpenAI 统计口径不一致

- `sync-status` 中：
  - `openai.aiEnriched=7`
  - `openai.modelCount=3`
- 但当前可见数据里：
  - 公开侧 `OpenAI` 模型数为 `8`
  - 管理员通道里 `OpenAI ACTIVE=8`
- 这说明同步结果统计与最终落库/展示口径存在不一致，需要继续核对。

### RISK-002 Volcengine 数量从 14 增长到 15

- 本轮 `sync-status` 中 `volcengine.modelCount=15`
- 公开侧 `火山引擎方舟` 也从此前 `14` 增长到 `15`
- 当前无法确认这是预期新增，还是同步口径漂移。

### RISK-003 OpenAI 第 2 层补模型范围可能过宽

- `sync-status` 里的 `newModels` 历史结果已包含：
  - `tts-1`
  - `tts-1-hd`
  - `whisper-1`
- 这些不属于本期重点的 chat / image 模型范围，存在过滤规则偏差风险。

## 证据

- 公开接口
  - `GET https://aigc.guangai.ai/`
  - `GET https://aigc.guangai.ai/api/v1/models`
- 普通用户
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/projects`
  - `POST /api/projects/:id/keys`
  - `POST /api/v1/chat/completions`
- 管理员
  - `POST /api/auth/login`
  - `GET /api/admin/sync-status`
  - `GET /api/admin/channels`
  - `POST /api/admin/sync-models`

## 最终结论

本轮生产回归结论为：**部分通过**。

- 普通用户关键主链路正常。
- 管理员手动同步本轮恢复为可用，`sync-status` 也成功刷新。
- 但模型同步数据仍有两个明确问题和多个口径风险：
  - SiliconFlow 价格补全仍未生效
  - Anthropic 仍不可用
  - OpenAI 与 Volcengine 的模型数量口径出现异常变化，需要继续确认

# 生产环境回归报告（Round 9）

## 测试目标

- 对最新生产更新执行一轮回归验证
- 覆盖普通用户核心功能与管理员核心功能
- 复核上一轮 `502` 阻塞后站点是否恢复稳定

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
  - `GET /api/admin/sync-status`
  - `GET /api/admin/channels`
  - `POST /api/admin/sync-models`

## 执行步骤概述

1. 先确认站点和公开接口是否已从上一轮 `502` 恢复
2. 检查当前 `sync-status` 和公开模型统计
3. 注册新普通用户并走最小主链路
4. 检查管理员通道状态
5. 触发手动同步并确认 `sync-status` 刷新

## 通过项

- 站点恢复稳定
  - `GET /` 返回 `200`
  - `GET /api/v1/models` 返回 `200`
  - 管理员登录返回 `200`
- 普通用户主链路通过
  - 注册成功
  - 登录成功
  - 创建项目成功
  - 创建 API Key 成功
  - 零余额调用 `POST /api/v1/chat/completions` 正确返回 `insufficient_balance`
- 管理员主链路通过
  - `GET /api/admin/sync-status` 正常
  - `GET /api/admin/channels` 正常
  - `POST /api/admin/sync-models` 最终返回 `200`
  - `sync-status.lastSyncTime` 已刷新到 `2026-04-01T04:08:38.740Z`
- 当前公开数据
  - 总模型数 `462`
  - 公开来源包含：
    - `DeepSeek`
    - `OpenAI`
    - `OpenRouter`
    - `智谱 AI`
    - `火山引擎方舟`
    - `硅基流动`
  - `OpenAI` 当前公开可见模型数 `3`
  - `Anthropic Claude` 当前公开可见模型数 `0`
  - `火山引擎方舟` 当前公开可见模型数 `15`
  - `硅基流动` 当前公开可见模型数 `95`
  - DeepSeek 当前有 `2` 个公开模型显示非零价格
- 当前管理员通道状态
  - 总通道数 `516`
  - `ACTIVE=462`
  - `DISABLED=54`
  - `OpenAI`：`ACTIVE=3`、`DISABLED=5`
  - `Anthropic Claude`：`ACTIVE=0`、`DISABLED=3`
  - `火山引擎方舟`：`ACTIVE=15`
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
  - Anthropic 直连模型应能正常同步并形成可用模型

## 风险项

### RISK-001 手动同步成功但响应时长仍偏高

- 本轮手动同步虽然最终返回 `200`
- 但 `durationMs=213847`，约 `213.8s`
- 这说明同步链路虽已恢复可用，但仍存在明显耗时风险

### RISK-002 Volcengine 数量仍维持 15

- 当前：
  - `sync-status.volcengine.modelCount=15`
  - 公开侧 `火山引擎方舟=15`
- 与更早轮次的 `14` 相比仍然偏高
- 当前无法确认这是预期新增还是口径变化

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

- 相比上一轮阻塞，本轮站点已恢复，普通用户和管理员核心主链路都可执行。
- 手动同步本轮成功并刷新状态，说明管理员主流程已恢复。
- 但仍有两个明确问题未解决：
  - SiliconFlow 价格补全无效果
  - Anthropic 仍不可用
- 另外，同步耗时仍然偏长，Volcengine 数量口径也还需要继续观察。

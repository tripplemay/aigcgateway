# 生产环境回归报告（Round 10）

## 测试目标

- 验证生产环境最新更新后，上一轮测试中的失败项是否已修复
- 重点回归以下问题：
  - `/admin/models` 前后端数据契约不一致
  - SiliconFlow 价格补全未生效
  - Anthropic 直连模型不可用

## 测试环境

- 环境：生产环境
- 站点：`https://aigc.guangai.ai`
- 执行日期：`2026-04-01`
- 生产测试开关：
  - `PRODUCTION_STAGE=RND`
  - `PRODUCTION_DB_WRITE=ALLOW`
  - `HIGH_COST_OPS=ALLOW`
- 本次执行策略：以只读验证为主；仅执行管理员登录获取只读访问令牌

## 测试范围

- 公开访问：
  - `GET /`
  - `GET /api/v1/models`
- 管理员：
  - `POST /api/auth/login`
  - `GET /api/admin/models-channels`
  - `GET /api/admin/sync-status`
  - 浏览器登录后访问 `/admin/models`

## 执行步骤概述

1. 验证首页与公开模型接口可访问
2. 使用管理员账号登录并获取只读验证所需 token
3. 读取 `GET /api/admin/models-channels`
4. 读取 `GET /api/admin/sync-status`
5. 使用浏览器登录并打开 `/admin/models`
6. 对照上一轮失败项逐项判断

## 通过项

### PASS-001 `/admin/models` 前后端契约不一致问题已修复

- `GET /api/admin/models-channels` 当前返回：
  - 顶层结构为 `{ data: [...] }`
  - `data` 为长度 `7` 的 provider group 列表
  - provider group 样本字段包含：
    - `id`
    - `name`
    - `displayName`
    - `summary`
    - `models`
- 第一层已不再是上一轮的扁平 `ModelEntry[]`
- 浏览器登录后访问 `/admin/models`，页面实际成功渲染：
  - 标题“模型与通道”
  - 供应商分组按钮
  - “全局模型矩阵”
  - 分页与统计信息

结论：

- 上一轮“新版前端已上线、接口仍为旧契约”的问题本轮已不再复现
- `/admin/models` 当前可进入应用层并正常展示，不是只停留在 `Loading...` 壳层

## 失败项

### FAIL-001 SiliconFlow 价格补全仍未修复

- `GET /api/admin/sync-status` 的最新同步结果显示：
  - `providerName=siliconflow`
  - `apiModels=95`
  - `aiEnriched=0`
  - `modelCount=95`
- `GET /api/admin/models-channels` 中“硅基流动”分组显示：
  - `modelCount=110`
  - `activeChannels=83`
  - `disabledChannels=27`
- 抽样检查其模型价格字段，仍全部为 `0`
  - 示例：
    - `siliconflow/BAAI/bge-large-en-v1.5`
    - `siliconflow/BAAI/bge-large-zh-v1.5`
    - `siliconflow/BAAI/bge-m3`

- 实际结果：
  - AI 文档增强数仍为 `0`
  - 生产侧价格补全仍未生效

- 预期结果：
  - 至少部分 SiliconFlow 模型应被 AI 文档提取补全价格

### FAIL-002 Anthropic 直连仍未修复

- `GET /api/admin/sync-status` 的最新同步结果显示：
  - `providerName=anthropic`
  - `apiModels=0`
  - `aiEnriched=0`
  - `modelCount=0`
  - `error=API fetch failed: Anthropic /models returned 401`
- `GET /api/admin/models-channels` 中“Anthropic Claude”分组显示：
  - `modelCount=3`
  - `activeChannels=0`
  - `disabledChannels=3`
- 浏览器页面 `/admin/models` 也显示：
  - `An Anthropic Claude 3 个模型`
  - `活跃 0`
  - `3`
  - `L1 Degraded`

- 实际结果：
  - Anthropic 仍未能通过直连 API 拉取可用模型
  - 管理页面仅显示禁用状态模型

- 预期结果：
  - Anthropic 应能正常同步并形成可用通道

## 风险项

### RISK-001 手动同步耗时风险仍在

- 最新 `sync-status.lastSyncResult.durationMs=264522`
- 约 `264.5s`
- 虽然本轮未主动触发同步，但最新一次同步耗时仍明显偏高

### RISK-002 公开模型总数与管理员总数口径不同

- `GET /api/v1/models` 当前返回 `455` 条公开模型
- `/admin/models` 当前显示总计 `516`
- 该差异可能由禁用/未公开模型造成，但本轮未进一步展开核对口径定义

## 证据

- `GET https://aigc.guangai.ai/` -> `200`
- `GET https://aigc.guangai.ai/api/v1/models` -> `200`
- `POST https://aigc.guangai.ai/api/auth/login` -> `200`
- `GET https://aigc.guangai.ai/api/admin/models-channels` -> `200`
- `GET https://aigc.guangai.ai/api/admin/sync-status` -> `200`
- 浏览器登录后访问 `https://aigc.guangai.ai/admin/models`
  - 可见“模型与通道”
  - 可见“全局模型矩阵”
  - 可见 7 个供应商分组

## 最终结论

本轮生产回归结论为：**部分通过**。

- 已确认修复：
  - `/admin/models` 前后端数据契约不一致问题已修复，页面可正常渲染
- 仍未修复：
  - SiliconFlow 价格补全仍未生效
  - Anthropic 直连仍返回 `401`，不可用

因此，生产更新不能判定为“上一轮问题已全部解决”。

# 生产环境回归报告（Round 11）

## 测试目标

- 再次验证生产环境最新状态
- 复核以下上一轮结论是否稳定：
  - `/admin/models` 页面与接口契约已修复
  - SiliconFlow 价格补全仍未生效
  - Anthropic 直连仍不可用

## 测试环境

- 环境：生产环境
- 站点：`https://aigc.guangai.ai`
- 执行日期：`2026-04-01`
- 生产测试开关：
  - `PRODUCTION_STAGE=RND`
  - `PRODUCTION_DB_WRITE=ALLOW`
  - `HIGH_COST_OPS=ALLOW`
- 本次执行策略：以只读验证为主；仅执行管理员登录获取只读访问 token

## 测试范围

- `GET /`
- `GET /api/v1/models`
- `POST /api/auth/login`
- `GET /api/admin/models-channels`
- `GET /api/admin/sync-status`
- 浏览器登录后访问 `/admin/models`

## 执行步骤概述

1. 先做首页与公开模型接口 smoke
2. 使用管理员账号登录
3. 读取 `/api/admin/models-channels`
4. 读取 `/api/admin/sync-status`
5. 浏览器进入 `/admin/models` 观察真实渲染结果

## 通过项

### PASS-001 `/admin/models` 契约修复结论稳定

- `GET /api/admin/models-channels` 当前返回：
  - 顶层 `keys=['data']`
  - `data_type=list`
  - `provider_group_count=7`
  - group 样本字段包含：
    - `id`
    - `name`
    - `displayName`
    - `summary`
    - `models`
- 浏览器访问 `/admin/models` 可见：
  - “模型与通道”
  - 7 个供应商分组
  - “全局模型矩阵 516 总计”
  - 最新同步时间 `2026/4/1 17:38:19`

结论：

- `/admin/models` 前后端契约不一致问题本轮仍未复现
- 页面已稳定进入应用层并完成真实渲染

## 失败项

### FAIL-001 SiliconFlow 价格补全仍未修复

- `GET /api/admin/sync-status` 当前显示：
  - `providerName=siliconflow`
  - `apiModels=95`
  - `aiEnriched=0`
  - `modelCount=95`
- 浏览器页面中“硅基流动”分组仍显示：
  - `110 个模型`
  - `L1 Degraded`

- 实际结果：
  - AI 价格补全仍未生效

- 预期结果：
  - 至少部分 SiliconFlow 模型应完成价格补全

### FAIL-002 Anthropic 直连仍未修复

- `GET /api/admin/sync-status` 当前显示：
  - `providerName=anthropic`
  - `apiModels=0`
  - `aiEnriched=0`
  - `modelCount=0`
  - `error=API fetch failed: Anthropic /models returned 401`
- 浏览器页面中“Anthropic Claude”分组仍显示：
  - `3 个模型`
  - `L1 Degraded`

- 实际结果：
  - Anthropic 直连仍不可用

- 预期结果：
  - Anthropic 应能正常同步并形成可用通道

## 风险项

### RISK-001 公开模型数量仍在波动

- 本轮 `GET /api/v1/models` 返回 `460` 条
- 与上一轮记录的 `455` 条相比再次变化
- 当前未进一步确认是同步正常波动还是口径变化

## 证据

- `GET https://aigc.guangai.ai/` -> `200`
- `GET https://aigc.guangai.ai/api/v1/models` -> `200`
- `POST https://aigc.guangai.ai/api/auth/login` -> `200`
- `GET https://aigc.guangai.ai/api/admin/models-channels` -> `200`
- `GET https://aigc.guangai.ai/api/admin/sync-status` -> `200`
- 浏览器登录后访问 `https://aigc.guangai.ai/admin/models`

## 最终结论

本轮生产回归结论为：**部分通过，且与上一轮结论一致。**

- 已稳定确认：
  - `/admin/models` 页面与接口契约问题已修复
- 仍稳定存在：
  - SiliconFlow 价格补全未生效
  - Anthropic 直连 `401` 未修复

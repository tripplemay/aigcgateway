# 生产环境验证报告：Channel Management 重构

- 测试目标：验证 `/admin/models` 本次重构是否已正确部署到生产环境
- 测试时间：2026-04-01 16:49:52 CST
- 生产环境开关：
  - `PRODUCTION_STAGE=RND`
  - `PRODUCTION_DB_WRITE=ALLOW`
  - `HIGH_COST_OPS=ALLOW`
- 本次执行策略：只读验证
- 生产站点：`https://aigc.guangai.ai`

## 测试范围

- 公开站点可用性
- 公开模型接口可用性
- 管理员登录
- 管理员接口：
  - `GET /api/admin/models-channels`
  - `GET /api/admin/sync-status`
- `/admin/models` 生产前端资源是否已包含本次重构内容
- 前端与管理员接口数据契约是否一致

## 执行步骤概述

1. 访问 `GET https://aigc.guangai.ai/`
2. 访问 `GET https://aigc.guangai.ai/api/v1/models`
3. 使用管理员账号 `admin@aigc-gateway.local / admin123` 登录
4. 读取 `GET /api/admin/models-channels`
5. 读取 `GET /api/admin/sync-status`
6. 抓取 `GET /admin/models` 的生产 HTML
7. 抓取 `/admin/models` 对应的生产 chunk，确认重构页面资源内容
8. 对比前端期望的数据结构与生产接口实际返回结构

## 通过项

- `GET /` 返回 `200 OK`
- `GET /api/v1/models` 返回 `200 OK`
- `POST /api/auth/login` 返回 `200 OK`
- `GET /api/admin/sync-status` 返回 `200 OK`
- 生产前端资源已包含本次重构内容，`/admin/models` 页面 chunk 中可见：
  - `createChannel`
  - `filter_list`
  - `sortBy`
  - `routingEfficiency`
  - `providerHealth`
  - `globalModelMatrix`

这说明：

- 新版 Channel Management 前端页面已经部署到生产静态资源
- 至少“页面重构代码”不是没上线

## 失败项

### FAIL-001 生产前端与生产管理员接口数据契约不一致

- 生产页面 chunk 显示，前端 `/admin/models` 期望的数据结构是 `ProviderGroup[]`
  - 会访问 `prov.models`
  - 会基于 `prov.summary.*` 和 `prov.models.slice(...)` 渲染 Provider 分组卡片
- 但生产上的 `GET /api/admin/models-channels` 实际返回的是长度 `516` 的扁平 `ModelEntry[]`
  - 样本字段包含：
    - `id`
    - `name`
    - `displayName`
    - `modality`
    - `contextWindow`
    - `healthStatus`
    - `sellPrice`
    - `summary.channelCount`
    - `channels[]`
  - 不包含前端当前所依赖的 `provider group -> models[]` 层级

- 实际结果：
  - 新版前端已经上线
  - 生产接口仍是旧数据契约
  - 这会导致 `/admin/models` 新版页面在运行时拿到不符合预期的数据

- 预期结果：
  - 生产前端与生产接口应同时升级到同一契约
  - 至少应保证 `/api/admin/models-channels` 返回与前端一致的 `ProviderGroup[]`

- 严重级别：高

## 风险项

- `GET /admin/models` 在未登录态下只返回 `Loading...` 壳层，页面真实渲染依赖浏览器执行本地存储中的 token；本次未使用浏览器自动化，因此没有直接截到最终 UI，但前端 chunk 与接口返回样本已足以证明存在数据契约风险。
- `GET /api/admin/models-channels` 当前返回 `516` 条扁平 model 记录，如果前端仍按 `ProviderGroup[]` 处理，页面极可能报错或空白。

## 证据

- `GET https://aigc.guangai.ai/` -> `200`
- `GET https://aigc.guangai.ai/api/v1/models` -> `200`
- `POST https://aigc.guangai.ai/api/auth/login` -> `200`
- `GET https://aigc.guangai.ai/api/admin/models-channels` -> `200`
- `GET https://aigc.guangai.ai/api/admin/sync-status` -> `200`
- `GET https://aigc.guangai.ai/admin/models` HTML 中包含：
  - `/_next/static/chunks/app/(console)/admin/models/page-1a8e58aa67a197f8.js`
- 对应生产 chunk 中包含重构页面关键标识：
  - `createChannel`
  - `filter_list`
  - `sortBy`
  - `globalModelMatrix`
- `GET /api/admin/models-channels` 第一条样本显示为扁平 model 结构，而非 provider 分组结构

## 最终结论

本次生产验证结论：**不通过**。

原因不是“重构页面没部署”，恰恰相反，生产前端新页面已经部署；真正的问题是：

- 生产前端是新版
- 生产管理员接口还是旧契约

这属于前后端部署不一致。就本次 `/admin/models` 重构而言，当前生产环境存在高风险运行时不兼容问题，不能视为“正确上线完成”。

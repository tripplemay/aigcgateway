# 白名单硬删除批次 Production Signoff 2026-04-04

## 测试目标

对“白名单硬删除批次”做生产环境验收，确认白名单外通道不会继续残留在正式环境中。

## 测试环境

- 环境：生产环境（RND）
- 控制台：`https://aigc.guangai.ai`
- API：`https://aigc.guangai.ai/v1/`
- 账号：`codex-admin@aigc-gateway.local`

## 测试范围

- `F-DELETE-01` 白名单外通道改为物理删除
- 验证对象：
  - `OpenRouter`
  - `SiliconFlow`
  - `Zhipu`

## 执行步骤概述

1. 生产 smoke：验证 `/v1/models` 可访问、管理员登录可用。
2. 触发一次受控生产 `POST /api/admin/sync-models`。
3. 读取 `GET /api/admin/sync-status`，确认白名单 provider 同步成功，无外键删除错误。
4. 拉取 `GET /api/admin/channels?page=1&pageSize=1000`，做集合校验：
   - `OpenRouter` 是否仍有白名单外模型
   - `SiliconFlow` / `Zhipu` 是否仍有非 `TEXT/IMAGE` 模型
   - Disabled 视图中是否仍有这些残留

## 通过项

- 生产 smoke 通过：
  - `/v1/models` 返回 `84` 个模型
  - 管理员登录成功
- 生产 sync 成功：
  - `OpenRouter.success = true`
  - `SiliconFlow.success = true`
  - `Zhipu.success = true`
  - 未再出现上一轮本地发现的外键删除错误
- `OpenRouter` 验证通过：
  - 现网通道总数精确为 `27`
  - 与仓库白名单集合逐项比对后，无白名单外残留
  - `google/gemini-2.5-flash-image` 与 `openai/gpt-5-image-mini` 已不存在于生产通道列表
- `SiliconFlow` / `Zhipu` 验证通过：
  - 现网通道集合中未发现非聊天模型残留
  - 使用当前 `inferModality()/isChatModality()` 规则对生产 `realModelId` 做校验后：
    - `SiliconFlow` 无 `EMBEDDING / RERANKING / AUDIO` 残留
    - `Zhipu` 无非 `TEXT/IMAGE` 残留

## 失败项

- 无

## 风险项

- 生产环境无法直接访问数据库，因此无法像本地那样直接观测：
  - `HealthCheck` 级联删除
  - `CallLog.channelId -> null`
- 但从生产外部可观测结果看：
  - sync 成功
  - 白名单外通道未残留
  - 未出现 FK 删除报错
  - 已满足本次批次的生产验收目标

## 备注

- 本轮 `sync-status` 中 `Zhipu.disabledChannels` 返回了 `cogview-4-250304`、`glm-4.7-flash`，但这两者本身属于 `TEXT/IMAGE`，且仍存在于正式通道集合中。
- 这说明它们属于正常 reconcile/状态记录口径，不构成“白名单外残留”缺陷。

## 最终结论

本轮生产验收结果为：

- `PASS`

白名单硬删除批次已在生产环境验证通过。

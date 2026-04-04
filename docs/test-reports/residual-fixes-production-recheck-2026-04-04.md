# 遗留问题修复批次生产复验报告 2026-04-04

## 测试目标

对本轮仍未闭环的两项功能做生产环境复验：

- `F-DATA-02` Channel 创建时 sellPrice 非空校验
- `F-DATA-03` SiliconFlow pricingOverrides 补充

## 测试环境

- 生产开关：
  - `PRODUCTION_STAGE=RND`
  - `PRODUCTION_DB_WRITE=ALLOW`
  - `HIGH_COST_OPS=ALLOW`
- 控制台：`https://aigc.guangai.ai`
- 备用直连：`http://154.40.40.116:8301`
- 使用账号：`codex-admin@aigc-gateway.local`
- 验收时间：`2026-04-04 11:07:16 CST`，`2026-04-04 11:??`（再次复验）

## 执行步骤概述

1. 使用管理员账号登录生产，获取 JWT。
2. 查询生产 `api/admin/sync-status` 中 SiliconFlow provider 的同步结果。
3. 查询生产 `v1/models` 中目标 SiliconFlow 模型的对外定价。
4. 查询生产 `api/admin/channels` 中 `ACTIVE TEXT` 零定价 channel 数量。

## 通过项

### `F-DATA-03` SiliconFlow pricingOverrides 补充

- 生产 `sync-status` 显示：
  - `providerName = siliconflow`
  - `apiModels = 95`
  - `modelCount = 95`
  - `overrides = 6`
- 生产 `/v1/models` 中，目标模型定价已翻正，例如：
  - `siliconflow/Qwen/Qwen2.5-72B-Instruct`
    - `input_per_1m = 0.679`
    - `output_per_1m = 0.679`
  - `siliconflow/Qwen/Qwen2.5-32B-Instruct`
    - `input_per_1m = 0.2071`
    - `output_per_1m = 0.2071`
  - `siliconflow/Qwen/QwQ-32B`
    - `input_per_1m = 0.2071`
    - `output_per_1m = 0.2071`
  - `siliconflow/deepseek-ai/DeepSeek-R1`
    - `input_per_1m = 0.6576`
    - `output_per_1m = 2.6304`

这说明：

- Generator 提到的字段修正已经在生产生效
- 目标模型不再是 `0` 定价

- 判定：`PASS`

## 部分通过项

### `F-DATA-02` Channel 创建时 sellPrice 非空校验

- 代码路径已在本地验收中确认存在：
  - [model-sync.ts](/Users/yixingzhou/project/aigcgateway/src/lib/sync/model-sync.ts#L268)
- Generator 修复轮 4 声称 `sync-status` 已新增 `zeroPriceActiveChannels` 字段，用于从外部接口验证零定价 channel。
- 追加复验结果仍然相同：
  - `sync-status.data.lastSyncResult.zeroPriceActiveChannels = null`
  - 各 provider 的 `zeroPriceActiveChannels = null`
  - 该新增口径当前仍未返回可用数值，不能作为验收证据
- 同时生产 `api/admin/channels` 复查结果显示：
  - 上轮：`active_text_zero_sell_count = 113`
  - 本轮再次复验：`active_text_zero_sell_count = 102`
- 其中样本同时包含：
  - OpenAI 多个文本模型
  - 以及此前的零定价残留模型类型

这说明：

- warn 逻辑是否打印，外部接口仍无法独立证明
- 新增观测字段目前没有形成有效证据
- 现网零定价文本 channel 数量虽有下降，但问题仍未完全消失

- 判定：`PARTIAL`

## 失败项

- 无

## 风险项

- 当前生产中仍有 `102` 个 `ACTIVE TEXT` 零定价 channel，这会继续影响计费与可观测性判断。
- `F-DATA-02` 仍缺少服务端日志级证据；新增 `sync-status.zeroPriceActiveChannels` 字段当前返回 `null`，暂未形成可用验收口径。

## 最终结论

本轮生产复验结论：`1 PASS / 1 PARTIAL / 0 FAIL`

- `PASS`
  - `F-DATA-03`
- `PARTIAL`
  - `F-DATA-02`

因此当前批次仍**不能进入 `done`**，应保持 `reviewing`，仅剩 `F-DATA-02` 待闭环。

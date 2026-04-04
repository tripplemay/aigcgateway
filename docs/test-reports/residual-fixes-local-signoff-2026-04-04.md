# 遗留问题修复批次本地验收报告 2026-04-04

## 测试目标

按 `progress.json` 当前批次，对以下 7 个已标记为 `completed` 的功能做 Evaluator 本地复验：

- `F-PERF-01` model-sync Provider 并行化
- `F-PERF-02` reconcile 批量 DB 操作
- `F-DATA-01` 空 sellPrice Channel 一次性修复
- `F-DATA-02` Channel 创建时 sellPrice 非空校验
- `F-DATA-03` SiliconFlow pricingOverrides 补充
- `F-FIX-01` OpenRouter 白名单外残留 Channel 彻底清理
- `F-FIX-02` OpenRouter 图片白名单精简

## 测试环境

- 环境：本地 `localhost:3099`
- 启动方式：`bash scripts/test/codex-restart.sh`
- 管理员账号：`admin@aigc-gateway.local / admin123`
- 说明：
  - 本地 provider key 为占位符
  - 除 OpenRouter 外，其余上游 `/models` 抓取会返回 `401`

## 执行步骤概述

1. 对本地 `3099` 做 smoke，确认 `/v1/models` 正常返回。
2. 读取当前 `features.json` 与本轮修复后的关键实现文件。
3. 重启本地测试服务，确保运行态加载最新修复。
4. 通过管理员登录拿 JWT，检查本地 `sync-status`、`channels`、`v1/models`。
5. 将本地可验证项与“因 provider 占位符导致无法最终闭环”的项区分开判定。

## 通过项

### `F-PERF-01` model-sync Provider 并行化

- 证据：
  - [model-sync.ts](/Users/yixingzhou/project/aigcgateway/src/lib/sync/model-sync.ts#L498) 使用 `Promise.allSettled(syncTasks)` 并行执行 provider sync
  - 本地最近一次可见同步结果仍为秒级，明显低于 acceptance 的 `<80s`
- 判定：`PASS`

### `F-PERF-02` reconcile 批量 DB 操作

- 证据：
  - [model-sync.ts](/Users/yixingzhou/project/aigcgateway/src/lib/sync/model-sync.ts#L203) 开始收集 `batchOps`
  - 更新路径改为先收集后提交：
    - [model-sync.ts](/Users/yixingzhou/project/aigcgateway/src/lib/sync/model-sync.ts#L225)
    - [model-sync.ts](/Users/yixingzhou/project/aigcgateway/src/lib/sync/model-sync.ts#L261)
  - 创建路径改为先收集后提交：
    - [model-sync.ts](/Users/yixingzhou/project/aigcgateway/src/lib/sync/model-sync.ts#L276)
  - 最终统一通过事务一次性提交：
    - [model-sync.ts](/Users/yixingzhou/project/aigcgateway/src/lib/sync/model-sync.ts#L313)
- 结论：
  - 本轮已经满足“update/create 使用 transaction 或批量操作”的 acceptance
- 判定：`PASS`

### `F-DATA-01` 空 sellPrice Channel 一次性修复

- 证据：
  - 本地 `ACTIVE TEXT` channel 中，空 `sellPrice` 数量为 `0`
  - `active_text_zero_sell = 0`
- 判定：`PASS`

### `F-FIX-01` OpenRouter 白名单外残留 Channel 彻底清理

- 证据：
  - 白名单 provider 在 reconcile 前主动清理白名单外 ACTIVE channel：
    - [model-sync.ts](/Users/yixingzhou/project/aigcgateway/src/lib/sync/model-sync.ts#L413)
  - 重启并加载新代码后，本地 `/v1/models`：
    - `openrouter_count = 23`
    - 不再暴露白名单外的大量残留模型
  - 本地 active OpenRouter 集合已收敛到当前白名单目标范围
- 判定：`PASS`

### `F-FIX-02` OpenRouter 图片白名单精简

- 证据：
  - [openrouter-whitelist.ts](/Users/yixingzhou/project/aigcgateway/src/lib/sync/adapters/openrouter-whitelist.ts#L75) 已明确说明移除两个不可用图片模型
  - 本地 `/v1/models` 中：
    - `removed_image_models = []`
  - 本地管理接口中：
    - `active_image_zero_sell = []`
- 结论：
  - 两个 OpenRouter 图片模型已不再对外暴露
- 判定：`PASS`

## 部分通过项

### `F-DATA-02` Channel 创建时 sellPrice 非空校验

- 证据：
  - [model-sync.ts](/Users/yixingzhou/project/aigcgateway/src/lib/sync/model-sync.ts#L268) 已新增零定价告警逻辑
  - 当新 channel 的 `sellPrice` 全为 0 时，会打印：
    - `[model-sync] WARNING: zero sellPrice for new channel ...`
- 限制：
  - 本轮未在运行中的本地服务上独立构造出“新建 channel 且 sellPrice 为 0”的场景，因此未拿到实际 warn 日志
- 结论：
  - 代码路径成立
  - 运行态告警仍缺少独立证据
- 判定：`PARTIAL`

### `F-DATA-03` SiliconFlow pricingOverrides 补充

- 证据：
  - [seed.ts](/Users/yixingzhou/project/aigcgateway/prisma/seed.ts#L149) 已写入 SiliconFlow pricing overrides
  - 覆盖了 `Qwen/Qwen2.5-72B-Instruct`、`Qwen/Qwen2.5-32B-Instruct`、`Qwen/Qwen2.5-7B-Instruct` 等主要模型
- 限制：
  - 本地 `sync-status` 仍显示：
    - `siliconflow.apiModels = 0`
    - `modelCount = 0`
    - `error = "API fetch failed: SiliconFlow /models returned 401"`
  - 本地由于 provider key 为占位符，无法证明“下次 sync 后这些模型 sellPrice > 0”
- 判定：`PARTIAL`

## 失败项

- 无

## 风险项

- 本轮为本地复验，不包含生产环境结论；用户已明确说明生产环境尚未部署本次版本。
- `F-DATA-03` 依赖真实 SiliconFlow `/models` 返回，本地环境无法做最终业务闭环验证。
- `F-DATA-02` 的告警逻辑虽然在代码中存在，但尚未通过实际服务日志独立取证。

## 最终结论

本轮本地复验结论：`5 PASS / 2 PARTIAL / 0 FAIL`

- `PASS`
  - `F-PERF-01`
  - `F-PERF-02`
  - `F-DATA-01`
  - `F-FIX-01`
  - `F-FIX-02`
- `PARTIAL`
  - `F-DATA-02`
  - `F-DATA-03`

因此当前批次**仍不能进入 `done`**，应保持 `reviewing`，并等待：

1. `F-DATA-02` 补充运行态 warn 证据
2. `F-DATA-03` 在真实 SiliconFlow key 环境或部署后环境中复验

# 健康检查与同步优化批次 Local Acceptance 2026-04-04

## 测试目标

对以下 4 个功能做本地 `3099` 首轮验收：

- `F-HEALTH-01` 图片通道健康检查改为 `/models` 轻量探测
- `F-SYNC-01` 修复白名单清理被安全防护提前返回跳过的问题
- `F-FILTER-SL` 硅基流动只保留 `TEXT/IMAGE`
- `F-FILTER-ZP` 智谱 AI 只保留 `TEXT/IMAGE`

## 测试环境

- 环境：本地 Codex 测试环境
- 地址：`http://localhost:3099`
- 启动方式：`bash scripts/test/codex-restart.sh`
- 数据库：`aigc_gateway_test`

## 测试范围

- 代码实现核对：`src/lib/health/checker.ts`
- 代码实现核对：`src/lib/sync/model-sync.ts`
- 代码实现核对：`src/lib/sync/adapters/base.ts`
- 代码实现核对：`src/lib/sync/adapters/siliconflow.ts`
- 代码实现核对：`src/lib/sync/adapters/zhipu.ts`
- 运行态验证：`/api/admin/health/:channelId/check`
- 运行态验证：`/api/admin/sync-models`
- 运行态验证：`/api/admin/sync-status`

## 执行步骤概述

1. 重启本地 `3099` 服务，确认 `/v1/models` 可访问。
2. 人工触发一个图片通道健康检查，核实只执行 `CONNECTIVITY/FORMAT` 两级且返回 `PASS`。
3. 读取 `inferModality()` / `filterModel()` 实现，并对样本模型名做分类验证。
4. 在本地测试库中为 `zhipu` 与 `siliconflow` 各插入一条应保留的 `TEXT` channel 和一条应清理的非聊天 channel。
5. 触发一次 `/api/admin/sync-models`，复查 channel 状态与 `/api/admin/sync-status` 返回。
6. 清理本次验收插入的测试样本。

## 通过项

- `F-HEALTH-01`：通过
  - `runImageCheck()` 已改为直接请求 `provider /models`，不再调用 `imageGenerations()`
  - 本地手动检查图片通道 `cmnjm0jnk00059y80hc5yase6` 返回：
    - `CONNECTIVITY = PASS`
    - `FORMAT = PASS`
    - 无 `QUALITY` 级别
- `F-SYNC-01`：通过
  - 代码中白名单清理位于安全防护 early return 之前
  - 本地为 `zhipu` 和 `siliconflow` 注入测试 channel 后触发 sync，在两家 provider `/models` 均 `401` 的情况下：
    - `zhipu/whisper-1` 被禁用
    - `siliconflow/BAAI/bge-large-zh-v1.5` 被禁用
    - 对应保留的 `glm-4-plus` / `Qwen/Qwen2.5-7B-Instruct` 仍保持 `ACTIVE`
  - `/api/admin/sync-status` 同时记录：
    - `apiModels = 0`
    - `modelCount = 0`
    - `disabledChannels` 含上述被清理的测试 channel
- `F-FILTER-ZP`：通过
  - `zhipu` 适配器已实现 `filterModel()`
  - 本地运行态证明 `TEXT` channel 保留，`AUDIO` channel 被禁用

## 失败项

- 无

## 风险项

- `F-FILTER-SL`：PARTIAL
  - `siliconflow` 适配器的“只保留 `TEXT/IMAGE`”运行态目标已达成
  - 但 `inferModality()` 对 `bge-reranker-v2-m3` / `BAAI/bge-reranker-v2-m3` 仍返回 `EMBEDDING`，不符合规格中“`*reranker*` 系列应识别为 `RERANKING`”的要求
  - 这不会让该类模型误入同步结果，因为它们仍会被当作非聊天模型过滤掉；但规格级分类精度尚未完全满足

## 证据

- 代码证据：`src/lib/health/checker.ts`
- 代码证据：`src/lib/sync/model-sync.ts`
- 代码证据：`src/lib/sync/adapters/base.ts`
- 代码证据：`src/lib/sync/adapters/siliconflow.ts`
- 代码证据：`src/lib/sync/adapters/zhipu.ts`
- 运行证据：图片通道健康检查返回 `PASS/PASS` 且仅两级
- 运行证据：`/api/admin/sync-status` 中 `zhipu`、`siliconflow` 的 `disabledChannels`
- 运行证据：本地测试库中测试 channel 在 sync 前后从 `ACTIVE` 翻转为 `DISABLED`

## 最终结论

本轮本地首轮验收结果为：

- `3 PASS`
- `1 PARTIAL`
- `0 FAIL`

当前不能进入 `done`。应将 `F-FILTER-SL` 退回修复，状态机进入 `fixing`。

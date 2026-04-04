# 白名单硬删除批次 Local Acceptance 2026-04-04

## 测试目标

验收 `F-DELETE-01`：

- 白名单外通道在模型同步后应被物理删除
- 不再保留为 `DISABLED`

## 测试环境

- 环境：本地 Codex 测试环境
- 地址：`http://localhost:3099`
- 启动方式：`bash scripts/test/codex-restart.sh`
- 数据库：`aigc_gateway_test`

## 测试范围

- 代码实现核对：`src/lib/sync/model-sync.ts`
- 运行态验证：`/api/admin/sync-models`
- 运行态验证：`/api/admin/sync-status`
- 本地测试库最小样本注入与清理

## 执行步骤概述

1. 读取规格与 `model-sync.ts` 当前实现，确认代码已从 `updateMany(DISABLED)` 改成 `deleteMany()`，且查询范围扩大到全量 Channel。
2. 在本地测试库为 `OpenRouter / SiliconFlow / Zhipu` 注入 6 条白名单外测试通道：
   - 每个 provider 1 条 `ACTIVE`
   - 每个 provider 1 条 `DISABLED`
3. 触发 `/api/admin/sync-models`。
4. 检查本地数据库、`/api/admin/channels`、`/api/admin/sync-status`。
5. 读取前台服务日志确认运行态行为。
6. 清理本次注入的测试样本。

## 通过项

- 代码层面已按规格修改：
  - cleanup 分支改为 `deleteMany()`
  - cleanup 查询范围已覆盖该 provider 的所有 channel，不再只查非 `DISABLED`

## 失败项

- `F-DELETE-01`：FAIL
  - 运行态未达成“物理删除”
  - 注入白名单外通道后，sync 执行结果不是“记录消失”，而是仍留在数据库中
  - `OpenRouter` provider 在 sync-status 中直接报错：
    - `Foreign key constraint violated on the constraint: health_checks_channelId_fkey`
  - 前台日志明确显示 cleanup 仍卡在删除阶段，导致 provider 同步失败
  - 控制台接口仍能看到本次白名单外测试通道，说明 Disabled Nodes 污染仍存在

## 风险项

- 当前 `deleteMany()` 会被 `health_checks.channelId` 外键阻塞
- 只要目标 channel 曾被健康检查写入记录，就无法直接物理删除
- 这意味着该方案在真实运行态下不稳定，不只是边界问题，而是主路径阻塞

## 证据

- 代码证据：`src/lib/sync/model-sync.ts` 已改为 `deleteMany()`
- 运行证据：`/api/admin/sync-status` 中 `openrouter.success = false`
- 运行证据：`openrouter.error` 为外键约束错误 `health_checks_channelId_fkey`
- 运行证据：前台日志出现 `Invalid prisma.channel.deleteMany() invocation`
- 运行证据：本次注入的白名单外通道在 sync 后仍保留为 `DEGRADED / DISABLED`，没有被删除

## 最终结论

本轮本地首轮验收结果为：

- `0 PASS`
- `0 PARTIAL`
- `1 FAIL`

当前不能进入 `done`。应将 `F-DELETE-01` 退回修复，状态机进入 `fixing`。

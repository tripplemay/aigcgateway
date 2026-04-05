# Dev Infra 批次 Local Acceptance 2026-04-05

## 测试目标

对 `dev-infra` 批次 6 个功能做首轮正式验收：

- `F-INFRA-01` 管理端统一鉴权测试脚本
- `F-INFRA-02` `/api/admin/debug/sync` 可观测接口
- `F-INFRA-03` `/api/admin/debug/enrichment` 统计接口
- `F-INFRA-04` `imageViaChat` 诊断日志强化
- `F-INFRA-05` 管理端接口真实响应文档
- `F-INFRA-06` `sync-status` / `health` 时间字段

## 测试环境

- 环境：本地代码审查 + 生产只读接口采样
- 生产地址：`https://aigc.guangai.ai`
- 生产开关：
  - `PRODUCTION_STAGE=RND`
  - `PRODUCTION_DB_WRITE=ALLOW`
  - `HIGH_COST_OPS=ALLOW`

## 测试范围

- 代码核对：`scripts/admin-auth.ts`
- 代码核对：`src/app/api/admin/debug/sync/route.ts`
- 代码核对：`src/app/api/admin/debug/enrichment/route.ts`
- 代码核对：`src/lib/engine/openai-compat.ts`
- 代码核对：`src/app/api/admin/sync-status/route.ts`
- 代码核对：`src/app/api/admin/health/route.ts`
- 生产只读验证：`/api/admin/models-channels`
- 生产只读验证：`/api/admin/usage`
- 生产只读验证：`/api/admin/usage/by-model`
- 生产只读验证：`/api/admin/sync-status`
- 生产只读验证：`/api/admin/health`
- 文档产出：`docs/specs/admin-api-response-samples.md`

## 执行步骤概述

1. 阅读批次规格与状态机，确认本轮处于 `verifying`。
2. 核对 `F-INFRA-01`、`F-INFRA-02`、`F-INFRA-03`、`F-INFRA-04`、`F-INFRA-06` 的实现代码。
3. 使用生产管理员鉴权读取 5 个管理接口真实响应并存档。
4. 基于真实响应整理 `admin-api-response-samples.md`。
5. 将代码实现与规格、运行态响应逐项比对，给出 `PASS / PARTIAL / FAIL`。

## 通过项

- `F-INFRA-01`：通过
  - [scripts/admin-auth.ts](/Users/yixingzhou/project/aigcgateway/scripts/admin-auth.ts) 存在。
  - 已导出 `getAdminToken()`、`getAdminHeaders()`。
  - 支持 `BASE_URL`，默认本地 `3099`。
  - 顶部注释包含 5 个高频管理接口示例。
- `F-INFRA-03`：通过
  - [route.ts](/Users/yixingzhou/project/aigcgateway/src/app/api/admin/debug/enrichment/route.ts) 存在并启用 Admin 鉴权。
  - 生产真实响应包含 `totalModels`、`enrichedModels`、`unenrichedModels`、`enrichmentRate`、`byProvider`。
- `F-INFRA-05`：通过
  - 已新增 [admin-api-response-samples.md](/Users/yixingzhou/project/aigcgateway/docs/specs/admin-api-response-samples.md)。
  - 文档覆盖 `models-channels`、`usage`、`usage/by-model`、`sync-status`、`health` 五个接口。
  - 样例来自生产真实调用，原始采样文件保存在 `docs/test-reports/dev-infra-api-samples/`。

## 失败项

- `F-INFRA-04`：失败
  - 规格要求在 4 个关键失败节点都输出结构化诊断日志：`multimodal-parts`、`base64`、`url-with-ext`、`any-https`。
  - 当前 [openai-compat.ts](/Users/yixingzhou/project/aigcgateway/src/lib/engine/openai-compat.ts#L329) 只有 `multimodal-parts`、`base64`、`any-https` 三处日志。
  - `url-with-ext` 失败节点缺失，日志数量与规格不一致。
- `F-INFRA-06`：失败
  - 规格要求 `sync-status` 新增 `lastSyncResult: 'success' | 'partial' | 'failed' | null`。
  - 当前 [route.ts](/Users/yixingzhou/project/aigcgateway/src/app/api/admin/sync-status/route.ts#L60) 实际新增的是 `lastSyncResultStatus`，并在响应中返回该字段。
  - 生产真实响应也验证到了 `lastSyncResultStatus`，不是规格要求的新增字段名。

## 风险项

- `F-INFRA-02`：PARTIAL
  - [route.ts](/Users/yixingzhou/project/aigcgateway/src/app/api/admin/debug/sync/route.ts#L64) 已返回 `lastSyncAt`、`lastSyncDuration`、`syncedModelCount`、`exposedModelCount`、`disabledChannels`，生产真实响应结构也成立。
  - 但 `disabledReason` 当前只取最近一次失败健康检查的 `errorMessage`，没有按规格优先读取 `Channel.notes`。
  - 因此接口可用，但 disable 原因的来源优先级未完全符合规格。

## 证据

- 代码证据：[admin-auth.ts](/Users/yixingzhou/project/aigcgateway/scripts/admin-auth.ts)
- 代码证据：[route.ts](/Users/yixingzhou/project/aigcgateway/src/app/api/admin/debug/sync/route.ts)
- 代码证据：[route.ts](/Users/yixingzhou/project/aigcgateway/src/app/api/admin/debug/enrichment/route.ts)
- 代码证据：[openai-compat.ts](/Users/yixingzhou/project/aigcgateway/src/lib/engine/openai-compat.ts)
- 代码证据：[route.ts](/Users/yixingzhou/project/aigcgateway/src/app/api/admin/sync-status/route.ts)
- 代码证据：[route.ts](/Users/yixingzhou/project/aigcgateway/src/app/api/admin/health/route.ts)
- 运行证据：`docs/test-reports/dev-infra-api-samples/models-channels.json`
- 运行证据：`docs/test-reports/dev-infra-api-samples/usage.json`
- 运行证据：`docs/test-reports/dev-infra-api-samples/usage-by-model.json`
- 运行证据：`docs/test-reports/dev-infra-api-samples/sync-status.json`
- 运行证据：`docs/test-reports/dev-infra-api-samples/health.json`

## 最终结论

本轮首轮验收结果为：

- `3 PASS`
- `1 PARTIAL`
- `2 FAIL`

当前不能进入 `done`。应将 `F-INFRA-02`、`F-INFRA-04`、`F-INFRA-06` 退回修复，状态机进入 `fixing`。

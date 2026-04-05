# Dev Infra 批次 Signoff 2026-04-05

## 测试目标

对 `dev-infra` 批次做生产复验并完成最终签收：

- `F-INFRA-01` 管理端统一鉴权测试脚本
- `F-INFRA-02` `/api/admin/debug/sync` 可观测接口
- `F-INFRA-03` `/api/admin/debug/enrichment` 统计接口
- `F-INFRA-04` `imageViaChat` 提取链诊断日志
- `F-INFRA-05` 管理端接口真实响应文档
- `F-INFRA-06` `sync-status` / `health` 时间字段

## 测试环境

- 环境：生产环境复验
- 控制台/API：`https://aigc.guangai.ai`
- 服务器：`tripplezhou@34.180.93.185`
- 生产开关：
  - `PRODUCTION_STAGE=RND`
  - `PRODUCTION_DB_WRITE=ALLOW`
  - `HIGH_COST_OPS=ALLOW`

## 测试范围

- 生产只读接口：`/api/admin/debug/sync`
- 生产只读接口：`/api/admin/sync-status`
- 生产代码核对：`src/app/api/admin/debug/sync/route.ts`
- 生产代码核对：`src/app/api/admin/sync-status/route.ts`
- 生产代码核对：`src/lib/engine/openai-compat.ts`
- 既有产物复核：`docs/specs/admin-api-response-samples.md`

## 执行步骤概述

1. 重读状态机，确认当前处于 `reverifying`。
2. 读取生产管理员接口响应，复验 `F-INFRA-02` 和 `F-INFRA-06`。
3. 通过 SSH 登录生产服务器，核对已部署源码，复验 `F-INFRA-04`。
4. 结合首轮验收与本轮复验证据，给出最终签收结论。

## 通过项

- `F-INFRA-01`：通过
  - [admin-auth.ts](/Users/yixingzhou/project/aigcgateway/scripts/admin-auth.ts) 保持可用，作为本轮生产采样的统一鉴权入口。
- `F-INFRA-02`：通过
  - 生产 `GET /api/admin/debug/sync` 返回 `200`。
  - 响应包含 `lastSyncAt`、`lastSyncDuration`、`syncedModelCount`、`exposedModelCount`、`disabledChannels`。
  - 生产已部署代码 [route.ts](/Users/yixingzhou/project/aigcgateway/src/app/api/admin/debug/sync/route.ts#L64) 已按修复说明优先读取 `Channel.notes`，无值时回退到最近失败健康检查错误。
- `F-INFRA-03`：通过
  - 首轮验收已确认接口结构与生产真实响应符合规格。
- `F-INFRA-04`：通过
  - 生产已部署代码 [openai-compat.ts](/Users/yixingzhou/project/aigcgateway/src/lib/engine/openai-compat.ts#L329) 至 [openai-compat.ts](/Users/yixingzhou/project/aigcgateway/src/lib/engine/openai-compat.ts#L405) 现已包含 4 个关键失败节点日志：
    - `multimodal-parts`
    - `base64`
    - `url-with-ext`
    - `any-https`
  - 日志结构字段包含 `stage`、`contentType`、`partTypes`、`urlCandidateCount`、`dataUriFound`、`model`、`provider`。
- `F-INFRA-05`：通过
  - [admin-api-response-samples.md](/Users/yixingzhou/project/aigcgateway/docs/specs/admin-api-response-samples.md) 已完成，且仍与生产真实响应一致。
- `F-INFRA-06`：通过
  - 生产 `GET /api/admin/sync-status` 返回 `200`。
  - 响应已包含：
    - `lastSyncAt`
    - `lastSyncDuration`
    - `lastSyncResult`
  - 完整原始对象已放在 `lastSyncResultDetail`，实现了向后兼容扩展。
  - `health` 接口的 `lastCheckedAt`、`consecutiveFailures` 已在首轮验收中确认存在。

## 失败项

- 无

## 风险项

- `F-INFRA-04` 本轮未在生产上构造一条必然进入四级提取失败的真实图片响应，只核对了已部署源码中的日志节点完整性。
- 这不影响本批次签收，因为该 feature 的验收目标是“新增结构化诊断日志且不改变逻辑”，代码与部署态已能直接证明。

## 证据

- 生产响应证据：`docs/test-reports/dev-infra-api-samples/debug-sync.json`
- 生产响应证据：`docs/test-reports/dev-infra-api-samples/sync-status.json`
- 生产文档证据：[admin-api-response-samples.md](/Users/yixingzhou/project/aigcgateway/docs/specs/admin-api-response-samples.md)
- 生产源码证据：[route.ts](/Users/yixingzhou/project/aigcgateway/src/app/api/admin/debug/sync/route.ts#L64)
- 生产源码证据：[route.ts](/Users/yixingzhou/project/aigcgateway/src/app/api/admin/sync-status/route.ts#L81)
- 生产源码证据：[openai-compat.ts](/Users/yixingzhou/project/aigcgateway/src/lib/engine/openai-compat.ts#L375)

## 最终结论

本轮 `dev-infra` 批次复验结果为：

- `6 PASS`
- `0 PARTIAL`
- `0 FAIL`

本批次可以签收，状态机应推进到 `done`。

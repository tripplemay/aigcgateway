---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-DEEPSEEK-V4-HOTFIX**（**reverifying**，fix_rounds=3，6/7）— DSV4-DEF-03 已修并部署（run 30216513457，checkout `26b3272`），待 Codex 复验 F-DSV4-06。
- **DSV4-DEF-03**：F-DSV4-02 恢复的调度器撤销了 F-DSV4-01 的止血。根因是 DISABLED 通道恢复走 API_REACHABILITY，只验 `/models` 端点有响应、不碰 `realModelId`。新增 `vetoRecovery`：只在能确证模型已从目录消失时否决，排除 EMBEDDING / `quirks.endpointMap` / 无专属适配器 / 拉取失败 / 空目录五类。
- **上游二次变更**：DeepSeek 已补向后兼容别名，`deepseek-chat`/`deepseek-reasoner` 返回 200 但响应 `model=deepseek-v4-flash` → 语义偷换。用户裁决坚持 D1 下架。
- **生产实测**：部署后 1h AUTO_RECOVERY 否决 8 / 放行 4；两条陈旧通道由 **model-sync 的 toDisable 自动下架**（不再需要一次性脚本）；`deepseek-v3`→volcengine 真 V3、`deepseek-r1`→openrouter 真 R1。
- **⚠️ 取舍已兑现**：siliconflow 4 + openrouter 2 条通道将一直 DISABLED 不自动恢复，需运维判断置回或保持。
- **遗留（建议另开）**：deepseek reconcile 恢复运行后把 v4-flash/v4-pro 的 costPrice 覆盖成 0，与跨服务商 costPrice 全零同源。

## 挂起批次
- **BL-IMG-I2I-VISION**（挂起于 **reverifying**，fix_rounds=2）— F-IIV-08 待验，归档在 `docs/archive/{features,progress}-BL-IMG-I2I-VISION-suspended.json`。
- 待裁决：历史零扣费 CallLog 是否追补 Transaction；生产 alias sellPrice 是否改 token-priced；`provision-i2i-capabilities.ts --apply` 未跑。

## Backlog
- **BL-SEC-PAY-DEFERRED**（critical-deferred）— 支付 webhook 验签 + 幂等 CAS。
- **BL-SEC-INFRA-GUARD-FOLLOWUP**（high-deferred）— Next.js 16 跨大版本迁移。
- **BL-FE-DS-SHADCN**（low-deferred）— shadcn 大批量采用率提升。

## 参考
- 生产：`https://aigc.guangai.ai`（`ssh deploysvr`；容器 `aigc-gateway-{app,postgres,redis}-1`）。

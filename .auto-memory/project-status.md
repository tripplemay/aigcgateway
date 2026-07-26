---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-DEEPSEEK-V4-HOTFIX**（**fixing**，fix_rounds=2，5/7 完成）— fix round 2 复验退回；spec: `docs/specs/BL-DEEPSEEK-V4-HOTFIX-spec.md`。
- **DSV4-DEF-01/02 已通过**：通知去重竞态已解；四组 L1 主脚本 Overall PASS（72 PASS / 0 FAIL / 28 SKIP）。
- **全量回归 PASS**：build、typecheck、typecheck:scripts、lint 通过；fresh L1 Vitest 87 files / 733 PASS / 3 SKIP。
- **生产通过项**：commit `5f57af6` 容器 healthy；health_checks 持续推进；护栏通知/偏好/Redis 节流正常；六条 CallLog/DEDUCTION 一致。
- **DSV4-DEF-03 [High] 待修**：上游 `/models` 仍仅有 v4-flash/v4-pro，但健康恢复任务以 API_REACHABILITY PASS 把两条已下架的 DeepSeek priority=1 陈旧通道恢复为 ACTIVE。
- **根因证据**：DISABLED enabled-alias 文本通道只做 `/models` 可达性；检查不验证自身 realModelId 是否在返回集合中，PASS 后无条件转 ACTIVE。
- **状态**：F-DSV4-01=`pending`，F-DSV4-06=`pending`，`docs.signoff=null`；报告 `docs/test-reports/BL-DEEPSEEK-V4-HOTFIX-reverification-2026-07-26-round2.md`。
- **既有数据风险（不在本批次修）**：多家 token 计价 ACTIVE 通道 costPrice 大量为 0，成本与毛利统计失真，用户卖价不受影响。

## 挂起批次
- **BL-IMG-I2I-VISION**（挂起于 **reverifying**，fix_rounds=2）— F-IIV-08 待验，归档在 `docs/archive/{features,progress}-BL-IMG-I2I-VISION-suspended.json`。
- 待裁决：历史零扣费 CallLog 是否追补 Transaction；生产 alias sellPrice 是否改 token-priced；`provision-i2i-capabilities.ts --apply` 未跑。

## Backlog
- **BL-SEC-PAY-DEFERRED**（critical-deferred）— 支付 webhook 验签 + 幂等 CAS。
- **BL-SEC-INFRA-GUARD-FOLLOWUP**（high-deferred）— Next.js 16 跨大版本迁移。
- **BL-FE-DS-SHADCN**（low-deferred）— shadcn 大批量采用率提升。

## 参考
- 生产：`https://aigc.guangai.ai`（`ssh deploysvr`；容器 `aigc-gateway-{app,postgres,redis}-1`）。

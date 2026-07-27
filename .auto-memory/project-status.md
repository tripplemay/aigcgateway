---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-DEEPSEEK-V4-HOTFIX**（**done**，fix_rounds=4，7/7）— 14/14 验收用例 PASS；签收 `docs/test-reports/BL-DEEPSEEK-V4-HOTFIX-signoff-2026-07-26.md`。
- **回归 PASS**：12 个热修专项 103/103；全量 Vitest 746 PASS / 3 SKIP / 0 FAIL；四组 L1 72 PASS / 0 FAIL / 28 SKIP；typecheck、typecheck:scripts、lint、build 通过。
- **生产只读 PASS**：checkout `26b3272`；DeepSeek 三旧通道持续 DISABLED，v4 两通道 ACTIVE；健康检查持续推进，告警可见，四别名真实语义与计费一致。
- **上线待办**：用户触发 Deploy 发布 `401a7da`，随后做 checkout/health smoke；实际部署路径已变为 `/opt/apps/aigc-gateway`，Planner 更新 `environment.md`。
- **遗留（建议另开）**：deepseek reconcile 恢复运行后把 v4-flash/v4-pro 的 costPrice 覆盖成 0，与跨服务商 costPrice 全零同源。

## 挂起批次
- **BL-IMG-I2I-VISION**（挂起于 **reverifying**，fix_rounds=2）— F-IIV-08 待验，归档在 `docs/archive/{features,progress}-BL-IMG-I2I-VISION-suspended.json`。
- Hotfix 已 done；按 Harness 由 Planner 还原该批次后，再由 Codex 继续复验。
- 待裁决：历史零扣费 CallLog 是否追补 Transaction；生产 alias sellPrice 是否改 token-priced；`provision-i2i-capabilities.ts --apply` 未跑。

## Backlog
- **BL-SEC-PAY-DEFERRED**（critical-deferred）— 支付 webhook 验签 + 幂等 CAS。
- **BL-SEC-INFRA-GUARD-FOLLOWUP**（high-deferred）— Next.js 16 跨大版本迁移。
- **BL-FE-DS-SHADCN**（low-deferred）— shadcn 大批量采用率提升。

## 参考
- 生产：`https://aigc.guangai.ai`（`ssh deploysvr`；容器 `aigc-gateway-{app,postgres,redis}-1`）。

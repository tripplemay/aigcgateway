---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-DEEPSEEK-V4-HOTFIX**（**fixing**，fix_rounds=3，5/7）— fix round 3 复验退回；报告 `docs/test-reports/BL-DEEPSEEK-V4-HOTFIX-reverification-2026-07-26-round3.md`。
- **DSV4-DEF-03 目标场景 PASS**：生产 checkout `26b3272`；DeepSeek 三旧通道持续 DISABLED，v4 两通道 ACTIVE；目标 veto 两次、volcengine endpointMap 正常放行。
- **上游二次变更**：DeepSeek 已补向后兼容别名，`deepseek-chat`/`deepseek-reasoner` 返回 200 但响应 `model=deepseek-v4-flash` → 语义偷换。用户裁决坚持 D1 下架。
- **规范回归 PASS**：四组 L1 脚本 72 PASS / 0 FAIL / 28 SKIP；typecheck、typecheck:scripts、lint、build 通过。
- **DSV4-DEF-04 [High] 待修**：`vetoRecovery` 对所有非 ACTIVE 状态生效；DEGRADED 通道即使模型特定 full probe PASS，也会因目录缺失被 veto，长期无法恢复 ACTIVE。
- **红灯证据**：`tests/unit/dsv4-recovery-veto-status.test.ts` 稳定 FAIL；最终全量 1 FAIL / 742 PASS / 3 SKIP。F-DSV4-01/F-DSV4-06 pending，`docs.signoff=null`。
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

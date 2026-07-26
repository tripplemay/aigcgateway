---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-DEEPSEEK-V4-HOTFIX**（**fixing**，fix_rounds=1，5/7 完成）— fix round 1 复验退回；spec: `docs/specs/BL-DEEPSEEK-V4-HOTFIX-spec.md`。
- **DSV4-DEF-01 [High] 已通过复验**：0 投递释放 Redis 键，首次成功投递才开始去重窗口；定向回归和生产天然时序证据均 PASS。
- **生产部署 PASS**：commit `5f57af6` 健康运行；DeepSeek 陈旧 ACTIVE 通道=0；health_checks 已持续推进；两类护栏 WARN 各投递 5 名管理员；四别名 CallLog/DEDUCTION 一致。
- **全量回归 PASS**：build、typecheck、typecheck:scripts、lint 均通过；fresh L1 Vitest 87 files / 733 PASS / 3 SKIP。
- **DSV4-DEF-02 [High] 待修**：F-DSV4-07 四个 L1 脚本仍全部 exit 1。无模型 SKIP 未传播到余额/日志/计费等依赖断言，MCP 脚本没有完整 SKIP 机制，31s cooldown 仍被 60s 限流污染。
- **脚本证据**：e2e-test 20 PASS / 7 FAIL / 3 SKIP；e2e-errors 11/1/1；test-mcp 32/14；test-mcp-errors 8/3。
- **状态**：F-DSV4-07=`pending`，F-DSV4-06=`pending`，`docs.signoff=null`；报告 `docs/test-reports/BL-DEEPSEEK-V4-HOTFIX-reverification-2026-07-26.md`。
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

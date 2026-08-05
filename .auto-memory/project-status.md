---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-SEC-HOTFIX-2608**（**fixing**，首轮验收）— L1 代码/运行时回归通过，生产只读暴露盘点已完成。
- **通过项**：F-SH-01、F-SH-02、F-SH-04、F-SH-05；全量 Vitest `788 passed / 4 skipped`，typecheck、lint、build 通过。
- **🔴 发布阻塞**：F-SH-03 部署前仍有 1 条可用 `openai/gpt-4o-mini` Action 未迁移到启用别名；另有 7 条 `deepseek/v3` Action 已是既有失效配置。未授权生产写入，待迁移后复验。
- **生产暴露**：3,234 条 `SUCCESS + sellPrice=0 + costPrice>0`，上游成本估算 `$5.35723988`；重复 RECHARGE 0 行、无 `sign` 的 COMPLETED recharge order 0 行，暂无 C1/C2 利用证据。
- **报告**：`docs/test-reports/BL-SEC-HOTFIX-2608-prod-exposure-2026-08-04.md`；用例 `docs/test-cases/BL-SEC-HOTFIX-2608-evaluator-2026-08-04.md`。

## 发布要求
- 迁移 `Response Generator` 到 `gpt-4o-mini` 后，重新执行 F-SH-03 存量核验、L1 定向回归，并进入 `reverifying`。
- 生产：`https://aigc.guangai.ai`（`ssh deploysvr`；容器 `aigc-gateway-{app,postgres,redis}-1`）。

## Backlog
- **BL-SEC-PAY-DEFERRED**（critical-deferred）— 支付 webhook 验签 + 幂等 CAS。
- **BL-SEC-INFRA-GUARD-FOLLOWUP**（high-deferred）— Next.js 16 跨大版本迁移。
- **BL-FE-DS-SHADCN**（low-deferred）— shadcn 大批量采用率提升。

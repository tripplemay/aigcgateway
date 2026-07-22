---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-IMG-I2I-VISION**（**fixing**，2026-07-22 fix_round 1）— L1 `44/44 PASS`；用户授权后的 L2 真实功能 `14/14 PASS`，Seedream、edits、MCP、Qwen vision、OpenRouter、GCS、代理和视觉相关性均通过。
- **IIV-DEF-03 [High] 阻断签收**：OpenRouter token-priced channel 遇到 call-priced alias 时 `calculateTokenCost` 计算 `sell=0` 并跳过扣费。生产只读抽样最近 20 条成功图片调用全部 cost>0/sell=0；gpt-image/gemini 样本均无 Transaction。
- F-IIV-08 保持 pending，`docs.signoff=null`；报告与复验要求见 `docs/test-reports/BL-IMG-I2I-VISION-signoff-2026-07-22.md`。
- IIV-DEF-01/02 已 CLOSED；tsc/build PASS，Vitest `670 PASS / 4 SKIP`。OpenRouter 原 402 阻塞已解除，两模型真实 i2i 均成功。
- 生产 provisioning 未跑：部署后需在 deploysvr 跑 `provision-i2i-capabilities.ts --apply`（ops 文档 §3）。

## 上一批次遗留（仍有效）
- **BL-PROD-MIGRATE-DEPLOYSVR**（done 2026-07-12）：生产已迁 deploysvr(194.238.26.173，容器化)。旧机冻结可回滚。**🔴P6 旧机退役**待用户择机 + **kolmatrix 迁移**（单列）。
- alias capabilities 历史双层嵌套 + seedream-4-5 supported_sizes 陈旧（ops §3 附录，建议后续清洗批次）。

## Backlog（3 条）
- **BL-SEC-PAY-DEFERRED**（critical-deferred）— 支付 webhook 验签 + 幂等 CAS
- **BL-SEC-INFRA-GUARD-FOLLOWUP**（high-deferred）— Next.js 16 跨大版本迁移
- **BL-FE-DS-SHADCN**（low-deferred）— shadcn 大批量采用率提升

## 参考
- 生产：`https://aigc.guangai.ai`；探测/脚本/回滚：`docs/specs/BL-IMG-I2I-VISION-ops.md`。

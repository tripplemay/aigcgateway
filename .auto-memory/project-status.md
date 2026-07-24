---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-IMG-I2I-VISION**（**reverifying**，2026-07-24 fix_round 2 完成）— IIV-DEF-03 [High] 已修（commit 72e58b8，CI 绿）。IIV-DEF-01/02 早前 CLOSED。
- **IIV-DEF-03 修复**：`calculateTokenCost` token 路径卖价改为取含 token 字段的来源（alias 缺字段→fallback channel.sellPrice），镜像 `calculateCallCost` 兼容逻辑。生产 gpt-image/gemini-3-pro-image（alias=call、channel=token）此前 20/20 漏扣，现按 channel token sell 正确计费。回归：4 个 Vitest 单元测试（image-via-chat-token-cost.test.ts），red/green 已验证；全量 674 PASS / 4 SKIP。
- **待 Codex 复验**：生产等价价格双 alias 真实 i2i（sell>0 + Transaction），Seedream/失败不扣费/纯文回归。F-IIV-08 pending，`docs.signoff=null`。报告 `docs/test-reports/BL-IMG-I2I-VISION-signoff-2026-07-22.md`。
- **待裁决**（Planner/用户）：历史零扣费 CallLog 是否追补 Transaction；生产 alias sellPrice 是否改 token-priced（可选，代码 fallback 已正确计费）。
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

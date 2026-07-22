---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-IMG-I2I-VISION**（**verifying**，2026-07-22 handoff）— 图生图 + MCP 图片输入。7/7 generator features 完成（CI 全绿），待 Codex 执行 F-IIV-08 验收。handoff 详情见 progress.json generator_handoff。
- i2i 放行模型（ops 文档为准）：seedream-4-5（上游实测通过：images 端点 image 字段 URL/数组/base64 全通，chat API 不可用）；gpt-image / gemini-3-pro-image（用户裁决按标准 OpenAI 契约直上，未实测）。
- **🔴 OpenRouter 账户欠费**（$590 用尽超支 $0.20）——生产所有 OR 通道 402 中，含 OR 图模验收阻断。待用户充值。
- 生产 provisioning 未跑：部署后需在 deploysvr 跑 `provision-i2i-capabilities.ts --apply`（ops 文档 §3 有步骤）。

## 上一批次遗留（仍有效）
- **BL-PROD-MIGRATE-DEPLOYSVR**（done 2026-07-12）：生产已迁 deploysvr(194.238.26.173，容器化)。旧机冻结可回滚。**🔴P6 旧机退役**待用户择机 + **kolmatrix 迁移**（单列）。
- alias capabilities 历史双层嵌套 + seedream-4-5 supported_sizes 陈旧（本批次发现，ops §3 附录，建议后续清洗批次）。

## Backlog（3 条）
- **BL-SEC-PAY-DEFERRED**（critical-deferred）— 支付 webhook 验签 + 幂等 CAS
- **BL-SEC-INFRA-GUARD-FOLLOWUP**（high-deferred）— Next.js 16 跨大版本迁移
- **BL-FE-DS-SHADCN**（low-deferred）— shadcn 大批量采用率提升

## 参考
- 生产：`https://aigc.guangai.ai`。本批次探测/脚本/回滚记录：`docs/specs/BL-IMG-I2I-VISION-ops.md`。

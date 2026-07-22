---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-IMG-I2I-VISION**（**reverifying**，2026-07-22 fix_round 1 完成）— 图生图 + MCP 图片输入。两缺陷已修（commit 1cd8676，CI 绿）：IIV-DEF-01 edits 纳入 image 权限域（detectEndpoint 补映射，restricted key 现 403）；IIV-DEF-02 去 zod max(10) 改由 validateImageInput 返回 D7 业务信封。
- 回归测试已同 commit 沉淀：e2e-errors.ts「IIV-DEF-01 edits 403」+ test-mcp-errors.ts「5c IIV-DEF-02 信封断言」，本地验证均 PASS。待 Codex 复验（真实 L2 授权事项见首验报告）。
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

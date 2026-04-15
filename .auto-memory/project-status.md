---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- USAGE-ALERTS：`building`（10 条功能，0/10 完成，9 generator + 1 codex）
- 规格：`docs/specs/USAGE-ALERTS-spec.md`
- Phase 1-2: F-UA-01 schema / F-UA-02 dispatcher（webhook + inApp，HMAC 签名 + 退避重试）
- Phase 3: F-UA-03 BALANCE_LOW + SPENDING_RATE / F-UA-04 CHANNEL_DOWN/RECOVERED + PENDING_CLASSIFICATION
- Phase 4: F-UA-05 NotificationCenter / F-UA-06 API / F-UA-07 Settings 偏好
- Phase 5 CLEANUP 顺手收尾：F-UA-08 3 子路由 UI / F-UA-09 reassign popover + 2 测试 bug + 视觉细节
- Phase 6: F-UA-10 codex 验收
- 不引入 SMTP，复用 alertThreshold + RATE-LIMIT spending + SystemLog + PendingClassification 4 个现有事件源

## 生产状态
- 部署 67889a0（REGRESSION-BACKFILL 签收版本）
- PM2 online
- 用户正在终端手动跑 reports-20260416 全量审计（独立于本批次）

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配：openai/gpt-5-image、wan2.7-image、wan2.7-image-pro、z-image-turbo、glm-4v

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3 / PRICE-FIX / BF4 / BILLING-REFACTOR / AUDIT-SEC / DX-POLISH / UI-UNIFY / DOCS-REFRESH / UI-UNIFY-FIX / AUDIT-CRITICAL-FIX / RATE-LIMIT / WORKFLOW-POLISH / AUDIT-FOLLOWUP / UI-UNIFY-FIX-2 / ADMIN-UI-UNIFY / ADMIN-OPS++ / REGRESSION-BACKFILL

## Backlog（延后）
- BL-065(支付验签) / BL-104(Settings 项目切换)
- 20260415/16 全量审计基线（用户在跑）

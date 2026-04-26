---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-FE-QUALITY：`verifying`**（4/4 generator 完成 → 待 Codex 跑 F-FQ-05 19 项验收）
- 复核结论：4 features 全部已在 04-18 commit 09331f4 实现（zombie 批次重启）
- 本次 Generator (Kimi) 唯一新增：commit 22ad728 — admin/models 2 useAsyncData → 1 个 Promise.all
- 上一批次 BL-IMAGE-LOG-DISPLAY-FIX：done @ 2026-04-26 09:45（12/12 PASS / fix_rounds=0）

## 待 Codex 验收（F-FQ-05 19 项）
- UX 5 项：9 reload SPA / settings 单事件 / keys 复制 / 轮询门控 / admin batched
- template polish 3 项：PATCH 400 / Decimal < 1e-12 / waitForCallLog 1s
- A11y+i18n 4 项：Lighthouse ≥ 98 / error.tsx 中文 / Free-Degraded 切中文 / timeAgo 中文
- DS 3 项：grep 违规 0/0/0 + 视觉回归
- 构建 3 项：build / tsc / vitest 116+
- 报告 1 项：signoff 归档

## 后续 backlog（按 order）
- BL-SEC-* (1-4): 安全加固（接支付前启动，按 reference_payment_timing 决策）
- BL-DATA-CONSISTENCY (7) / BL-INFRA-RESILIENCE (8) / BL-SEC-POLISH (9) / BL-INFRA-ARCHIVE (10)
- BL-FE-DS-SHADCN (98) / BL-SEC-PAY-DEFERRED (99) deferred

## 生产前置
- 无（纯前端 + 极少 backend）

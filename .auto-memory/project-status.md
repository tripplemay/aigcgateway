---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-FE-QUALITY：`building`**（5 features，启动 @ 2026-04-26 10:30）
- 上一批次 BL-IMAGE-LOG-DISPLAY-FIX：done @ 2026-04-26 09:45（12/12 PASS / fix_rounds=0）
- 上上一批次 BL-IMAGE-PRICING-OR-P2：done @ 2026-04-26 08:40

## 本批次范围（4 generator + 1 codex）
- F-FQ-01 high: UX 改造（9 reload→router.refresh + settings 双事件 + keys 复制 + 轮询 visibilitychange + admin batched fetch）
- F-FQ-02 high: template-testing polish（PATCH 400 + Decimal 精度 + waitForCallLog 优化）
- F-FQ-03 high: A11y+i18n（aria-label helper + error.tsx i18n + admin/models Free/Degraded + timeAgo/汇率本地化）
- F-FQ-04 high: DS Critical 3 文件 token 改造（admin/operations 33 + dashboard 24 + admin/logs 24 处违规）
- F-FQ-05 critical codex: 19 项验收（含 Lighthouse A11y ≥ 98 + 视觉回归截图）

## 启动前调研结论
- BL-FE-PERF-01（原 order=5）经 grep 复核已 done @ commit a954c46（2026-04-20，8/8 decisions 全实现）
- backlog 顺手清理：移除 PERF-01 + QUALITY 两个 zombie 条目（15 items 剩余）

## Framework v0.9.5 应用（spec 顶部已勾 7 项）
- 铁律 1.1 ✓ F-FQ-01 #1 router.refresh() 已加'或等价 SPA 局部 mutate'豁免
- 铁律 1.2 ✓ 所有验收基于 DOM/Network/DB/Lighthouse
- 铁律 2 ✓ [已核实]/[待核实] 标记齐备，Generator 必 Read 重核

## 后续 backlog（按 order）
- BL-SEC-* (1-4): 安全加固（接支付前启动，按 reference_payment_timing 决策）
- BL-DATA-CONSISTENCY (7) / BL-INFRA-RESILIENCE (8) / BL-SEC-POLISH (9) / BL-INFRA-ARCHIVE (10)
- BL-FE-DS-SHADCN (98) / BL-SEC-PAY-DEFERRED (99) deferred

## 生产前置
- 无（纯前端 + 少量 backend）

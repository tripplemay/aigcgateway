---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-BILLING-AUDIT-EXT-P1：`reverifying`**（fix_round=2 生产 apply + verify 完成，等 Codex 签收 → done）
- 上一批次 BL-IMAGE-PARSER-FIX：done（生产 e9e8963 已部署）
- Path A 主线 11/11 完成；EMERGENCY / LEAN / IMAGE-PARSER-FIX / BILLING-AUDIT-EXT 独立 post-path-a 链

## 本批次 P1 全量交付（生产已就绪）
- F-BAX-01~06 build + fix_round 1 三个 fetcher bug（生产已通过）
- F-BAX-08 fix_round 2：30 条 channel 定价 UPDATE + 4 条 modality + 后端 PATCH 400（生产已 apply）
- vitest 306 PASS（+22 F-BAX-08 单测）/ tsc / build 全过

## 生产验证证据（2026-04-25）
- 抽查 5 条 channel 比值 1.1993-1.2017 ✓
- 幂等重跑 30+4=34 条 [no change] ✓
- seedream-3 live smoke trc_yek776bpwrohgjqaj9fw0dsn → call_logs.costPrice=0.005069 USD ✓（F-BAX-07 #11 已解）
- PATCH IMAGE+perCall=0 → 400 / TEXT → 200 ✓
- 4 条 modality 已是 TEXT ✓

## 副作用数据修复
- tripplezhou@gmail.com defaultProjectId 由不存在 project 改到 admin_test1（FK 违规阻塞 image post-process）
- 建议 P2 顺手扫所有用户 defaultProjectId 数据 hygiene

## smoke 范围限制
- gpt-image-mini / gemini-3-pro-image alias 路由到 OpenRouter（OR 6 条本批次延后），属预期非失败
- 唯一覆盖 30 条 non-OR channel 的 enabled alias 是 seedream-3，已验证

## P2 / 后续 backlog
- BL-BILLING-AUDIT-EXT-P2：Tier 2 balance snapshot + reconcile-job + admin 面板 + call_logs TTL 30d
- BL-IMAGE-PRICING-OR-P2：OR 6 条 token-priced image channel
- 数据 hygiene 扫描：用户 defaultProjectId 指向已存在 project

## Signoff 报告
- docs/test-reports/BL-BILLING-AUDIT-EXT-P1-signoff-2026-04-25.md
- 证据：docs/test-reports/artifacts/bl-billing-audit-ext-p1-reverifying-2026-04-24/pricing-*.log

## Framework 铁律（v0.7.3 → harness-template v0.9.3 已同步）
1. Planner spec 涉及代码细节 Read 源码 + file:line 引用
1.1. acceptance 的"实现形式"与"语义意图"分离
2. Code Review 断言按线索，源码+生产数据双路核实
2.1. 协议返回形式断言标明协议层

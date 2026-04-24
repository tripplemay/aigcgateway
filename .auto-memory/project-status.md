---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-BILLING-AUDIT-EXT-P1：`reverifying` fix_round=2 完成**（7/7 generator feature 完成，交 Codex 复验 #11 + F-BAX-08 13 项）
- 上一批次 BL-IMAGE-PARSER-FIX：done（生产 e9e8963 已部署）
- Path A 主线 11/11 完成；EMERGENCY / LEAN / IMAGE-PARSER-FIX / BILLING-AUDIT-EXT 独立 post-path-a 链

## 本批次 P1 交付（已实现）
- F-BAX-01~06 build + fix_round 1 三个 fetcher bug 生产已通过
- **F-BAX-08 fix_round 2 完成**：30 条 channel 定价硬编码表 + 4 条 modality + dry-run/--apply/幂等脚本 + verify smoke 脚本 + 后端 PATCH 400 IMAGE_CHANNEL_REQUIRES_PERCALL_PRICE
- vitest 306 PASS（+22 新 F-BAX-08 单测）/ tsc / build 全过

## F-BAX-08 未加前端 UI 校验
- 原因：admin console 目前无 channel costPrice 编辑表单（仅 priority 重排 + 删除）
- 后端 PATCH 400 是唯一 enforcement 边界；helper 导出供后续 UI 复用

## Codex reverifying round2 执行步骤
1. ssh 生产 → `npx tsx scripts/pricing/fix-image-channels-2026-04-24.ts` 看 dry-run diff
2. 人工 live 复核 cogview-3 ¥0.25/张（bigmodel.cn/pricing）
3. `--apply` 执行，期望退出 0，抽查 5 条 channel 比值 1.19-1.21
4. 重跑脚本取 "no change"（幂等）
5. `BASE_URL=... API_KEY=... npx tsx scripts/pricing/verify-image-channels-2026-04-24.ts` 三家 smoke costPrice>0
6. curl PATCH IMAGE channel perCall=0 → 400 / TEXT → 200
7. 合并写 #18 signoff（F-BAX-07 + F-BAX-08）

## P2（backlog order=101 / 102）后续启动
- BL-BILLING-AUDIT-EXT-P2：Tier 2 balance snapshot + reconcile-job cron + admin panel + call_logs TTL 30d
- BL-IMAGE-PRICING-OR-P2：OpenRouter 6 条 token-priced image channel

## Framework 铁律（v0.7.3 → harness-template v0.9.3 已同步）
1. Planner spec 涉及代码细节 Read 源码 + file:line 引用
1.1. acceptance 的"实现形式"与"语义意图"分离
2. Code Review 断言按线索，源码+生产数据双路核实
2.1. 协议返回形式断言标明协议层

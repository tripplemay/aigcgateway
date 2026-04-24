---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-BILLING-AUDIT-EXT-P1：`fixing`**（reverifying round1：仅 #11 未通过）
- 上一批次 BL-IMAGE-PARSER-FIX：done（生产 e9e8963 已部署）
- Path A 主线 11/11 完成；EMERGENCY / LEAN / IMAGE-PARSER-FIX / BILLING-AUDIT-EXT 独立 post-path-a 链

## 本批次 P1 交付（已实现）
- F-BAX-01~06 build 完成 + fix-round-1 3 个 Tier 1 fetcher 生产 bug 修复
- vitest 284 PASS / tsc / build 全过
- 生产已部署（migrate + env + provider authConfig 已填 AK/SK + provisioningKey + chatanywhere UA）

## reverifying round1 结果（Codex）
- PASS：#1-#10、#12、#13、#14、#15、#16、#17
- FAIL：#11（seedream-3 生产调用成功但 call_logs.costPrice=0）
- BLOCKED：#18 signoff（被 #11 阻断）
- 复验报告：`docs/test-reports/BL-BILLING-AUDIT-EXT-P1-reverifying-2026-04-24-round1.md`
- 证据目录：`docs/test-reports/artifacts/bl-billing-audit-ext-p1-reverifying-2026-04-24/`

## 下轮 fixing 聚焦
- 生产 `seedream-3` 对应 channel 当前 `costPrice.perCall=0`，需修正为有效单次成本后再复验 #11

## P2（backlog order=101）后续启动
- Tier 2 balance snapshot + reconcile-job cron + admin /admin/reconciliation 面板 + call_logs TTL 30d

## Framework 铁律（v0.7.3 → harness-template v0.9.3 已同步）
1. Planner spec 涉及代码细节 Read 源码 + file:line 引用
1.1. acceptance 的"实现形式"与"语义意图"分离
2. Code Review 断言按线索，源码+生产数据双路核实
2.1. 协议返回形式断言标明协议层

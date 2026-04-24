---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-BILLING-AUDIT-EXT-P1：`fixing` fix_round=2**（新增 F-BAX-08 image pricing 系统性修正）
- 上一批次 BL-IMAGE-PARSER-FIX：done（生产 e9e8963 已部署）
- Path A 主线 11/11 完成；EMERGENCY / LEAN / IMAGE-PARSER-FIX / BILLING-AUDIT-EXT 独立 post-path-a 链

## 本批次 P1 进度
- F-BAX-01~06 build + fix_round 1 三个 fetcher bug 生产复验通过（vitest 284 / probe/sync/admin 日志全通）
- **F-BAX-08 pending**：30 条 image channel 定价 UPDATE + 4 条 modality 修正 + Admin UI 校验 + 后端 Zod + 抽样 smoke

## fix_round 2 决策纪要
- 1A USD 口径（1 USD = 7 CNY）/ 2B OR 6 条延后 / 3A 未知 alias 按 gpt-image-1 中档保守填 / 4A 顺手修 4 条 modality
- sellPrice = costPrice × 1.2
- 延后的 OR 6 条已写入 backlog BL-IMAGE-PRICING-OR-P2（order=102）

## 生产现状
- 扫描确认 40 条 image channel 全体 `costPrice.perCall=0` → 全面修
- 生产凭证已填（AK/SK + provisioningKey + chatanywhere UA）
- 本批次后 OR 6 条仍为 0（token-priced 延后）

## 遗留（fix_round 2 完成后交 Codex reverifying round2）
- F-BAX-07 #11 seedream-3 smoke（依赖 F-BAX-08 UPDATE）
- F-BAX-08 § 4 13 项验收
- #18 signoff 合并报告

## P2（backlog order=101）后续启动
- Tier 2 balance snapshot + reconcile-job cron + admin /admin/reconciliation 面板 + call_logs TTL 30d

## Framework 铁律（v0.7.3 → harness-template v0.9.3 已同步）
1. Planner spec 涉及代码细节 Read 源码 + file:line 引用
1.1. acceptance 的"实现形式"与"语义意图"分离
2. Code Review 断言按线索，源码+生产数据双路核实
2.1. 协议返回形式断言标明协议层

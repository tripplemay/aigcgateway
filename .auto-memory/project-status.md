---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-BILLING-AUDIT-EXT-P1：`fixing` fix_round=1**（Generator 本轮修 3 个 Tier 1 fetcher code bug）
- 上一批次 BL-IMAGE-PARSER-FIX：done（生产 e9e8963 已部署）
- Path A 主线 11/11 完成；EMERGENCY / LEAN / IMAGE-PARSER-FIX / BILLING-AUDIT-EXT 独立 post-path-a 链

## 本批次 P1 交付（已实现）
- F-BAX-01~06 build 完成（272 单测 PASS，tsc/build 全过）
- writeProbeCallLog + SYNC_MODEL_FALLBACK_CHAIN + withFailover attemptChain + AUTH_ALERT + Tier 1 fetcher + admin UI
- 生产已部署（migrate + env + provider authConfig 已填 AK/SK + provisioningKey + chatanywhere UA）

## fix-round-1 处理 3 个生产 code bug（Planner 发现）
1. scripts/test-billing-fetchers.ts FETCHERS['chatanywhere'] 未匹配 DB provider.name='openai' → 加 alias 映射
2. src/lib/billing-audit/fetchers/openrouter.ts normalizeItem date='YYYY-MM-DD HH:MM:SS' Invalid Date → slice(0,10)
3. src/lib/billing-audit/fetchers/volcengine.ts modelName 空串短路 → ConfigName 主选 + 空串过滤

## 生产实测证据（fix 前）
- volcengine: 118 records（modelName 全空）/ openrouter: 62 records 后 Invalid time value / chatanywhere: skip

## 遗留 BLOCKED（fix-round-1 后交 Codex reverifying）
- #11 seedream-3 生产调用确认 call_logs.costPrice > 0（需 Volcengine 账户充值）
- #13/#14/#15 重跑 script 后取非空 BillRecord
- #16/#17 生产 24h 观察 + call_logs source 分组统计

## P2（backlog order=101）后续启动
- Tier 2 balance snapshot + reconcile-job cron + admin /admin/reconciliation 面板 + call_logs TTL 30d

## Framework 铁律（v0.7.3 → harness-template v0.9.3 已同步）
1. Planner spec 涉及代码细节 Read 源码 + file:line 引用
1.1. acceptance 的"实现形式"与"语义意图"分离
2. Code Review 断言按线索，源码+生产数据双路核实
2.1. 协议返回形式断言标明协议层

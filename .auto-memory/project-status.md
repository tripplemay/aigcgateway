---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-BILLING-AUDIT-EXT-P1：`reverifying` fix_round=1 完成**（3 个 Tier 1 fetcher code bug 修复 + 11 新单测）
- 上一批次 BL-IMAGE-PARSER-FIX：done（生产 e9e8963 已部署）
- Path A 主线 11/11 完成；EMERGENCY / LEAN / IMAGE-PARSER-FIX / BILLING-AUDIT-EXT 独立 post-path-a 链

## 本批次 P1 交付（已实现）
- F-BAX-01~06 build 完成 + fix-round-1 3 个 Tier 1 fetcher 生产 bug 修复
- vitest 284 PASS / tsc / build 全过
- 生产已部署（migrate + env + provider authConfig 已填 AK/SK + provisioningKey + chatanywhere UA）

## fix-round-1 修复内容
1. scripts/test-billing-fetchers.ts 加 FETCHER_ALIAS {chatanywhere:'openai'} + resolveProviderName + argv[1] 末尾判断避免测试 import 误触发 main()
2. openrouter.ts normalizeItem 用 item.date.slice(0,10) + 正则校验避免 'YYYY-MM-DD HH:MM:SS' Invalid Date
3. volcengine.ts ListBillDetailItem 加 ConfigName；modelName 用 firstNonEmpty(ConfigName,InstanceName,ProductName)+trim 过滤空串

## 遗留 BLOCKED（交 Codex reverifying）
- #11 seedream-3 生产调用确认 call_logs.costPrice > 0（需 Volcengine 账户充值）
- #13/#14/#15 重跑 script 取非空 BillRecord（fix 后预期：volcengine modelName 非空 / openrouter 全量 / chatanywhere→openai 能解析）
- #16/#17 生产 24h 观察 + call_logs source 分组统计

## P2（backlog order=101）后续启动
- Tier 2 balance snapshot + reconcile-job cron + admin /admin/reconciliation 面板 + call_logs TTL 30d

## Framework 铁律（v0.7.3 → harness-template v0.9.3 已同步）
1. Planner spec 涉及代码细节 Read 源码 + file:line 引用
1.1. acceptance 的"实现形式"与"语义意图"分离
2. Code Review 断言按线索，源码+生产数据双路核实
2.1. 协议返回形式断言标明协议层

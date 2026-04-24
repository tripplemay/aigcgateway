---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-BILLING-AUDIT-EXT-P1：`fixing`**（Codex 首轮验收：本地项通过，生产依赖项 BLOCKED）
- 上一批次 BL-IMAGE-PARSER-FIX：done（生产 e9e8963 已部署）
- Path A 主线 11/11 完成；EMERGENCY / LEAN / IMAGE-PARSER-FIX / BILLING-AUDIT-EXT 独立 post-path-a 链

## 本批次交付（P1）
- F-BAX-01 migration 20260424_call_logs_source_extend（projectId nullable + source 扩展）
- F-BAX-02 writeProbeCallLog + scheduler/admin 路径 source='probe'|'admin_health'
- F-BAX-03 src/lib/sync/internal-llm.ts + SYNC_MODEL_FALLBACK_CHAIN（deepseek→glm-4.7→doubao-pro）
- F-BAX-04 withFailover.attemptChain + getAttemptChainFromError + 5 调用方接入
- F-BAX-05 AUTH_ALERT enum 新 value + maybeFireAuthAlert + sanitize 新 3 规则
- F-BAX-06 billing-audit/fetchers/（volcengine V4/openrouter/chatanywhere UA）+ authConfig 扩展 + admin UI
- 新增单测 43 条（总 272），tsc + build 全过

## P2（backlog order=101）下批启动
- Tier 2 balance snapshot + reconcile-job cron + admin /admin/reconciliation 面板 + call_logs TTL 30d

## 本轮 verifying 结果（Reviewer / 2026-04-24）
- PASS：#1-#10、#12（build/tsc/vitest=272；admin_health/probe/sync/attempt_chain 动态证据齐全）
- BLOCKED：#11、#13、#14、#15、#16、#17（生产充值/凭证/24h 观察窗口依赖）
- #18 signoff 被 BLOCKED 项阻断，`docs.signoff=null`
- 报告：`docs/test-reports/BL-BILLING-AUDIT-EXT-P1-verifying-2026-04-24.md`
- 动态脚本：`scripts/test/bl-billing-audit-ext-p1-verifying-2026-04-24.ts`
- 证据目录：`docs/test-reports/artifacts/bl-billing-audit-ext-p1-verifying-2026-04-24/`

## 遗留提醒（下一轮 reverifying 前置）
- 生产执行 #11：seedream-3 手动调用并确认 `call_logs.costPrice > 0`
- 生产执行 #13/#14/#15：填入真实 billing 凭证后跑 `scripts/test-billing-fetchers.ts`
- 生产执行 #16/#17：部署后 24h 观察与 source 分组统计补证

## Framework 铁律（v0.7.3 → harness-template v0.9.3 已同步）
1. Planner spec 涉及代码细节 Read 源码 + file:line 引用
1.1. acceptance 的"实现形式"与"语义意图"分离
2. Code Review 断言按线索，源码+生产数据双路核实
2.1. 协议返回形式断言标明协议层

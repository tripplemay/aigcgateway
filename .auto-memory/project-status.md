---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-BILLING-AUDIT-EXT-P1：`verifying`**（6/6 generator feature 完成 → 待 Codex 验收 F-BAX-07 18 项）
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

## 遗留提醒 Codex 关注
- F-BAX-06 生产实测（acceptance 13/14/15）需 DB 真填 billing 凭证后跑 scripts/test-billing-fetchers.ts
- F-BAX-04 seedream-3 图片调用 costPrice>0 需生产 manual 触发验证（已加 WARN 日志）
- AUTH_ALERT migration 是 enum ADD VALUE，生产 `npx prisma migrate deploy` 时无 drift

## Framework 铁律（v0.7.3 → harness-template v0.9.3 已同步）
1. Planner spec 涉及代码细节 Read 源码 + file:line 引用
1.1. acceptance 的"实现形式"与"语义意图"分离
2. Code Review 断言按线索，源码+生产数据双路核实
2.1. 协议返回形式断言标明协议层

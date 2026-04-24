---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-BILLING-AUDIT-EXT-P1：`building`**（P0，2.6d，7 features：6 generator + 1 codex）
- 上一批次 BL-IMAGE-PARSER-FIX：done（生产 e9e8963 已部署）
- Path A 主线 11/11 完成；EMERGENCY / LEAN / IMAGE-PARSER-FIX / BILLING-AUDIT-EXT 独立 post-path-a 链

## 本批次目标（P1）
- F-BAX-01 CallLog schema 扩展（source 新增 probe/sync/admin_health；projectId nullable）
- F-BAX-02 health probe 路径补 call_log（runTextCheck/runCallProbe/admin probe/check）
- F-BAX-03 sync 工具改用 adapter + fallback 链（deepseek→glm-4.7→doubao-pro）
- F-BAX-04 withFailover attemptChain + image costPrice regression fix
- F-BAX-05 auth_failed 告警（连续 3 次 + 24h dedup） + 错误文本转译（sanitize URL/ApiKey）
- F-BAX-06 Tier 1 上游账单 fetcher（Volcengine V4 / OpenRouter provisioning key / ChatanyWhere UA header）
- F-BAX-07 Codex 18 项验收

## P2（backlog order=101）下批启动
- Tier 2 balance snapshot + reconcile-job cron + admin /admin/reconciliation 面板 + call_logs TTL 30d

## 决策收敛（2026-04-24 与用户）
- 方案 A 统一 audit 层 / A=进 Gateway DB / B=对账专用 fetch / C=Tier 2 余额 delta 做 / D1=Tier 3 不做 / E=不做告警阈值 / F=面板完整 / G2=TTL 30d / 风险1=加 fallback / 风险4=面板完整 / 拆 2 批

## 关键调查发现（本批次背景）
- Volcengine 外部 cron 已止（ark-ef66 key 切换 04-23 12:56）
- Zhipu 外部 cron 已止（f0d519 切换 04-23 18:06）
- OpenRouter 4 月 $200：~$166 外部 burst（04-01~04-07）+ ~$34 Gateway pre-LEAN 自损
- 新发现盲区：probe / sync 路径完全无 call_logs（本批次 F-BAX-02/03 修复）

## Framework 铁律（v0.7.3 → harness-template v0.9.3 已同步）
1. Planner spec 涉及代码细节 Read 源码 + file:line 引用
1.1. acceptance 的"实现形式"与"语义意图"分离
2. Code Review 断言按线索，源码+生产数据双路核实
2.1. 协议返回形式断言标明协议层

## 生产状态
- HEAD 待推：本次 P1 launch commit
- BL-IMAGE-PARSER-FIX framework_reviewed=false（无待同步 learnings，launch 时一并标 true）

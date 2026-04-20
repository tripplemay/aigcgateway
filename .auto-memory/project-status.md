---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-HEALTH-PROBE-LEAN：`done`**（Codex 已签收：L1 1-9/14 PASS，10-13 按规格 48h 生产观察）
- 上一批次 BL-HEALTH-PROBE-EMERGENCY：done（10/10 PASS）
- Path A 主线 11/11 已完成；EMERGENCY / LEAN 独立链

## 本批次交付（Generator）
- F-HPL-01 runTextCheck 三级 → 单级 CONNECTIVITY + max_tokens 200→1
- F-HPL-02 expensive-models whitelist（search/reasoning/o1/o3/pro-preview），scheduler skip
- F-HPL-03 admin/health API PERCENTILE_CONT 1h/24h p50/p95 + page 显示真流量
- F-HPL-04 +33 单测（4 checker-lean + 13 expensive + 4 scheduler + 12 增量）
- F-HPL-06 hotfix: providers openEdit 去 name prefill + 编辑模式 fields 隐藏 name
- 本地 tsc / vitest 216/216（+33）/ build 全过

## 本批次目标（LEAN）
- F-HPL-01 runTextCheck 降单级 + max_tokens:1（删 FORMAT/QUALITY），心智：每 10min 发 1 token，有返回即健康
- F-HPL-02 昂贵模型 whitelist（search/reasoning/o1/o3/pro-preview）scheduler 跳过 probe + call probe
- F-HPL-03 admin p50/p95 改 call_logs 聚合（近 1h/24h），零流量 channel N/A
- F-HPL-04 单测覆盖（checker + scheduler + expensive-models）
- F-HPL-06 hotfix：/admin/providers 编辑弹窗不显示 name（F-IG-01 strict 拒绝 name 但前端 prefill 导致 400）
- F-HPL-05 Codex 14 项验收（单测 3 + 功能 4 + hotfix 2 + 生产 4 + signoff 1）

## 预期收益
- 上游日成本从 $15（chatanywhere $11 + openrouter $4）降至 < $0.5
- gpt-4o-mini-search-preview 等昂贵模型日 probe 降至 0
- 生产 /admin/providers 编辑流程恢复可用

## 不动的契约（铁律）
- FAIL_THRESHOLD=3 / DEGRADED/DISABLED 状态机语义 / fix round 1 DISABLED→DEGRADED 自动复活
- routeByAlias / withFailover / cooldown / Prisma schema
- F-IG-01 后端 providerUpdateSchema.strict() 安全契约（name 拒绝仍保留，前端对齐）

## Backlog 紧接后续
- **BL-BILLING-AUDIT**（1.5-2d，LEAN 稳定 24h 后）：channelId 错位 / image costPrice / failover 中间审计 / auth_failed 告警 / 错误文本转译

## Framework 铁律（v0.7.3 → harness-template v0.9.3 已同步）
1. Planner spec 涉及代码细节 Read 源码 + file:line 引用
1.1. acceptance 的"实现形式"与"语义意图"分离
2. Code Review 断言按线索，源码+生产数据双路核实
2.1. 协议返回形式断言标明协议层

## 生产状态
- LEAN 验收基线：本地 HEAD `b09dee0`（含 F-HPL-06 热修）
- 生产动态证据待 LEAN 部署后补采（10-13 观察项，48h）

---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-HEALTH-PROBE-LEAN：`building`**（P0，0.8d，6 features：5 generator + 1 codex）
- 上一批次 BL-HEALTH-PROBE-EMERGENCY：done（10/10 PASS，commits 488d1d8 + 9382165 推 main）
- Path A 主线 11/11 已完成；EMERGENCY / LEAN 为独立 emergency 链，不计入 Path A 序号

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
- HEAD 待推：LEAN 批次 launch commit（本次）
- EMERGENCY 已推 main（488d1d8 + 9382165），等用户触发 Deploy workflow
- 每天 ~$15 probe 流血持续到 LEAN 上线

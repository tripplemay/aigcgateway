---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前状态
- **空闲**：无进行中批次。等待下一批次指令
- 最近完成：BL-HEALTH-PROBE-LEAN done（2026-04-20，6/6 + Codex 10 PASS），生产已部署
- 上一批次：BL-HEALTH-PROBE-EMERGENCY done（10/10 PASS），生产已部署

## 生产 baseline
- HEAD `2389de4`（LEAN signoff）已上线
- ACTIVE text probe max_tokens 200→1 + 昂贵模型豁免 + p50/p95 改 call_logs + /admin/providers edit hotfix 全部生效
- 预期：上游日成本 $15 → < $0.5（48h 观察项 10-13 待跟踪）

## Path A 状态
- 主线 11/11 已完成 + 2 插入批次（EMERGENCY + LEAN）均 done
- 延后候选：INFRA-GUARD-FOLLOWUP（Next.js 16） / FE-DS-SHADCN / FE-QUALITY-FOLLOWUP / PAY-DEFERRED

## Backlog 下一候选
- **BL-BILLING-AUDIT**（1.5-2d，order 100，follows LEAN）：call_logs channelId 错位 / image costPrice 缺失 / failover 中间审计 / auth_failed 告警 / 错误文本转译

## Framework 铁律（v0.7.3 → harness-template v0.9.3 已同步）
1. Planner spec 涉及代码细节 Read 源码 + file:line 引用
1.1. acceptance 的"实现形式"与"语义意图"分离
2. Code Review 断言按线索，源码+生产数据双路核实
2.1. 协议返回形式断言标明协议层

## 待跟踪（动态观察）
- LEAN 部署后 48h（~2026-04-22）：chatanywhere day_usage_details 降幅 > 95% / OpenRouter < $0.5/day / gpt-4o-mini-search-preview probe 数 = 0 / 生产 /admin/providers 编辑验证

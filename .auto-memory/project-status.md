---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-SEC-INFRA-GUARD：`reverifying`**（fix round 1 完成）
- Path A 进度 4/11（合并后）

## 本轮 fix（round 1）
- F-IG-02 leader-lock 重写：禁 fallback，启动 waitForRedisReady(5000) 超时整节点降级 'scheduler disabled'；acquire/heartbeat 统一 Redis 来源
- F-IG-04 / F-IG-06 按 Planner 新 spec 不改代码（MCP isError 即协议标准；Next.js 接受 partial）

## 本批次产物
- Generator fix round 0：7 commits 已推送（172ba68 ~ cfc5e0d）
- Generator fix round 1：本会话 1 commit（redis.ts + leader-lock.ts + instrumentation.ts + leader-lock.test.ts）
- 本地：tsc / build / vitest 115 → 116 全绿

## 生产状态
- HEAD `8295315`（Planner spec 修订后）
- 已部署：CRED-HARDEN / AUTH-SESSION / BILLING-AI / BILLING-CHECK-FOLLOWUP
- INFRA-GUARD 等 Evaluator 复验签收后部署

## Framework 铁律（2026-04-18 v0.7.x）
1. Planner 写 spec 涉及代码细节必须 Read 源码 + file:line 引用
2. Code Review 断言按"线索"不按"真相"，源码+生产数据双路核实
3. （待 Planner 确认）spec 涉及协议/标准（如 MCP isError）必须核实官方文档

## Path A 合并后路线图（11 批次）
- P0 安全：CRED-HARDEN ✅ / AUTH-SESSION ✅ / BILLING-AI ✅ / BILLING-CHECK-FOLLOWUP ✅ / INFRA-GUARD ← reverifying
- P0 前端：(5) FE-PERF-01 2d
- P1 质量：(6) BL-FE-QUALITY 3.5d ← 合并 UX+A11y+DS-Critical
- P1 数据：(7) DATA-CONSISTENCY 1d / (8) INFRA-RESILIENCE 1.5d
- P2 细节：(9) BL-SEC-POLISH 1.5d ← 合并 auth+SSRF+script / (10) INFRA-ARCHIVE 1d / (11) FE-DS-SHADCN 2d
- 候选：INFRA-GUARD-FOLLOWUP（Next.js 16 迁移 2-3d）
- 延后：PAY-DEFERRED 1-2d

## 已知 gap（非阻塞）
- dev DB migrate drift / 5 image supportedSizes / get-balance.ts TS2353 / landing.html href="#" / CI secrets / jose Edge warning

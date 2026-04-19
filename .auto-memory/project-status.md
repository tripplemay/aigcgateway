---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-INFRA-ARCHIVE：`building`**（P2-polish 第 2 批，**范围收缩 1d→0.5d**，2 features：1 generator + 1 codex）
- Path A 进度 10/11（合并后）

## 上一批次（BL-SEC-POLISH done）
- 18/18 PASS（按 2026-04-19 裁决口径），fix_rounds=1
- 首次应用 **Generator 裁决申请流程**（docs/adjudications/），Planner 裁决保留实现+修订 spec
- Signoff: `docs/test-reports/BL-SEC-POLISH-signoff-2026-04-19.md`

## 本批次范围收缩依据（2026-04-20 生产实测）
- health_checks 109,828 行 / 42 MB / 月增 400K ← 热点，30d TTL
- system_logs 930 行 / 536 kB ← 90d TTL
- call_logs 721 行 / 2.3 MB ← 业务量小不分区，未来批次触发
- notifications 0 行（已在 BL-DATA-CONSISTENCY 处理）

## Framework 提案池（3 条未消化）
1. Next.js App Router 私有目录约定（BL-FE-QUALITY round 5）
2. Generator 裁决申请机制（BL-SEC-POLISH 首发应用）
3. Planner 自检规则（防铁律 2.1 反例再发）

## Framework 铁律（v0.7.3 已采纳）
1. Planner spec 涉及代码细节 Read 源码 + file:line 引用
1.1. acceptance 的"实现形式"与"语义意图"分离
2. Code Review 断言按线索，源码+生产数据双路核实
2.1. 协议返回形式断言标明协议层

## 生产状态
- HEAD `82ca4b7`（BL-SEC-POLISH signoff 后）
- 10 批 Path A 代码待用户触发 deploy

## Path A 剩余路线
- P2：INFRA-ARCHIVE ← building / FE-DS-SHADCN 2d（压轴）
- 延后候选：INFRA-GUARD-FOLLOWUP（Next.js 16 迁移 2-3d）/ BL-FE-QUALITY-FOLLOWUP
- 延后：PAY-DEFERRED 1-2d

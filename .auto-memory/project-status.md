---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-SEC-POLISH：`building`**（合并批次，P2-polish 第 1 批，1.5d，4 features：3 generator + 1 codex）
- Path A 进度 9/11（合并后）

## 上一批次（BL-INFRA-RESILIENCE done）
- 15/15 PASS，fix_rounds=1（仅修 stream cancel）
- 关键产物：fetchWithTimeout 双 API + rpmCheck Lua（生产探针 cmdstat_eval +9 实测）+ reconcile batch（40→5 次 DB 往返）
- Signoff: `docs/test-reports/BL-INFRA-RESILIENCE-signoff-2026-04-19.md`

## 本批次目标（三组合并）
- **AUTH**：login 顺序修正（防时序 oracle）+ bcrypt cost 10→12 + login/register rate limit（IP 10/min + account 5/min）
- **SSRF/CT**：isSafeWebhookUrl 白名单（仅 https + 非私网/元数据）+ image-proxy Content-Type 白名单
- **脚本硬化**：e2e-errors setup fatal + stress-test 日期动态 + setup-zero-balance 合法 bcrypt + e2e-test webhook TODO + run-template test_mode 补 rate limit

## Framework 提案池（1 条未消化）
- Next.js App Router 私有目录约定（等 Path A 全部完成后批量同步到 harness-template）

## Framework 铁律（v0.7.3 已采纳）
1. Planner spec 涉及代码细节 Read 源码 + file:line 引用
1.1. acceptance 的"实现形式"与"语义意图"分离
2. Code Review 断言按线索，源码+生产数据双路核实
2.1. 协议返回形式断言标明协议层

## 生产状态
- HEAD `d5c2180`（BL-INFRA-RESILIENCE signoff 后）
- 9 批 Path A 代码待用户触发 deploy

## Path A 剩余路线
- P2：SEC-POLISH ← building / INFRA-ARCHIVE 1d / FE-DS-SHADCN 2d
- 延后候选：INFRA-GUARD-FOLLOWUP（Next.js 16 迁移 2-3d）/ BL-FE-QUALITY-FOLLOWUP
- 延后：PAY-DEFERRED 1-2d

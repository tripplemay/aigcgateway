---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-DATA-CONSISTENCY：`verifying`**（Generator 3/3 done，等 Codex F-DC-04 17 项）
- Path A 进度 7/11

## 上一批次（BL-FE-QUALITY done）
- fix_rounds=5（最艰难批次），round 8 PASS 签收
- 关键修复：`__error-test` → `error-test`（Next.js 私有目录约定）

## 本批次交付（Generator）
- **schema**：TemplateStep +actionId idx / AliasModelLink +aliasId+modelId idx / EmailVerificationToken FK onDelete Cascade / Notification +expiresAt + idx
- **migration**：`20260419_data_consistency` 幂等（IF NOT/EXISTS），本地 deploy 通过
- **listPublicTemplates**：latest/top_rated 真正 DB orderBy+skip+take+count；popular/recommended take:200 上限兜底
- **notifications TTL**：ttl.ts / cleanup.ts / scheduler.ts（24h）/ dispatcher 2 处 create 注入 expiresAt
- 本地 checks：tsc / vitest 134/134（+12）/ build 全过

## Framework 仓库分离（v0.9.0）
- 本项目不再维护 `framework/` 子目录（已分离到 `tripplemay/harness-template`）
- proposed-learnings 暂存在 `.auto-memory/proposed-learnings.md`

## Framework 铁律（v0.7.3 已采纳）
1. Planner 写 spec 涉及代码细节必须 Read 源码 + file:line 引用
1.1. acceptance 的"实现形式"与"语义意图"必须分离
2. Code Review 断言按线索，源码+生产数据双路核实
2.1. 协议返回形式断言必须标明协议层（HTTP / MCP / WebSocket）

## 生产状态
- HEAD `994a665`（BL-FE-QUALITY signoff 后）+ Path A 代码待 deploy

## Path A 合并后路线图（剩余）
- P1 数据：DATA-CONSISTENCY ← verifying / INFRA-RESILIENCE 1.5d
- P2 细节：SEC-POLISH 1.5d / INFRA-ARCHIVE 1d / FE-DS-SHADCN 2d
- 延后候选：INFRA-GUARD-FOLLOWUP 2-3d / BL-FE-QUALITY-FOLLOWUP（剩余 aria-label）
- 延后：PAY-DEFERRED 1-2d

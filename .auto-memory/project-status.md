---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-DATA-CONSISTENCY：`building`**（P1-data 第 1 批，1d 轻量，4 features：3 generator + 1 codex）
- Path A 进度 7/11（合并后）

## 上一批次（BL-FE-QUALITY done）
- fix_rounds=5（最艰难批次），round 8 PASS 签收
- 关键修复：`__error-test` → `error-test`（Next.js App Router `_` 前缀为私有目录不生成 route）
- 产物：9 处 reload→refresh / settings 双事件 / keys 复制提示 / notif 可见性 / admin batched / Decimal 精度 / error.tsx i18n / aria-label / 3 个 DS Critical 文件 token 清零

## 本批次目标
- 补 3 个缺失外键索引：`TemplateStep.actionId` / `AliasModelLink.aliasId` / `AliasModelLink.modelId`
- `EmailVerificationToken.userId` 加 onDelete=Cascade
- `Notification` 加 `expiresAt` 字段 + cron 清理 + 按类型注入默认 TTL
- `listPublicTemplates` 全表加载改 DB 级 `orderBy + skip + take` 分页

## Framework 仓库分离（v0.9.0）
- 本项目不再维护 `framework/` 子目录（已分离到 `tripplemay/harness-template`）
- proposed-learnings 暂存在 `.auto-memory/proposed-learnings.md`
- done 阶段 Planner 批量同步到 harness-template repo

## 新经验候选（BL-FE-QUALITY 沉淀）
- Next.js App Router 私有目录约定：`_` / `__` 前缀目录不生成 route（待确认后同步到 harness-template）

## Framework 铁律（v0.7.3 已采纳）
1. Planner 写 spec 涉及代码细节必须 Read 源码 + file:line 引用
1.1. acceptance 的"实现形式"与"语义意图"必须分离
2. Code Review 断言按线索，源码+生产数据双路核实
2.1. 协议返回形式断言必须标明协议层（HTTP / MCP / WebSocket）

## 生产状态
- HEAD `994a665`（BL-FE-QUALITY signoff 后）
- 7 批 Path A 代码待用户触发 deploy

## Path A 合并后路线图（剩余）
- P1 质量 ✅ / P1 数据：DATA-CONSISTENCY ← / INFRA-RESILIENCE 1.5d
- P2 细节：SEC-POLISH 1.5d / INFRA-ARCHIVE 1d / FE-DS-SHADCN 2d
- 延后候选：INFRA-GUARD-FOLLOWUP（Next.js 16 迁移 2-3d）/ BL-FE-QUALITY-FOLLOWUP（剩余 aria-label）
- 延后：PAY-DEFERRED 1-2d

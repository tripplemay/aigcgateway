---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## Path A 主线完成 🎉（10 批 + 1 插入 = 11 次 done）
- ✅ P0 安全 5 批（CRED / AUTH-SESSION / BILLING-AI / INFRA-GUARD + BILLING-CHECK-FOLLOWUP 插入）
- ✅ P0 前端 1 批（FE-PERF-01）
- ✅ P1 质量 1 批（FE-QUALITY 合并）
- ✅ P1 数据 2 批（DATA-CONSISTENCY / INFRA-RESILIENCE）
- ✅ P2 细节 2 批（SEC-POLISH 合并 / INFRA-ARCHIVE）

## 最后批次延后（2026-04-20 决策）
- **BL-FE-DS-SHADCN** → `deferred`（边际收益低 + UI 回归风险；未来新 UI 迭代时再启用或拆 Mini-A 0.5d）

## 累计交付（全部通过 Evaluator 签收）
- Code Review 15 Critical 全修（支付 2 条延后到 PAY-DEFERRED）
- 46 High 绝大多数修复（少数延后：reconcile.resolveCanonicalName / list_actions activeVersion / Next.js 16 迁移）
- 新增 172/172 单测（原 96 → 172，+76 条覆盖）
- 关键基础设施：leader-lock / fetchWithTimeout / rpmCheck Lua / auth-rate-limit / maintenance scheduler

## Framework 提案池（3 条待用户确认同步 harness-template repo）
1. Next.js App Router 私有目录约定（BL-FE-QUALITY round 5）
2. Generator 裁决申请机制（BL-SEC-POLISH 首发，docs/adjudications/ 模板）
3. Planner 自检规则（对照已采纳铁律清单自检，防反例再发）

## 延后候选（等用户决定时机）
- INFRA-GUARD-FOLLOWUP（Next.js 16 迁移 2-3d）— 独立批次因 breaking
- FE-DS-SHADCN（2d）— 代码质量，边际收益低
- FE-QUALITY-FOLLOWUP（aria-label 剩余）— 小修
- PAY-DEFERRED（1-2d）— 支付接入前 1 周启动

## 生产状态
- HEAD `96e3ae1`（BL-INFRA-ARCHIVE signoff 后）
- **10 批 Path A 代码累计待用户触发 deploy**
- framework 铁律 v0.7.3（Planner 1/1.1/2/2.1 共 4 条）

## 后续决策节点
- Framework 3 条提案是否立即同步 harness-template？
- Path A 后下一方向：新功能需求 / 延后候选 / 其他

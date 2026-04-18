---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-FE-QUALITY：`reverifying`**（fix_rounds=1，等 Codex 复验 a11y + BLOCKED 项）
- Path A 进度 7/11

## 上一批次（BL-FE-PERF-01 done）
- Evaluator signoff PASS（按修订口径通过 i18n 两项）
- 成果：dashboard 281→169 / usage 272→159 / admin-usage 227→112 kB；LCP 159ms / CLS 0.00

## 本批次交付（Generator）
- **UX**：9 处 reload→router.refresh / settings 双事件修 / keys 复制按钮 disabled+i18n / notif 可见性门控 / admin/usage Promise.all 合并
- **Template**：admin templates PATCH 加 body catch+400 / test-runner Prisma.Decimal 精度 / waitForCallLog 30→10 + warn
- **A11y+i18n**：error.tsx i18n / admin/models Free/Degraded i18n / notif timeAgo+rate 本地化 / top-app-bar aria-label
- **DS Critical**：dashboard 9 / admin/operations 27 / admin/logs 24 行 token 违规全清零
- 本地 checks：tsc / vitest 116/116 / build 全过；3 文件 grep token = 0

## 生产状态
- HEAD `a954c46`（BL-FE-PERF-01 signoff+launch FE-QUALITY 后）
- 7 批 Path A 代码（含 BL-FE-PERF-01）等用户触发 deploy

## Framework 铁律（2026-04-18 v0.7.3）
1. Planner 写 spec 涉及代码细节必须 Read 源码 + file:line 引用
1.1. acceptance 的'实现形式'与'语义意图'必须分离
2. Code Review 符号/类型/约束断言按线索，源码+生产数据双路核实
2.1. 协议返回形式断言必须标明协议层（HTTP / MCP / WebSocket）
Generator 经验：dynamic import 模块边界（常量抽独立 *-constants.ts）

## Path A 合并后路线图
- P0 安全 ✅ 5 批 / P0 前端 ✅ FE-PERF-01
- P1 质量：FE-QUALITY ← verifying / P1 数据：DATA-CONSISTENCY 1d / INFRA-RESILIENCE 1.5d
- P2 细节：SEC-POLISH 1.5d / INFRA-ARCHIVE 1d / FE-DS-SHADCN 2d
- 延后：INFRA-GUARD-FOLLOWUP 2-3d / PAY-DEFERRED 1-2d

## 本批次 follow-up
- aria-label 完整 audit（top-bar/notif 已覆盖，admin 页 icon-only buttons 待）

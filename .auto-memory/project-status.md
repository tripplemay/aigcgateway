---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-FE-QUALITY：`building`**（合并批次 3.5d，P1-quality 第 1 批，5 features：4 generator + 1 codex）
- Path A 进度 6/11（合并后），第二波 P0 前端完成 🎉

## 上一批次（BL-FE-PERF-01 done）
- Evaluator signoff PASS（按修订口径通过 i18n 两项）
- 成果：dashboard 281→169 / usage 272→159 / admin-usage 227→112 kB；LCP 159ms / CLS 0.00
- 产物：charts-section + charts-constants 双文件 / intl 动态 / RSC redirect / loading.tsx

## 本批次目标（三组）
- **UX**：9 处 `window.location.reload` → `router.refresh`；settings 双事件修；keys 复制脱敏修；notif 可见性门控；admin 批聚合请求
- **template-testing polish**：admin templates PATCH try/catch；test-runner Prisma.Decimal 累加；waitForCallLog timeout 3s→1s
- **A11y + i18n**：aria-label 批量；error.tsx / admin-models Free/Degraded / notif timeAgo+汇率本地化；Lighthouse A11y ≥ 98
- **DS Critical**：admin/operations 33 处 / dashboard 24 处 / admin/logs 24 处 token 违规清零

## Framework 铁律（2026-04-18 v0.7.3）
1. Planner 写 spec 涉及代码细节必须 Read 源码 + file:line 引用
1.1. acceptance 的'实现形式'与'语义意图'必须分离
2. Code Review 符号/类型/约束断言按线索，源码+生产数据双路核实
2.1. 协议返回形式断言必须标明协议层（HTTP / MCP / WebSocket）
Generator 经验：dynamic import 模块边界（常量抽独立 *-constants.ts）

## 生产状态
- HEAD `8d521ad`（FE-PERF-01 signoff 后）
- 6 批 Path A 代码已部署验收完毕（待用户触发 deploy）

## Path A 合并后路线图
- P0 安全 ✅ 5 批 / P0 前端 ✅ FE-PERF-01
- P1 质量：FE-QUALITY ← building / P1 数据：DATA-CONSISTENCY 1d / INFRA-RESILIENCE 1.5d
- P2 细节：SEC-POLISH 1.5d / INFRA-ARCHIVE 1d / FE-DS-SHADCN 2d
- 延后候选：INFRA-GUARD-FOLLOWUP 2-3d / PAY-DEFERRED 1-2d

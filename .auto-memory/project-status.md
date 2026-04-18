---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-SEC-INFRA-GUARD：`building`**（2.5d，P0-security 第 4 批，最大批次）
- 7 features（6 generator + 1 codex）覆盖 CRIT-8/9/10 + H-11/12/13/14/29/30/31
- Path A 进度 4/14.5，完成后进入第二波 P0 前端 FE-PERF-01

## 上一批次（BL-SEC-BILLING-CHECK-FOLLOWUP done）
- Reviewer 签收 14/14 PASS（signoff 已归档），生产 v2 CHECK 约束已应用
- Planner 补齐状态机：progress.json `verifying → done` + features.json F-BCF-02 completed
- Framework 收尾：采纳 2 条铁律写入 `framework/harness/planner.md` + CHANGELOG v0.7.1

## Framework 新增铁律（2026-04-18）
1. Planner 写 spec 涉及代码细节必须 Read 源码 + file:line 引用
2. Code Review 报告的符号/类型/约束断言按"线索"不按"真相"，必须源码+生产数据双路核实

## 生产状态
- HEAD `7fb2819`（BILLING-CHECK-FOLLOWUP signoff + artifacts）
- 生产已应用：CRED-HARDEN / AUTH-SESSION / BILLING-AI F-BA-01+02 / BILLING-CHECK-FOLLOWUP v2 CHECK
- 12 个公共营销模板上线，zhipu glm-4.7-flash 四向状态机闭环

## 本批次目标
- admin PATCH 三处 mass assignment → zod 白名单
- scheduler/model-sync 进程内锁 → Redis 分布式锁
- stress-test shell 注入 → spawn 数组
- MCP fork-public-template 权限 + IP 白名单语义统一
- checkBalanceAlerts Redis 去重
- Next.js+glob 依赖升级消除 5 high + 3 moderate audit

## Path A 执行路线图（14+1 批次）
- P0 安全：CRED-HARDEN ✅ / AUTH-SESSION ✅ / BILLING-AI ✅ / BILLING-CHECK-FOLLOWUP ✅ / INFRA-GUARD ←
- P0 前端：FE-PERF-01
- P1 质量：FE-UX-QUALITY / FE-A11Y-I18N-DS
- P1 数据：DATA-CONSISTENCY / INFRA-RESILIENCE
- P2 细节：AUTH-HYGIENE / SSRF-INPUT / SCRIPT-HYGIENE / INFRA-ARCHIVE / FE-DS-SHADCN
- 延后：PAY-DEFERRED

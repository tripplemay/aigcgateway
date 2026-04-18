---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-SEC-INFRA-GUARD：`fixing`**（Codex 首轮验收未通过，待 Generator 修复）
- Path A 进度 4/11（合并后）

## 本轮验收结论（2026-04-18）
- PASS：admin PATCH 白名单/baseUrl / shell 注入负测 / 空白名单 key=401 / balance 告警去重 / build+tsc+vitest
- FAIL：
  1) F-IG-02 分布式锁单主不成立（双实例都成为 leader，后续都 lost leadership）
  2) F-IG-04 projectInfo:false 调 fork_public_template 返回 MCP 200+isError，非 403
  3) F-IG-06 仍 1 high（next，按 spec 回退条款可接受 partial）
- 报告：`docs/test-reports/bl-sec-infra-guard-verifying-local-2026-04-18.md`

## 生产状态
- HEAD `e45d469`（BILLING-CHECK-FOLLOWUP signoff 后）
- 已部署：CRED-HARDEN / AUTH-SESSION / BILLING-AI / BILLING-CHECK-FOLLOWUP
- INFRA-GUARD 暂不部署，待 fix round 1 完成后再评

## Framework 铁律（2026-04-18 v0.7.1）
1. Planner 写 spec 涉及代码细节必须 Read 源码 + file:line 引用
2. Code Review 符号/类型/约束断言按"线索"不按"真相"，源码+生产数据双路核实

## Path A 合并后路线图（11 批次）
- P0 安全：CRED-HARDEN ✅ / AUTH-SESSION ✅ / BILLING-AI ✅ / BILLING-CHECK-FOLLOWUP ✅ / INFRA-GUARD ← fixing
- P0 前端：(5) FE-PERF-01 2d
- P1 质量：(6) **FE-QUALITY** 3.5d ← 合并 UX+A11y+DS-Critical
- P1 数据：(7) DATA-CONSISTENCY 1d / (8) INFRA-RESILIENCE 1.5d
- P2 细节：(9) **SEC-POLISH** 1.5d ← 合并 auth+SSRF+script / (10) INFRA-ARCHIVE 1d / (11) FE-DS-SHADCN 2d
- 候选：INFRA-GUARD-FOLLOWUP（Next.js 16 迁移 2-3d）
- 延后：PAY-DEFERRED 1-2d

## 合并决策（2026-04-18）
- BL-FE-QUALITY = UX-QUALITY + A11Y-I18N-DS（原 6+7 → 6）
- BL-SEC-POLISH = AUTH-HYGIENE + SSRF-INPUT + SCRIPT-HYGIENE（原 10+11+12 → 9）
- 节省：10 批 → 7 批；12.5d → 11.5d（-1d）

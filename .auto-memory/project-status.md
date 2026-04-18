---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-SEC-INFRA-GUARD：`fixing`**（Codex 首轮验收未通过，待 Generator 修复）
- Path A 进度 4/14.5，完成后进入 FE-PERF-01

## 本轮验收结论（2026-04-18）
- PASS：admin PATCH 白名单/baseUrl 防护、shell 注入负测、空白名单 key=401、balance 告警去重、build/tsc/vitest
- FAIL：
  1) F-IG-02 分布式锁单主不成立（双实例启动均成为 leader，后续都 lost leadership）
  2) F-IG-04 projectInfo:false 调 fork_public_template 返回 MCP `200 + isError`，非验收要求 403
  3) F-IG-06 仍有 1 high（next）
- 报告：`docs/test-reports/bl-sec-infra-guard-verifying-local-2026-04-18.md`

## 本批次产物（Generator 6 commits）
- 172ba68 / 23887ab / f9d345f / 4c4bd68 / 17f25e1 / de3e6f4
- 本地基线：`vitest 115/115`，`build` 通过，`tsc` 通过

## 生产状态
- HEAD `e45d469`（BILLING-CHECK-FOLLOWUP signoff 后）
- INFRA-GUARD 暂不部署，待 fixing/reverifying 通过

## Path A 执行路线图
- P0 安全：CRED-HARDEN ✅ / AUTH-SESSION ✅ / BILLING-AI ✅ / BILLING-CHECK-FOLLOWUP ✅ / INFRA-GUARD ← fixing
- 可能新增：INFRA-GUARD-FOLLOWUP（Next.js 16 迁移）
- P0 前端：FE-PERF-01

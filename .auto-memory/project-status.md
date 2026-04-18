---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-FE-PERF-01：`building`**（第二波 P0 前端首批，2d，7 features：6 generator + 1 codex）
- Path A 进度 5/11，第一波 P0 安全全部完成 🎉

## 上一批次（BL-SEC-INFRA-GUARD done）
- 9/9 PASS（reverifying），fix_rounds=1
- Signoff: `docs/test-reports/BL-SEC-INFRA-GUARD-signoff-2026-04-18.md`
- 产物：admin zod 白名单 + leader-lock.ts + shell spawn + MCP isError + balance 去重 + npm audit fix
- Framework 铁律 2.1 已采纳（协议返回形式断言标注协议层）

## 本批次目标
- 三大路由 First Load ≤ 180 kB（当前 281/271/227）
- i18n 每页 bundle ~107 kB → ~55 kB（仅当前语言）
- dashboard CLS 0.11 → ≤ 0.1
- Material Symbols preconnect 消除 FCP 阻塞
- / 路由改 RSC（利用 AUTH-SESSION 的 verifyJwt）
- console 补 loading.tsx Suspense 边界
- bundle-analyzer 接 CI

## 生产状态
- HEAD `a052779`（INFRA-GUARD signoff 后）
- 5 批 Path A 安全代码已部署验收完毕
- INFRA-GUARD 已具备部署条件

## Framework 铁律（2026-04-18 v0.7.2）
1. Planner 写 spec 涉及代码细节必须 Read 源码 + file:line 引用
2. Code Review 符号/类型/约束断言按线索，源码+生产数据双路核实
2.1. 协议返回形式断言必须标明协议层（HTTP / MCP / WebSocket）

## Path A 合并后路线图（11 批次）
- P0 安全：CRED-HARDEN ✅ / AUTH-SESSION ✅ / BILLING-AI ✅ / BILLING-CHECK-FOLLOWUP ✅ / INFRA-GUARD ✅
- P0 前端：FE-PERF-01 ← building
- P1 质量：FE-QUALITY 3.5d（合并 UX+A11y+DS）
- P1 数据：DATA-CONSISTENCY 1d / INFRA-RESILIENCE 1.5d
- P2 细节：SEC-POLISH 1.5d（合并 auth+SSRF+script）/ INFRA-ARCHIVE 1d / FE-DS-SHADCN 2d
- 延后候选：INFRA-GUARD-FOLLOWUP（Next.js 16 迁移 2-3d）
- 延后：PAY-DEFERRED 1-2d

## 已知 gap（非阻塞）
- 5 个图片模型 supportedSizes / get-balance.ts TS2353 / landing.html href="#" 占位 / CI secrets / jose Edge warning / Next.js 14.x 1 high（已 defer）

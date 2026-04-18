---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-FE-PERF-01：`verifying`**（Generator 6/6 done，等 Evaluator 跑 F-PF-07）
- Path A 进度 6/11

## 上一批次（BL-SEC-INFRA-GUARD done）
- 9/9 PASS（reverifying），fix_rounds=1
- Signoff: `docs/test-reports/BL-SEC-INFRA-GUARD-signoff-2026-04-18.md`

## 本批次交付（Generator）
- 三大路由 First Load：dashboard 281→169 / usage 272→159 / admin-usage 227→112 / root 87.8（全达标）
- Recharts 抽 `charts-section.tsx` + `charts-constants.ts`（常量独立文件是关键）
- intl-provider 动态 `import('@/messages/${locale}.json')`
- layout.tsx preconnect（fonts.googleapis + fonts.gstatic）
- / 路由改 RSC（cookies + verifyJwt + redirect）
- (console)/loading.tsx Skeleton
- @next/bundle-analyzer + poweredByHeader: false + images + analyze script
- 本地 checks：tsc pass / vitest 116/116 / build pass

## 生产状态
- HEAD `a052779`（INFRA-GUARD signoff 后）
- BL-FE-PERF-01 等 Codex 验收 + user push

## Framework 铁律（2026-04-18 v0.7.2）
1. Planner 写 spec 涉及代码细节必须 Read 源码 + file:line 引用
2. Code Review 符号/类型/约束断言按线索，源码+生产数据双路核实
2.1. 协议返回形式断言必须标明协议层（HTTP / MCP / WebSocket）

## Path A 合并后路线图（11 批次）
- P0 安全：CRED-HARDEN ✅ / AUTH-SESSION ✅ / BILLING-AI ✅ / BILLING-CHECK-FOLLOWUP ✅ / INFRA-GUARD ✅
- P0 前端：FE-PERF-01 ← verifying
- P1 质量：FE-QUALITY 3.5d（合并 UX+A11y+DS）
- P1 数据：DATA-CONSISTENCY 1d / INFRA-RESILIENCE 1.5d
- P2 细节：SEC-POLISH 1.5d / INFRA-ARCHIVE 1d / FE-DS-SHADCN 2d
- 延后候选：INFRA-GUARD-FOLLOWUP（Next.js 16 迁移 2-3d）
- 延后：PAY-DEFERRED 1-2d

## 已知 gap（非阻塞）
- 5 个图片模型 supportedSizes / get-balance.ts TS2353 / landing.html href="#" 占位 / CI secrets / jose Edge warning / Next.js 14.x 1 high（已 defer）

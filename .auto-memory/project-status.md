---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-SEC-BILLING-AI：`verifying`**（Generator 交付 3/4，等 Codex 跑 F-BA-04 并发压测 + 构建健全 + 生产数据预检）
- Path A 串行执行进度：3/14（CRED-HARDEN ✅ → AUTH-SESSION ✅ → BILLING-AI ← verifying）

## 本批次产物
- `prisma/migrations/20260418_deduct_balance_for_update/` FOR UPDATE 显式行锁，保 6 参签名
- `prisma/migrations/20260418_billing_check_constraints/` Transaction.amount 符号 + TemplateRating.score 范围 CHECK
- `src/lib/api/post-process.ts` chat + image 两路都用 prisma.$transaction 包裹 callLog+deduct
- `scripts/e2e-test.ts` step 24 — F-BA-02 并发 atomicity 回归
- 本地：tsc / build / vitest 96/96 全绿；psql 手工验 CHECK 约束以 23514 拒绝

## 生产状态
- HEAD 待本批次 commit push 后更新；生产部署版本 `59868a8`（RR2 fix round 2）
- 3 批安全代码尚未部署（CRED-HARDEN + AUTH-SESSION + BILLING-AI），本批含 2 个 migration
- 部署 AUTH-SESSION 后用户 cookie 失效需重新登录；部署 BILLING-AI 前先跑生产数据预检

## Path A 执行路线图（14 批次）
- P0 安全：CRED-HARDEN ✅ / AUTH-SESSION ✅ / BILLING-AI ← verifying / INFRA-GUARD
- P0 前端：FE-PERF-01
- P1 质量：FE-UX-QUALITY / FE-A11Y-I18N-DS
- P1 数据：DATA-CONSISTENCY / INFRA-RESILIENCE
- P2 细节：AUTH-HYGIENE / SSRF-INPUT / SCRIPT-HYGIENE / INFRA-ARCHIVE / FE-DS-SHADCN
- 延后：PAY-DEFERRED（支付接入前启动）

## 已知 gap（非阻塞）
- dev DB migrate drift on 20260410051446_add_user_suspend_delete + 20260417_template_test_runs（pre-existing，与本批次无关；生产用 migrate deploy 不受影响）
- 5 个图片模型 supportedSizes 规则不匹配
- `get-balance.ts(74)` tsc TS2353 batchId pre-existing
- `landing.html` 4 个 href="#" 占位
- CI 需在 GitHub Actions secrets 注入 ADMIN_TEST_PASSWORD / E2E_TEST_PASSWORD / ADMIN_SEED_PASSWORD
- jose × Edge Runtime CompressionStream warning（未复现运行时失败）

## Backlog（延后）
- BL-065 (被 PAY-DEFERRED 取代) / BL-104 (Settings 项目切换)

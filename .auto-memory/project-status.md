---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-SEC-BILLING-AI：`building`**（2d，P0-security 第 3 批，覆盖 CRIT-2 + CRIT-4 + H-16 + H-19）
- Path A 串行执行进度：3/14（CRED-HARDEN ✅ → AUTH-SESSION ✅ → BILLING-AI ← ...）

## 上一批次（BL-SEC-AUTH-SESSION done）
- 15 PASS / 0 FAIL + 1 项生产复验（Secure 标记本地 HTTP 不可测）
- Signoff: `docs/test-reports/BL-SEC-AUTH-SESSION-signoff-2026-04-18.md`
- 关键产物：session-cookie.ts + jwt.ts + middleware 真实验签 + console layout SSR 守卫

## 生产状态
- HEAD `1e9ae63`（含 CRED-HARDEN + AUTH-SESSION 代码），生产部署版本 `59868a8`（RR2 fix round 2）
- 2 批安全代码尚未部署（纯代码，无 migration；需手动 deploy）
- 部署 AUTH-SESSION 后现有用户 cookie 失效需重新登录（HttpOnly 新写入）
- 12 个公共营销模板上线，zhipu glm-4.7-flash 四向状态机闭环

## Path A 执行路线图（14 批次）
- P0 安全：CRED-HARDEN ✅ / AUTH-SESSION ✅ / BILLING-AI ← / INFRA-GUARD
- P0 前端：FE-PERF-01
- P1 质量：FE-UX-QUALITY / FE-A11Y-I18N-DS
- P1 数据：DATA-CONSISTENCY / INFRA-RESILIENCE
- P2 细节：AUTH-HYGIENE / SSRF-INPUT / SCRIPT-HYGIENE / INFRA-ARCHIVE / FE-DS-SHADCN
- 延后：PAY-DEFERRED（支付接入前启动）

## 已知 gap（非阻塞）
- 5 个图片模型 supportedSizes 规则不匹配
- `get-balance.ts(74)` tsc TS2353 batchId pre-existing
- `landing.html` 4 个 href="#" 占位
- CI 需在 GitHub Actions secrets 注入 ADMIN_TEST_PASSWORD / E2E_TEST_PASSWORD / ADMIN_SEED_PASSWORD
- jose × Edge Runtime CompressionStream warning（未复现运行时失败，生产发布后做定向 smoke）

## Backlog（延后）
- BL-065 (被 PAY-DEFERRED 取代) / BL-104 (Settings 项目切换)

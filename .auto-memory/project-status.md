---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-SEC-AUTH-SESSION：`verifying`**（P0-security 第 2 批，覆盖 CRIT-7 + H-8 + H-32）
- Generator 3/3 done（F-AS-01/02/03）→ 等 Codex F-AS-04 16 条验收
- Path A 串行执行：backlog.json 已列全 14 批次路线图（order 字段标顺序）

## 上一批次（BL-SEC-CRED-HARDEN done）
- 4/4 PASS，fix_rounds=0，Reviewer 2026-04-18 签收
- Signoff: `docs/test-reports/BL-SEC-CRED-HARDEN-signoff-2026-04-18.md`

## 生产状态
- HEAD `1a4f02e`（含 CRED-HARDEN 代码），生产部署版本 `59868a8`（RR2 fix round 2）
- CRED-HARDEN 尚未部署（纯代码变更，无 migration；需手动触发 deploy）
- 12 个公共营销模板上线，zhipu glm-4.7-flash 四向状态机闭环

## Path A 执行路线图（14 批次）
- P0 安全：CRED-HARDEN ✅ → AUTH-SESSION ← / BILLING-AI / INFRA-GUARD
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

## Backlog（延后）
- BL-065 (被 BL-SEC-PAY-DEFERRED 取代) / BL-104 (Settings 项目切换)

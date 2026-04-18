---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-SEC-BILLING-CHECK-FOLLOWUP：`verifying`**（Generator 1/2 交付，等 Codex F-BCF-02 生产部署 + 14 项验收）
- Path A 插队修正批次 3.5/14.5

## 本批次产物
- `prisma/migrations/20260418_billing_check_constraints_v2/` CHECK 规则修正（REFUND 从 <0 改为 >=0）
- `schema.prisma` Transaction.amount / TemplateRating.score 字段级 /// CHECK 注释指向 v2
- 本地 psql 验证：DEDUCTION+10 / REFUND-10 / score=0 / score=6 全 23514 拒绝；REFUND+10 通过
- tsc / build / vitest 96/96 全绿

## 上一批次（BL-SEC-BILLING-AI done 范围收敛）
- F-BA-01/02 签收 PASS，已部署生产 HEAD c8a7703
- F-BA-03 v1 migration 生产部署失败已 hotfix 删除，本批次 v2 接力

## 生产状态
- HEAD `c8a7703`（BILLING-AI F-BA-01/02 已生效）
- 7 行 REFUND amount>0 业务正确，不清理
- v1 在 `_prisma_migrations` 已 resolve --rolled-back（hotfix 时执行）
- 12 个公共营销模板上线，zhipu glm-4.7-flash 四向状态机闭环

## Path A 执行路线图（14+1 批次）
- P0 安全：CRED-HARDEN ✅ / AUTH-SESSION ✅ / BILLING-AI ✅(范围收敛) / BILLING-CHECK-FOLLOWUP ← verifying / INFRA-GUARD
- P0 前端：FE-PERF-01
- P1 质量：FE-UX-QUALITY / FE-A11Y-I18N-DS
- P1 数据：DATA-CONSISTENCY / INFRA-RESILIENCE
- P2 细节：AUTH-HYGIENE / SSRF-INPUT / SCRIPT-HYGIENE / INFRA-ARCHIVE / FE-DS-SHADCN
- 延后：PAY-DEFERRED

## Framework 提案
- 2 条待确认（Planner 核查铁律 + Code Review 断言交叉验证），本批次 done 时收尾确认

## 已知 gap（非阻塞）
- dev DB migrate drift（pre-existing，不影响生产 prisma migrate deploy）
- 5 个图片模型 supportedSizes / get-balance.ts TS2353 / landing.html href="#" 占位 / CI secrets 待注入 / jose Edge warning

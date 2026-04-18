---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-SEC-BILLING-CHECK-FOLLOWUP：`building`**（0.5d，Path A 插队修正批次 3.5/14.5）
- 由 BILLING-AI F-BA-03 生产部署失败触发：Code Review H-16 对 REFUND 符号断言错了，需重新提 CHECK migration

## 上一批次（BL-SEC-BILLING-AI done，范围收敛）
- F-BA-01/02 签收 PASS（5 项并发原子性 + 构建）
- F-BA-03 CHECK migration 部署失败已 hotfix 回滚（c8a7703），TC-BA-05/06 + TC-BA-11/12 deferred 到本批次
- 部署：F-BA-01/02 已上生产，F-BA-03 待本批次

## 本批次产物（规划）
- `prisma/migrations/20260418_billing_check_constraints_v2/` 修正 CHECK 规则
- 规则修正：DEDUCTION<0 / REFUND+RECHARGE+BONUS>=0 / ADJUSTMENT 任意
- `schema.prisma` 补 /// CHECK 文档注释
- 生产部署 + 正反 INSERT 验证 + AI 调用回归

## 生产状态
- HEAD `c8a7703`（BILLING-AI F-BA-01/02 已部署，F-BA-03 被 hotfix 删）
- 7 行 REFUND amount>0 业务正确（scripts/refund-zero-image-audit.ts:102），不清理
- 12 个公共营销模板上线，zhipu glm-4.7-flash 四向状态机闭环

## Path A 执行路线图（14+1 批次）
- P0 安全：CRED-HARDEN ✅ / AUTH-SESSION ✅ / BILLING-AI ✅(范围收敛) / BILLING-CHECK-FOLLOWUP ← / INFRA-GUARD
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

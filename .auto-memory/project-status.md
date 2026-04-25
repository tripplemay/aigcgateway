---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-IMAGE-PRICING-OR-P2：`verifying`**（3/3 generator 完成 → 等 Codex 12 项验收）
- 上一批次 BL-BILLING-AUDIT-EXT-P2：done @ 2026-04-25 12:15
- 上上一批次 BL-BILLING-AUDIT-EXT-P1：done @ 2026-04-25 01:35

## 本批次 OR-P2 已交付
- F-BIPOR-01: scripts/pricing/fix-or-image-channels-2026-04-25.ts 6 条 OR token 定价（dry-run/--apply/幂等，±1e-6 容差）
- F-BIPOR-02: migration 20260425_image_channel_pricing_trigger（PL/pgSQL trigger 仅校验 IMAGE modality，ERRCODE=check_violation，dev DB 已应用）
- F-BIPOR-03: or-token-pricing-reverse-calc.test.ts 10 单测 + verify-or-image-channels-2026-04-25.ts smoke

## 验证（本地）
- vitest 378 PASS（+25 OR-P2 新单测：4 trigger 集成 + 11 script + 10 反算）
- tsc / build 全过
- trigger 在 dev DB 集成验证：IMAGE+all-zero 拒，TEXT 同样改通过

## 生产 apply 步骤（用户/Codex）
1. GitHub Actions deploy（含 prisma migrate deploy）应用 trigger migration
2. ssh 跑 fix-or-image-channels-2026-04-25.ts dry-run → curl OR /api/v1/models 复核 → --apply
3. 幂等重跑 → 6 行 [no change]
4. BASE_URL=... API_KEY=... 跑 verify-or-image-channels-2026-04-25.ts smoke
5. SQL 反例：`UPDATE channels SET costPrice='{"unit":"call","perCall":0}' WHERE id=<IMAGE>` → check_violation

## 决策（继承 P1/P2）
- USD 口径 + sellPrice = costPrice × 1.2
- 数据源 OR /api/v1/models canonical
- 不修复 gpt-image-2 / -ca（保守填值沿用）
- 不回填历史 call_logs

## Framework v0.9.4 应用
- 铁律 1.2 ✓ acceptance 无运维依赖
- 铁律 1.3 ✓ 阈值 1.19-1.21 + ±1e-6 浮点容差
- 测试 mock 层级 ✓ F-BIPOR-03 在 calculateTokenCost 边界测公式

## 后续 backlog（按 order）
- BL-SEC-* (1-4): 安全加固（接支付前启动）
- BL-FE-PERF-01 (5) / BL-FE-QUALITY (6) / BL-DATA-CONSISTENCY (7) / BL-INFRA-RESILIENCE (8) / BL-SEC-POLISH (9) / BL-INFRA-ARCHIVE (10)

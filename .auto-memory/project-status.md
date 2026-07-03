---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-SYNC-ADAPTERTYPE-FALLBACK**（**fixing**，2026-07-03）— 修复后台新增 provider `guangtech` 模型同步 FAIL(`No sync adapter found`)。方案 B：新增通用 `openai-compat` 适配器 + `ADAPTERS[name] ?? ADAPTERS_BY_TYPE[adapterType]` 回退。
- F-GT-01 首轮验收 **FAIL**：派发回退已生效，生产 `guangtech` 已同步 OK（9 API models / 6 ACTIVE TEXT channels / 3 IMAGE skipped），但 DB `models.name` 仍是裸 `gpt-5.5`/`gpt-5.4` 等；`openaiCompatAdapter` 返回的 `guangtech/<id>` 被 `reconcile()` 的 `resolveCanonicalName(modelId)` 丢弃，不符合防撞命名验收。
- F-GT-02 测试资产已创建：`docs/test-cases/BL-SYNC-ADAPTERTYPE-FALLBACK-verifying-cases-2026-07-03.md`、`tests/unit/sync/openai-compat-adapter.test.ts`、`tests/unit/sync/model-sync-adapter-dispatch.test.ts`。报告：`docs/test-reports/BL-SYNC-ADAPTERTYPE-FALLBACK-verifying-2026-07-03.md`。
- 本地验证：新增单测 7 PASS；全量 vitest 81 files / 669 passed / 4 skipped PASS；`npx tsc --noEmit` PASS；`npm run build` PASS。`codex-setup` 3199 smoke 因 PostgreSQL/Docker daemon 不可用阻塞。

## Backlog（3 条，按优先级）
- **BL-SEC-PAY-DEFERRED**（critical-deferred）— 支付 webhook 验签 + 幂等 CAS
- **BL-SEC-INFRA-GUARD-FOLLOWUP**（high-deferred）— Next.js 16 跨大版本迁移
- **BL-FE-DS-SHADCN**（low-deferred）— shadcn 大批量采用率提升

## 参考
- 生产：`https://aigc.guangai.ai`；服务器 `/opt/aigc-gateway`；当前生产 HEAD `0cd5a3e`。
- KOLMatrix repo：`/mnt/c/Users/tripplezhou/projects/kolmatrix`
- harness-template 已同步到 v0.9.21；旧线 v0.9.6-v0.9.10 仅存 backup 分支，非紧急。
- 上一批次：BL-VISION-INPUT（done，2026-06-14），signoff `docs/test-reports/BL-VISION-INPUT-signoff-2026-06-14.md`。

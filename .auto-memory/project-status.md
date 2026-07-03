---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-SYNC-ADAPTERTYPE-FALLBACK**（**done**，2026-07-03，fix_rounds=1）— 后台新增 provider `guangtech` 模型同步 FAIL(`No sync adapter found`) 已修复。方案：通用 `openai-compat` 适配器 + `ADAPTERS[name] ?? ADAPTERS_BY_TYPE[adapterType]` 回退；fix-round-1 修复 fallback provider canonical 命名为 `${provider.name}/${modelId}`。
- Codex 复验 PASS：本地 targeted 单测 8 PASS、全量 vitest 81 files / 670 passed / 4 skipped PASS、`npx tsc --noEmit` PASS、`npm run build` PASS；`codex-setup` 3199 smoke 因本机 PostgreSQL/Docker daemon 不可用阻塞（环境非产品失败）。
- 生产核验：`guangtech` 6 个 ACTIVE TEXT channel 全部指向 `guangtech/gpt-5.x`，`realModelId` 保持裸 id，`bareLinkedCount=0`，alias links 保留；修复脚本 dry-run 待重命名 0。`LAST_SYNC_RESULT` 2026-07-03T09:44:44.995Z：guangtech success=true / apiModels=9 / modelCount=9 / newChannels=0 / skippedImage=3。
- signoff：`docs/test-reports/BL-SYNC-ADAPTERTYPE-FALLBACK-signoff-2026-07-03.md`；首轮失败报告：`docs/test-reports/BL-SYNC-ADAPTERTYPE-FALLBACK-verifying-2026-07-03.md`。

## Backlog（3 条，按优先级）
- **BL-SEC-PAY-DEFERRED**（critical-deferred）— 支付 webhook 验签 + 幂等 CAS
- **BL-SEC-INFRA-GUARD-FOLLOWUP**（high-deferred）— Next.js 16 跨大版本迁移
- **BL-FE-DS-SHADCN**（low-deferred）— shadcn 大批量采用率提升

## 参考
- 生产：`https://aigc.guangai.ai`；服务器 `/opt/aigc-gateway`。
- KOLMatrix repo：`/mnt/c/Users/tripplezhou/projects/kolmatrix`
- harness-template 已同步到 v0.9.21；旧线 v0.9.6-v0.9.10 仅存 backup 分支，非紧急。
- 上一批次：BL-VISION-INPUT（done，2026-06-14），signoff `docs/test-reports/BL-VISION-INPUT-signoff-2026-06-14.md`。

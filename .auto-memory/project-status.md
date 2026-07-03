---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-SYNC-ADAPTERTYPE-FALLBACK**（**reverifying**，2026-07-03，fix_rounds=1）— 修复后台新增 provider `guangtech` 模型同步 FAIL(`No sync adapter found`)。方案 B：通用 `openai-compat` 适配器 + `ADAPTERS[name] ?? ADAPTERS_BY_TYPE[adapterType]` 回退。
- 首轮 FAIL 真因=`reconcile` 的 `resolveCanonicalName(modelId)` 返回裸 modelId 丢弃前缀(M1a 后所有 provider 都存裸名)。**fix-round-1（commit a751d0a+431642a）**：`resolveCanonicalName(modelId,provider)` 对 fallback provider 加 `${provider.name}/` 前缀、named provider 零回归、realModelId 仍裸；导出 `providerUsesGenericFallbackAdapter`；新增 `scripts/fix-guangtech-canonical-naming.ts` 一次性重命名存量裸名(幂等/护栏删 orphan)。
- **生产已部署+已修复**：Deploy run 28652156819 success(prod@a751d0a)；脚本 `--apply` 重命名 6 个成功。核验：guangtech 6 channel 现全 `guangtech/gpt-5.x`(ACTIVE，realModelId 裸，alias_links 保留)，无残留裸名/orphan，脚本 dry-run 复跑 0 待改(幂等)。CI a751d0a 全绿(含 Codex 7 单测)。
- **待 Codex 复验 F-GT-02** → signoff。注：新模型 enabled=false(reconcile 默认)，上架/定价属 admin 独立流程非本 bug。
- 测试资产(Codex 首轮)：`tests/unit/sync/openai-compat-adapter.test.ts`、`tests/unit/sync/model-sync-adapter-dispatch.test.ts`；首轮报告 `docs/test-reports/BL-SYNC-ADAPTERTYPE-FALLBACK-verifying-2026-07-03.md`。

## Backlog（3 条，按优先级）
- **BL-SEC-PAY-DEFERRED**（critical-deferred）— 支付 webhook 验签 + 幂等 CAS
- **BL-SEC-INFRA-GUARD-FOLLOWUP**（high-deferred）— Next.js 16 跨大版本迁移
- **BL-FE-DS-SHADCN**（low-deferred）— shadcn 大批量采用率提升

## 参考
- 生产：`https://aigc.guangai.ai`；服务器 `/opt/aigc-gateway`；当前生产 HEAD `0cd5a3e`。
- KOLMatrix repo：`/mnt/c/Users/tripplezhou/projects/kolmatrix`
- harness-template 已同步到 v0.9.21；旧线 v0.9.6-v0.9.10 仅存 backup 分支，非紧急。
- 上一批次：BL-VISION-INPUT（done，2026-06-14），signoff `docs/test-reports/BL-VISION-INPUT-signoff-2026-06-14.md`。

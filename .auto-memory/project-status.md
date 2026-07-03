---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-SYNC-ADAPTERTYPE-FALLBACK**（**verifying**，2026-07-03）— 修复后台新增 provider `guangtech` 模型同步 FAIL(`No sync adapter found`)。根因：`model-sync.ts` 派发只按 `provider.name` 查硬编码 ADAPTERS，忽略 `adapterType`(死数据)，后台新增的任意 provider 都在查找适配器步直接失败。方案 B(用户裁决/通用修复)：新增 `src/lib/sync/adapters/openai-compat.ts` 通用适配器(动态前缀 `${provider.name}/${id}`)，派发 name 未命中按 `adapterType` 回退(`ADAPTERS[name] ?? ADAPTERS_BY_TYPE[adapterType]`)——以后 UI 新增的 openai-compat provider 免改代码可同步。F-GT-01 DONE(tsc/lint/build 绿，现有 12 named 适配器零回归)。已 curl 验证生产 guangtech `/v1/models` 返回 200 标准 OpenAI 格式(gpt-5.5 等)。**待推送+部署+Codex 验收(F-GT-02)**。spec：`docs/specs/BL-SYNC-ADAPTERTYPE-FALLBACK-spec.md`。
- **BL-VISION-INPUT**（done，2026-06-14）— 网关图片输入(vision/多模态)已上线生产。signoff：`docs/test-reports/BL-VISION-INPUT-signoff-2026-06-14.md`。

## harness-template 同步（2026-06-05 已解决）
- L1/L2 已同步到 harness-template **v0.9.21**（planner.md 铁律 8 + generator.md §9，commit f3cd49c 已推送）；proposed-learnings 已归档。
- reconcile：本地 stale clone（旧 v0.9.5 线）`reset --hard origin/main`(v0.9.20)，旧线存 `backup-local-v0.9.5-line-20260605` 分支。
- **遗留**（非紧急）：aigcgateway 旧线 v0.9.6–v0.9.10（铁律 1.1–1.8 等）未并入 canonical（两项目曾各推各线），仅存 backup 分支，待后续单独 reconcile。

## reference path
- KOLMatrix repo 实际路径：`/mnt/c/Users/tripplezhou/projects/kolmatrix`

## 上一批次
- BL-IMG-SEEDREAM45 @ 2026-06-05（done，fix_rounds=1）— Seedream 4.5 接入 + http 上游→GCS 真实 E2E。signoff：`docs/test-reports/BL-IMG-SEEDREAM45-signoff-2026-06-05.md`
- BL-IMG-PERSIST-GCS @ 2026-06-04（hotfix done，fix_rounds=2）— 图片生成转存 GCS（三形态归一 + 同源代理回源 GCS TTL90d）；已部署生产。signoff：`docs/test-reports/BL-IMG-PERSIST-GCS-signoff-2026-06-04.md`
- BL-FE-DS-SHADCN-MINI-A @ 2026-05-03（done）— 3 高频 admin 页 raw→shadcn 组件壳替换

## Backlog（3 条，按优先级）
- **BL-SEC-PAY-DEFERRED**（critical-deferred）— 支付 webhook 验签 + 幂等 CAS
- **BL-SEC-INFRA-GUARD-FOLLOWUP**（high-deferred）— Next.js 16 跨大版本迁移
- **BL-FE-DS-SHADCN**（low-deferred）— shadcn 大批量采用率提升（剩余 15+ 文件，2026-05-03 复核仍 defer：MINI-A + 渗透工程纪律双轨已消化高价值部分）

## proposed-learnings
- 最新同步 harness-template **v0.9.21**（2026-06-05：铁律 8 外部模型可用性 + Generator §9 standalone origin，来源 BL-IMG-PERSIST-GCS）
- 旧线 v0.9.6–v0.9.10（铁律 1.1–1.8 等）见上「遗留」：未并入 canonical，存 backup 分支

## 生产旁路修复
- 2026-04-30：alias claude-opus-4.7/claude-sonnet-4.6 model.enabled 改 true + 4 个 alias sellPrice 已补
- 2026-05-02：disable-orphan-zero-price-channels.ts 软停 263 个 disabled-alias-only channel（生产 SSH 跑），sync-status disabledAliasOnly 259→0 / unpricedActiveAliases 0（无 leak）/ 旧 zeroPriceActiveChannels 310→56（仅"无害零价"）

---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-IMG-SEEDREAM45**（**reverifying** fix_rounds=1，2026-06-04）— Seedream 4.5 生产接入 Codex 首轮已打通：`/v1/models` 含 `seedream-4-5`；真实 E2E `trc_p3fgsec90ehv49svi1mcyimr` 同源代理 URL `GET 200 image/jpeg`，`original_urls[0]` 为 GCS key（gsutil stat 确认）；日志可回看；计费 0.0274/0.03288（¥0.20/¥0.24×0.137）；脚本幂等。首轮卡两条**本地 L1**：tsc TS6053（.next/types 陈旧态）+ 本地 /v1/models 空。**查实两者均为测试环境/harness 既有特性非本批缺陷**（tsc：CI typecheck job 不 build 无 .next→恒 PASS；/v1/models 空：seed 建 0 模型）。**用户裁决=视为环境问题凭生产证据签收，不改 harness**。已放宽 features.json F-SD45-02 acceptance #2/#7 标注环境裁决。待 Codex 凭生产证据写 signoff PASS→done。报告：`docs/test-reports/BL-IMG-SEEDREAM45-verifying-2026-06-04.md`。

## ⚠️ harness-template 同步阻塞（2026-06-04）
- 本地 `~/project/harness-template` clone 严重 diverge：本地 v0.9.5（+v1.0 实验线），远端已 **v0.9.20**（apify-kol/kolmatrix 驱动）+ planner.md 已重构，50↔51 commits，pull 无法 ff。
- 本批 hotfix 沉淀 2 条经验（L1 外部模型可用性前置验证 / L2 Next standalone origin 推导）用户已确认，已 queue 到 `proposed-learnings.md` 待确认区，**待 clone reconcile（reset/re-clone 到 origin/main）后同步**。

## reference path
- KOLMatrix repo 实际路径：`/mnt/c/Users/tripplezhou/projects/kolmatrix`

## 上一批次
- BL-IMG-PERSIST-GCS @ 2026-06-04（hotfix done，fix_rounds=2）— 图片生成转存 GCS（三形态归一 + 同源代理回源 GCS TTL90d），修 MCP base64 死链 + b64_json 空数组 + 日志不可回看 + 1h/24h 过期；已部署生产。signoff：`docs/test-reports/BL-IMG-PERSIST-GCS-signoff-2026-06-04.md`
- BL-FE-DS-SHADCN-MINI-A @ 2026-05-03（done，fix_rounds=0）— 3 高频 admin 页 raw→shadcn 组件壳替换（recon/providers/model-aliases），signoff PASS
- BL-SYNC-INTEGRITY-PHASE2 @ 2026-05-02（done，fix_rounds=1）— 软停 259 disabled-alias-only channel + sync-status 度量重定义 + 抽 sql/alias-status.ts 共享谓词

## Backlog（3 条，按优先级）
- **BL-SEC-PAY-DEFERRED**（critical-deferred）— 支付 webhook 验签 + 幂等 CAS
- **BL-SEC-INFRA-GUARD-FOLLOWUP**（high-deferred）— Next.js 16 跨大版本迁移
- **BL-FE-DS-SHADCN**（low-deferred）— shadcn 大批量采用率提升（剩余 15+ 文件，2026-05-03 复核仍 defer：MINI-A + 渗透工程纪律双轨已消化高价值部分）

## proposed-learnings
- 已同步 harness-template v0.9.10（9 条累计：铁律 1 jsonb 三态 + 内部命名 grep + 1.5 + 1.5 范围细化 + 1.6 + 1.7 + 1.8 + 3 + Generator manual 归属）

## 生产旁路修复
- 2026-04-30：alias claude-opus-4.7/claude-sonnet-4.6 model.enabled 改 true + 4 个 alias sellPrice 已补
- 2026-05-02：disable-orphan-zero-price-channels.ts 软停 263 个 disabled-alias-only channel（生产 SSH 跑），sync-status disabledAliasOnly 259→0 / unpricedActiveAliases 0（无 leak）/ 旧 zeroPriceActiveChannels 310→56（仅"无害零价"）

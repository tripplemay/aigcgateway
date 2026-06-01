---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-IMG-PERSIST-GCS**（hotfix，**verifying**，2026-06-01）— Generator 完成 F-IGP-01~04（4/5），本地 commits 0c66d9b/4935243/59617e8/9f1765f（**未推送，待用户确认 push**）。图三形态（url-http/url-data:/b64_json）转存 GCS + 同源签名代理（回源读 GCS，TTL 90d）；修 MCP base64 死链 + b64_json 空数组 + 日志不可回看 + 1h/24h 过期。tsc/build/eslint PASS。**本批测试域归 Codex（F-IGP-05）**。Spec `docs/specs/BL-IMG-PERSIST-GCS-spec.md`；前置 ops（建桶+SA 授权+lifecycle+.env）见 `docs/specs/BL-IMG-PERSIST-GCS-ops.md`（gcloud 命令齐备，**用户须先执行 Codex 才能真实桶验收**）。

## reference path
- KOLMatrix repo 实际路径：`/mnt/c/Users/tripplezhou/projects/kolmatrix`

## 上一批次
- BL-FE-DS-SHADCN-MINI-A @ 2026-05-03（done，fix_rounds=0）— 3 高频 admin 页 raw→shadcn 组件壳替换（recon/providers/model-aliases），signoff PASS
- BL-SYNC-INTEGRITY-PHASE2 @ 2026-05-02（done，fix_rounds=1）— 软停 259 disabled-alias-only channel + sync-status 度量重定义（alias 层 + JSON 三态判定）+ admin chip + scan 三维扩展；抽 sql/alias-status.ts 共享谓词
- BL-SYNC-INTEGRITY-PHASE1 @ 2026-05-02（done，fix_rounds=0）— siliconflow IMAGE skip + xiaomi-mimo adapter + 311 zero-price 扫描脚本

## Backlog（3 条，按优先级）
- **BL-SEC-PAY-DEFERRED**（critical-deferred）— 支付 webhook 验签 + 幂等 CAS
- **BL-SEC-INFRA-GUARD-FOLLOWUP**（high-deferred）— Next.js 16 跨大版本迁移
- **BL-FE-DS-SHADCN**（low-deferred）— shadcn 大批量采用率提升（剩余 15+ 文件，2026-05-03 复核仍 defer：MINI-A + 渗透工程纪律双轨已消化高价值部分）

## proposed-learnings
- 已同步 harness-template v0.9.10（9 条累计：铁律 1 jsonb 三态 + 内部命名 grep + 1.5 + 1.5 范围细化 + 1.6 + 1.7 + 1.8 + 3 + Generator manual 归属）

## 生产旁路修复
- 2026-04-30：alias claude-opus-4.7/claude-sonnet-4.6 model.enabled 改 true + 4 个 alias sellPrice 已补
- 2026-05-02：disable-orphan-zero-price-channels.ts 软停 263 个 disabled-alias-only channel（生产 SSH 跑），sync-status disabledAliasOnly 259→0 / unpricedActiveAliases 0（无 leak）/ 旧 zeroPriceActiveChannels 310→56（仅"无害零价"）

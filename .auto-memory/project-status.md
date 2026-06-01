---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-IMG-PERSIST-GCS**（hotfix，**reverifying** fix_rounds=1，2026-06-01）— Generator 完成 F-IGP-01~04 + fix_round1。Codex 首轮 FAIL 根因：API/日志路由用 `new URL(request.url).origin`，Next standalone 下解析成内部绑定 `0.0.0.0:3000`（GCS 持久化/代理读回本身 OK）。fix_round1（commit 400f2af/501147e）新增 `image-proxy.ts resolveRequestOrigin()`——从 `Host`+`X-Forwarded-Proto` 头推导（nginx 已核转发），兜底 env/request.url；`generations` 与 `logs/[traceId]` 路由改用之。已推送+部署（Deploy run 26733023342 success，线上 commit 501147e，pm2 online）。**待 Codex 复验**：gpt-image-mini 的 `data[0].url`/日志 `images[0]` 应直接为 `https://aigc.guangai.ai/...` 且 GET 200。`seedream-3 404` 为本批外模型可用性问题（即将下线），http 上游对照可换在售模型。报告 `docs/test-reports/BL-IMG-PERSIST-GCS-verifying-2026-06-01.md`；ops+部署见 `docs/specs/BL-IMG-PERSIST-GCS-ops.md`。

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

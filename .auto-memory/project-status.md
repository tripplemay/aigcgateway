---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-IMG-PERSIST-GCS**（hotfix，**fixing** fix_rounds=1，2026-06-01）— Generator 完成 F-IGP-01~04 + fix_round1。Codex `reverifying` 结果：**origin 签发缺陷已修复**。生产 `gpt-image-mini` trace `trc_ebyvtle8lqi30w1pt2aec6ix` 现在直接返回 `https://aigc.guangai.ai/v1/images/proxy/...`，且无需手工改 host 就可 `GET 200 image/png`；日志详情 API `/api/projects/:id/logs/:traceId` 的 `images[0]` 也已改为同域名。L1 本地 `tsc` / targeted vitest / 全量 `npm test` 均 PASS。**但** 按当前 spec 仍未 signoff：`seedream-3` 继续出现在 `GET /v1/models` 的 image 列表中，真实调用依旧 `404 model_not_found`（trace `trc_j4nq6rierghkcsrp1ndwmh5o`），因此 `seedream-3 同样 200` acceptance 未满足，`progress.json.status` 已退回 `fixing`，`docs.signoff=null`。复验报告：`docs/test-reports/BL-IMG-PERSIST-GCS-reverifying-2026-06-01-round1.md`；首轮报告：`docs/test-reports/BL-IMG-PERSIST-GCS-verifying-2026-06-01.md`；ops+部署见 `docs/specs/BL-IMG-PERSIST-GCS-ops.md`。

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

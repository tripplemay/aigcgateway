---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-IMG-PERSIST-GCS**（hotfix，**fixing**，2026-06-01）— Generator 完成 F-IGP-01~04（4/5），Codex 首轮 verifying 已完成并判 **FAIL**：本地 `codex-setup`/build/tsc/vitest 通过，新增 `src/lib/api/__tests__/persist-image.test.ts` 覆盖 b64_json-only + D6；生产 `gpt-image-mini` trace `trc_k9antbsfryyy9o6ds4jq07n7` 已成功转存到 GCS，手工把 host 改成 `https://aigc.guangai.ai/...` 后代理 `GET 200 image/png`，但 API `/v1/images/generations` 与日志详情 API `/api/projects/:id/logs/:traceId` 实际签出的图片 URL 都错误指向 `https://0.0.0.0:3000/...`，导致客户端下载/回看仍失败；`seedream-3` 生产仍 `404 model_not_found`。验收报告：`docs/test-reports/BL-IMG-PERSIST-GCS-verifying-2026-06-01.md`。`progress.json.status` 已转 `fixing`，`docs.signoff` 仍为 `null`。前置 ops 与部署均已完成，详见 `docs/specs/BL-IMG-PERSIST-GCS-ops.md`。

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

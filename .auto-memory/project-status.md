---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-IMG-PERSIST-GCS**（hotfix，**reverifying** fix_rounds=2，→2026-06-04）— 核心修复（GCS 持久化+同源代理+origin）Codex round1 已确认 PASS（gpt-image-mini 直接 200、日志回看正常）。唯一卡点 seedream-3「列在 /v1/models 却 404」：**用户裁决下线**。fix_round2（生产数据变更，无代码）：psql 禁用 seedream-3 alias（enabled=false,deprecated=true，可 revert）+ 清 Redis models:list* 缓存；验证生产 /v1/models image=[gemini-3-pro-image,gpt-image,gpt-image-mini]，已移除。验收契约（features.json F-IGP-03#6 + spec）同步放宽：seedream-3 退出验收，http 上游→GCS 路径由 persist-image.test.ts 覆盖。待 Codex round2 复验（确认列表无 seedream-3 + 既有 PASS 不回归→signoff）。报告：`docs/test-reports/BL-IMG-PERSIST-GCS-reverifying-2026-06-01-round1.md`；ops+部署：`docs/specs/BL-IMG-PERSIST-GCS-ops.md`。

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

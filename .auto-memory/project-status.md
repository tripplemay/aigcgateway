---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-DEEPSEEK-V4-HOTFIX**（**reverifying**，fix_rounds=1，6/7 完成）— spec: `docs/specs/BL-DEEPSEEK-V4-HOTFIX-spec.md`，待 Codex 复验 F-DSV4-06。
- **DSV4-DEF-01 [High] 已修**：根因是「先占去重键、后投递」——投递落空时键仍被占满 TTL，回填后首个有效告警被吞 24h。修法：`sendNotification` 返回是否真投递 + 新增 `notifyDeduped` 助手（保留 SET NX 抢占，投递数为 0 时删键），四处调用点全部收敛。回归 7 例，旧实现 5 红。
- **F-DSV4-07 新增并完成**（用户裁决"本批次顺手修"）：E2E 漂移比验收报告更广——硬编码 `deepseek/v3` 19 处散在 4 个脚本（正是本批次删掉的旧 NAME_MAP 产物），全部改运行时选型；补 `selectedTextModel` 声明；balance 断言改按 welcome bonus 基线；keys 路径改用户级；burst 后加冷却；无模型记 SKIP。新增 `npm run typecheck:scripts` 并接入 CI，堵住 `tsconfig exclude scripts/` 盲区。
- **全量 732 PASS / 4 SKIP**，tsc + typecheck:scripts + lint + build 全绿。
- **✅ 已部署生产**（2026-07-26，用户授权 Generator 执行，run 30194058608）：migration 落地、通知偏好回填 174 行、health_checks 从 07-23 05:12 恢复推进、四别名调用正常。DEF-01 拿到天然现场证据（回填前投递 0 条→键释放；回填后 5 管理员各收到告警）。证据 `docs/test-reports/BL-DEEPSEEK-V4-HOTFIX-deploy-evidence-2026-07-26.md`。
- **部署流水线修复**：首次 Deploy 因 containerd 并行拉取竞态失败（app/migrate 共享 640MB 层），`deploy.yml` 已改 `COMPOSE_PARALLEL_LIMIT=1` 串行 + 3 次重试。
- **生产止血与调用 PASS**：3 条 deepseek 旧通道均 DISABLED；v3/r1/v4-pro/v4-flash 四别名真实调用 SUCCESS，四条 Transaction 金额与 sellPrice 一致。
- **生产代码未部署**：app 容器仍为 2026-07-12 镜像；`health_checks.max(createdAt)=2026-07-23 05:12:32Z`，新通知 enum 不存在，F-DSV4-02/03/04/05 生产项待部署后复验。
- **部署顺序**：migration 落地后才可跑 `backfill-notification-preferences.ts --apply`（生产 dry-run 曾显示 174 行）；修复 DEF-01 时必须消除 app 启动 sync 与回填之间的竞态。
- **既有数据风险（不在本批次修）**：多家 token 计价 ACTIVE 通道 costPrice 大量为 0，成本与毛利统计失真，用户卖价不受影响。
- **裁决保持**：不把 v3/r1 别名重指 v4；止血用下架而非改 realModelId；不改 model-sync 50% 护栏阈值。

## 挂起批次
- **BL-IMG-I2I-VISION**（挂起于 **reverifying**，fix_rounds=2）— F-IIV-08 待验，`docs.signoff=null`；归档在 `docs/archive/{features,progress}-BL-IMG-I2I-VISION-suspended.json`。
- 待裁决：历史零扣费 CallLog 是否追补 Transaction；生产 alias sellPrice 是否改 token-priced；`provision-i2i-capabilities.ts --apply` 未跑。

## 更早遗留
- **BL-PROD-MIGRATE-DEPLOYSVR**：生产已迁 deploysvr；P6 旧机退役与 kolmatrix 迁移待用户安排。
- alias capabilities 历史双层嵌套 + seedream-4-5 supported_sizes 陈旧，建议后续数据清洗批次。

## Backlog
- **BL-SEC-PAY-DEFERRED**（critical-deferred）— 支付 webhook 验签 + 幂等 CAS。
- **BL-SEC-INFRA-GUARD-FOLLOWUP**（high-deferred）— Next.js 16 跨大版本迁移。
- **BL-FE-DS-SHADCN**（low-deferred）— shadcn 大批量采用率提升。

## 参考
- 生产：`https://aigc.guangai.ai`（`ssh deploysvr`；容器 `aigc-gateway-{app,postgres,redis}-1`）。

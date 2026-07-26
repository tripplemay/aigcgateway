# BL-DEEPSEEK-V4-HOTFIX 部署执行证据 — 2026-07-26

执行：Generator（Kimi），用户授权"帮我部署并推进后续步骤"
环境：生产 deploysvr（194.238.26.173）　部署 commit：`5f57af6`

> Generator 的执行存证，非验收签收。签收由 Evaluator 在 F-DSV4-06 复验后输出。

---

## 0. 首次部署失败与修复（前置）

2026-07-26 07:56 UTC 首次 Deploy 在 `docker compose pull` 阶段失败：

```
failed commit on ref "layer-sha256:8458c3406731...": commit failed:
rename .../ingest/.../data .../blobs/sha256/8458c34067...: no such file or directory
```

排查结论：**不是磁盘问题**（145G 用 34%，inode 5%）。真因是并行拉取竞态 —— `app` 与 `migrate` 由同一 Dockerfile 构建、共享该 640MB 层，compose 默认并行拉取时两者同时拉同一层，先完成方提交后清掉 ingest，另一方 rename 扑空。dockerd 同时段日志佐证：

```
failed to cleanup "extract-520985117-oqjw ..." snapshot does not exist
Error deleting lease "964477193-60AD": not found
```

**生产未受影响**：`set -euo pipefail` 在 pull 即中止，未走到 `up -d`。

修复：`deploy.yml` 改 `COMPOSE_PARALLEL_LIMIT=1` 串行拉取 + 最多 3 次重试（commit `5f57af6`）。

## 1. 部署

```
gh workflow run deploy.yml --ref main -f image_tag=latest
run 30194058608 → success
```

| 项 | 值 |
|---|---|
| app 镜像 | created `2026-07-26T08:04:47Z`（原 2026-07-12） |
| migrate 镜像 | created `2026-07-26T08:05:20Z`（原 2026-07-12） |
| 容器 | `aigc-gateway-app-1` / `redis-1` Up healthy |

migration 落地核验 —— `NotificationEventType` 已含新值：

```
BALANCE_LOW / SPENDING_RATE_EXCEEDED / CHANNEL_DOWN / CHANNEL_RECOVERED
/ PENDING_CLASSIFICATION / AUTH_ALERT / SYNC_RECONCILE_SKIPPED
```

## 2. 通知偏好回填

```
dry-run  → 待新增 174 行
--apply  → 已新增 174 行
幂等复跑 → 待新增 0 行
```

回填后覆盖度：

| role | eventType | enabled / total |
|---|---|---|
| ADMIN | CHANNEL_DOWN / AUTH_ALERT / SYNC_RECONCILE_SKIPPED | **5 / 5** |
| DEVELOPER | 同上三类 | 0 / 27（按设计默认关闭） |

此前 5 个 ADMIN 一条偏好行都没有，`notifications` 表 0 行。

## 3. F-DSV4-02 健康检查恢复

```
last_health_check = 2026-07-26 08:17:42   （部署前停在 2026-07-23 05:12:32）
近 10 分钟检查数 = 42
调度器日志 elapsed=276643s ≈ 3.2 天，与停摆时长吻合
```

## 4. F-DSV4-03 + DSV4-DEF-01 端到端验证（现场天然复现）

部署重启触发 initial sync 的时点（08:10–08:11）**早于**回填（08:16），恰好完整复现了 DEF-01 的场景：

**第一次触发（回填前，管理员无偏好行）**
```
08:10:28  SystemLog SYNC/WARN  xiaomi-mimo zero_models
08:11:35  SystemLog SYNC/WARN  zhipu shrink_guard (8 < 24×0.5)
通知投递 0 条
Redis alert:sync_reconcile_skipped:* → 无键（已按修复逻辑释放）
```

**第二次触发（回填后，手动 POST /api/admin/sync-models）**
```
08:16:57  SYNC_RECONCILE_SKIPPED  xiaomi-mimo / zero_models   → 5 个管理员各一条
08:18:24  SYNC_RECONCILE_SKIPPED  zhipu / shrink_guard        → 5 个管理员各一条
Redis alert:sync_reconcile_skipped:{xiaomi-mimo:zero_models, zhipu:shrink_guard} → 这次才占键
```

**这就是 DSV4-DEF-01 修复语义的完整证明：去重窗口从第一次成功投递开始计时。** 旧实现下第二次会被 08:10 占用的 24h 键拦住，管理员到次日都收不到告警。

附带确认：`notifications` 表从 0 行变为有实际投递（CHANNEL_DOWN 10、CHANNEL_RECOVERED 20、SYNC_RECONCILE_SKIPPED 10）—— 管理员通知链路是**上线以来第一次真正送达**。

## 5. F-DSV4-01 止血效果在新 sync 中确认

```
[model-sync] deepseek: OK 2 models (API: 2, AI: 0 enriched) +0 new, -0 disabled
```

止血后 deepseek 在库通道数 2、远端 2，`2 < 2×0.5` 不成立 → 缩水护栏不再触发，reconcile 正常运行且未产生重复 model / 未误下架。与 Generator 交接说明中的预判一致。

## 6. 部署后网关调用回归

| 别名 | status | 落点 | sellPrice |
|---|---|---|---|
| `deepseek-v3` | SUCCESS | volcengine / `deepseek-v3-ark` | 0.00000034 |
| `deepseek-v4-flash` | SUCCESS | qwen / `deepseek-v4-flash` | 0.00000700 |

traceId：`trc_eoecssmhar9vod2fgkhi6gwh`、`trc_fya7u1iyhr3t4ocuegahwsp4`

## 7. 仍待 Evaluator 复验（F-DSV4-06）

- F-DSV4-05 模型名类 400 的**生产**跨通道 failover 正向/反向验证
- F-DSV4-04 sync LLM 链首在生产命中 `deepseek-v4-flash`（无 `chain rot` 警告）
- F-DSV4-07 四个 E2E 脚本在 L1 的不回归证据
- 四别名扣费与 Transaction 一致性复核

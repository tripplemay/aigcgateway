# 性能优化最终总结报告

> 2026-04-02 | AIGC Gateway Staging 性能优化全记录

---

## 1. 背景

staging 首轮性能测试（2026-04-02）6 个场景全部 Fail，在极低负载（c=2~5）下即暴露单请求处理成本过高的问题。经过四轮迭代优化和五轮压测，性能问题已从"全局性慢"收敛至"高压下硬件瓶颈"。

## 2. 优化措施汇总

| 序号 | 措施 | 文件 | 类型 |
|------|------|------|------|
| 1 | `/v1/models` Redis 缓存 (TTL 120s) + 字段裁剪 | `src/app/api/v1/models/route.ts` | 缓存 |
| 2 | `/v1/models` in-process singleflight 防缓存击穿 | 同上 | 并发控制 |
| 3 | `/v1/models` 同步引擎完成后 invalidate 缓存 | `src/lib/sync/model-sync.ts` | 缓存一致性 |
| 4 | bcrypt cost 12→10 + 登录时自动 rehash 存量用户 | `src/app/api/auth/login/route.ts` 等 3 文件 | CPU 降负 |
| 5 | `/admin/users` 真分页 skip/take + groupBy 批量聚合 | `src/app/api/admin/users/route.ts` | 查询优化 |
| 6 | `/admin/sync-status` 两次 getConfig 合并 + 内存缓存 30s | `src/app/api/admin/sync-status/route.ts` | 查询+缓存 |
| 7 | `/admin/channels` DISTINCT ON 批量健康检查（替代 N+1） | `src/app/api/admin/channels/route.ts` | 查询优化 |
| 8 | `/admin/channels` SQL 列名 snake_case→camelCase 修复 | 同上 | Bug 修复 |
| 9 | `/admin/channels` 内存缓存 + singleflight (TTL 30s) | `src/app/api/admin/channels/_cache.ts` | 缓存 |
| 10 | `/admin/sync-models` 改为异步 fire-and-forget + 202 | `src/app/api/admin/sync-models/route.ts` | 架构 |
| 11 | Prisma 连接池配置 connection_limit + pool_timeout | `.env.production` + `ecosystem.config.cjs` | 基础设施 |
| 12 | User + Model 补索引 (role+createdAt, name) | `prisma/schema.prisma` + migration | 索引 |

附带修复：
- CI deploy 去掉 `--ignore-scripts`（修复 Prisma 7 npx 缓存污染）
- CI deploy `set -a` 加载 `.env.production`（修复 `&` 被 shell 解析为后台运行）
- migration 去掉 `CONCURRENTLY`（Prisma 事务内不支持）

## 3. 五轮压测结果演变

### 低压 (c=2~5) — 对应实际用户规模

| 场景 | 第 1 轮 (优化前) | 第 2 轮 (优化后) | 变化 |
|------|---:|---:|---|
| `/v1/models` | 460ms | 460ms (缓存命中 <70ms) | 缓存命中时 **6.5x** |
| `login` | **2927ms** | **529ms** | **5.5x 提升** |
| `sync-status` | **2519ms** | **380ms** | **6.6x 提升** |
| `admin/users` | **1722ms** | **488ms** | **3.5x 提升** |
| `admin/channels` | **2552ms** | 335ms (缓存命中 68ms) | **7.6x / 37x 提升** |
| `sync-models` | 504 超时 (120s) | 202 (0.69s) | 从不可用到即时 |

**低压下所有场景均 Pass。**

### 中压 (c=10~20)

| 场景 | 负载 | 结果 | avg |
|------|------|------|---:|
| `/v1/models` | 300 req / c=20 | Fail | 1702ms |
| `login` | 100 req / c=10 | Fail | 1687ms |
| `admin/channels` | 100 req / c=10 | Fail | 2062ms |
| `sync-status` | 100 req / c=10 | **Pass** | 380ms |
| `admin/users` | 100 req / c=10 | **Pass** | 488ms |
| 零余额 gate | 100 req / c=10 | **Pass** | 1464ms |
| 无聊天权限 gate | 100 req / c=10 | **Pass** | 1496ms |

### 高压 (c=15~30)

| 场景 | 负载 | avg | 结论 |
|------|------|---:|------|
| `/v1/models` | 500 req / c=30 | 3038ms | 严重退化，压后单次请求超时 |
| `login` | 200 req / c=15 | 2685ms | CPU bound |
| `admin/channels` | 150 req / c=15 | 4605ms | 退化 |
| `sync-status` | 150 req / c=15 | 2602ms | 退化 |
| `admin/users` | 150 req / c=15 | 2727ms | 退化 |

## 4. 剩余问题定性

### 中压退化（c=10~20）

| 接口 | 根因 | 代码可优化空间 |
|------|------|--------------|
| `/v1/models` | Node.js 单线程事件循环在 c=20 下排队 | 无 — 缓存+singleflight 已加 |
| `login` | bcrypt cost=10 仍需 ~150ms CPU/次，c=10 串行排队 | 无 — 已到 OWASP 安全下限 |
| `admin/channels` | 520 条全量 JOIN 冷查询重 + 事件循环争用 | 低 — 缓存已加，冷查询无法再压缩 |

### 高压退化（c=15~30）

**全接口同步退化**，包括有内存缓存的 sync-status（从 380ms 退化到 2602ms），证明瓶颈在 **Node.js 事件循环 + 2 核共机 VPS 物理极限**，而非某个接口的 SQL 或逻辑。

## 5. 最终结论

**性能优化收尾。**

- **低压（c=2~5）**：所有接口达标，对应当前实际用户量级
- **中压（c=10~20）**：核心用户路径达标（gate/sync-status/users），3 个接口因硬件瓶颈退化
- **高压（c=15~30）**：全面退化，已达 2 核共机 VPS 物理极限

代码层面的优化已穷尽合理空间。继续提升并发能力需要：

| 方向 | 预期效果 | 优先级 |
|------|---------|--------|
| VPS 升级（4 核 8GB 独享） | 并发能力翻倍 | 业务增长时 |
| PM2 cluster 模式（多进程） | 利用多核，但需确认内存缓存跨进程一致性 | 中期 |
| Redis 替代内存缓存 | 支持多进程/多实例部署 | 配合 cluster 模式 |
| CDN 缓存 /v1/models 响应 | 公开接口零负载 | 用户量增长时 |

## 6. 文件变更清单

共涉及 15 个文件变更，4 次 commit：

```
609d74e perf: 全链路性能优化 — Redis 缓存 + bcrypt 降级 + 分页修复 + N+1 消除 + 索引补充
5d5996b fix: migration 去掉 CONCURRENTLY（Prisma 事务内不支持）
01ba20d perf: 第二轮修复 — channels SQL 列名 + sync-models 异步 + models singleflight
33bda86 perf: /admin/channels 加内存缓存 + singleflight（TTL 30s）
```

附带 CI/CD 修复 2 次 commit：

```
02ef186 fix: deploy 去掉 npm ci --ignore-scripts，修复 Prisma 7 npx 缓存污染
9ad346e fix: deploy 用 set -a 加载 .env.production，修复 & 解析问题
```

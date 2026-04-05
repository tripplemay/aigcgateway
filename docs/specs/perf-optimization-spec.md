# 性能优化批次规格

**批次：** 性能优化批次（冷启动 + 模型页缓存 + 用量页查询）
**日期：** 2026-04-04
**优先级：** High

---

## 背景与目标

用户反馈两类性能问题：

1. **冷启动慢**：浏览器长时间无操作后首次点击需等待很久，之后以静态内容为主的页面速度可接受。根因：Prisma 连接池空闲超时后连接被释放，下次请求重建连接耗时 1–3 秒。
2. **持续慢页面**：模型页、用量页即使在连续操作状态下也明显慢。根因：模型页无 Redis 缓存（invalidation 逻辑已存在但从未写入）；用量页 by-model / by-provider 无时间过滤全表扫描，且缺少复合索引。

---

## F-PERF-01 — Prisma 连接池保活

### 问题
`src/lib/prisma.ts` 在生产环境（`NODE_ENV !== "development"`）不将实例挂到 `globalThis`，且无连接池参数配置，连接池空闲超时后被释放，首次请求重建连接导致卡顿。

### 修复
**文件：** `src/lib/prisma.ts`

1. 去掉 `NODE_ENV !== "production"` 条件，**生产和开发都挂 globalThis**（防止 Next.js HMR 和 PM2 多进程重复创建实例）
2. 创建 `PrismaClient` 时传入连接池配置：
   ```typescript
   new PrismaClient({
     datasources: {
       db: {
         url: process.env.DATABASE_URL,
       },
     },
   })
   ```
   并在 `DATABASE_URL` 末尾追加（或在代码里用 `log` + `engineType`）：
   - `connection_limit=5`（1GB VPS，不宜过大）
   - `pool_timeout=2`（等待可用连接超时 2 秒，快速失败）

   **推荐方式**：直接在 `DATABASE_URL` env 里追加参数（部署侧控制），代码只负责 singleton 逻辑。在 `prisma.ts` 中加注释说明预期的 URL 参数格式。

3. 可选：调用 `prisma.$connect()` 做提前预热（instrumentation.ts 启动时）。

### 验收
- 连续两次冷启动（停止服务 15 分钟后），首次请求响应时间 < 3 秒
- 生产环境不出现 `PrismaClientInitializationError: Can't reach database server`

---

## F-PERF-02 — 模型页 Redis 缓存

### 问题
`/api/admin/models-channels/route.ts` 完全没有缓存逻辑。该接口每次请求均执行：
- `prisma.model.findMany({ include: { channels: { include: { provider, healthChecks } } } })` — 250+ 模型多层 JOIN
- 两次 `callLog.groupBy()` — 按 channelId 统计过去 7 天调用

`model-sync.ts` 里已经有 `redis.del("cache:admin:channels")` 的 invalidation，但从未有代码向这个 key 写入，失效逻辑是空转的。

### 修复
**文件：** `src/app/api/admin/models-channels/route.ts`

缓存策略：**先读 Redis，命中直接返回；未命中走 DB，结果写入 Redis**。

```
cache key:   "cache:admin:channels"（无 modality/search 过滤时）
             "cache:admin:channels:{modality}:{search}" （有过滤参数时）
TTL:         300 秒（5 分钟）
invalidation: 已由 model-sync.ts 负责（同步完成后 del）
```

注意事项：
- 有 `modality` 或 `search` 参数时，缓存 key 需包含参数，避免跨参数污染
- 无参数时走 `cache:admin:channels`（与 model-sync invalidation key 一致）
- Redis 不可用时降级走 DB，不报错

### 验收
- 首次加载模型页后，第二次加载响应时间 < 200ms（缓存命中）
- 触发模型同步后，缓存自动失效，下次加载走 DB（可通过 Redis CLI 验证 key 已 del）

---

## F-PERF-03 — 用量页查询优化

### 问题

**问题一：by-model / by-provider raw SQL 无时间过滤**

`/api/admin/usage/by-model/route.ts` 和 `/api/admin/usage/by-provider/route.ts` 的 SQL 对全表做 GROUP BY，随 `call_logs` 数据增长持续变慢：

```sql
-- by-model（当前）：无 WHERE，全表扫描
SELECT "modelName", COUNT(*), SUM(...) FROM call_logs GROUP BY "modelName"

-- by-provider（当前）：无 WHERE，全表扫描 + JOIN
SELECT ... FROM call_logs cl JOIN channels ch ... GROUP BY p.name
```

**问题二：缺少 `(status, createdAt)` 复合索引**

`/api/admin/usage/route.ts` 的 `count({ where: { status: "SUCCESS", createdAt: { gte } } })` 查询只能用 `(createdAt)` 单索引，需要再过滤 status，效率低。

### 修复

**1. by-model / by-provider 加时间过滤**

两个 route 增加 `period` 参数（与 `usage/route.ts` 保持一致，默认 `7d`），SQL 加 `WHERE "createdAt" >= $1`：

```sql
-- by-model（修复后）
SELECT "modelName", COUNT(*), ...
FROM call_logs
WHERE "createdAt" >= $1
GROUP BY "modelName"
ORDER BY revenue DESC

-- by-provider（修复后）
SELECT ... FROM call_logs cl
JOIN channels ch ON cl."channelId" = ch.id
JOIN providers p ON ch."providerId" = p.id
WHERE cl."createdAt" >= $1
GROUP BY p.name
```

**2. 补 `(status, createdAt)` 复合索引**

**文件：** `prisma/schema.prisma`，在 `CallLog` model 的 `@@index` 块追加：
```prisma
@@index([status, createdAt(sort: Desc)])
```

需要创建对应 migration。

**3. 用量聚合缓存（可选，建议加）**

`usage/route.ts`、`by-model/route.ts`、`by-provider/route.ts` 加 Redis 缓存：
```
key:   "cache:admin:usage:{period}"
       "cache:admin:usage:by-model:{period}"
       "cache:admin:usage:by-provider:{period}"
TTL:   600 秒（10 分钟，用量数据允许轻微延迟）
```

### 验收
- 模型用量页（by-model / by-provider）响应时间 < 1 秒（本地环境，call_logs 有数据）
- `EXPLAIN ANALYZE` 验证 by-model / by-provider 查询使用了时间索引
- `(status, createdAt)` 索引已在数据库中生效（`\d call_logs` 可见）
- 缓存命中后 by-model 响应时间 < 100ms

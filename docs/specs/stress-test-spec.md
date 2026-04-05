# 新服务器压力测试规格

**批次：** 压力测试批次
**日期：** 2026-04-04
**目标服务器：** GCP 34.180.93.185（https://aigc.guangai.ai）

---

## 测试目标

验证新服务器（16GB RAM）在以下维度的性能表现：
1. 静态/模型列表接口的基础吞吐量
2. Redis 缓存生效后的加速效果（模型页、用量页）
3. 并发下系统稳定性（错误率 < 1%）

---

## 角色分工

| 功能 | 阶段 | 执行者 |
|---|---|---|
| F-STRESS-01 编写脚本 | building | Claude CLI (Generator) |
| F-STRESS-02 执行压测 + 出报告 | verifying | Codex (Evaluator) |

**F-STRESS-02 由 Codex 在 verifying 阶段执行，Generator 不负责运行测试。**

## 测试工具

**autocannon**（Node.js HTTP 压测工具，无需全局安装）：
```bash
npx autocannon -c <并发数> -d <持续秒数> <URL>
```

建议 Codex SSH 至生产服务器（34.180.93.185）本地执行，或直接在本地通过 HTTPS 打生产地址：
```bash
BASE_URL=https://aigc.guangai.ai npx tsx scripts/stress-test.ts
```

---

## 测试账号

Generator 使用以下账号获取管理员 JWT（先调 `/api/auth/login`，取返回的 `token`）：

- **Email：** `codex-admin@aigc-gateway.local`
- **Password：** `Codex@2026!`
- **JWT 有效期：** 7 天，压测期间无需刷新

---

## 测试场景

### 阈值说明（重要）

> 原始阈值（P99 < 200ms）基于本地网络假设，不适用于外网生产压测场景。
> 经两轮实测数据校准（2026-04-04 / 2026-04-05），本 spec 采用以下外网 HTTPS 场景下的合理阈值：
>
> - **A/B（大 JSON 响应）**：响应体 100–300KB，nginx 当前无 gzip，外网传输成为主要瓶颈
> - **C/D（小 JSON 聚合）**：P50 已 ~170ms，P99 受并发排队影响有长尾
> - **后续 nginx gzip 优化批次** 完成后，A/B 阈值预计可收紧至 < 800ms

---

### 场景 A — /v1/models（基线，无需 Auth）

验证公开接口的吞吐量和 Redis 缓存。

```
并发：50
持续：30 秒
URL：https://aigc.guangai.ai/v1/models
```

**预期：**
- 首次（缓存 miss）RPS > 30
- 第二轮（缓存 hit）RPS > 30（大 JSON 传输受带宽限制）
- Warm P99 < 2000ms
- 错误率 < 1%

---

### 场景 B — /api/admin/models-channels（模型页，需 JWT）

验证模型页 Redis 缓存效果（本批次性能优化的核心场景）。

```
并发：20
持续：30 秒
URL：https://aigc.guangai.ai/api/admin/models-channels
Headers: Authorization: Bearer <JWT>
```

**预期：**
- 首次（缓存 miss）P99 < 12s（无 gzip 时 DB 查询重，正常）
- 第二轮（缓存 hit）Warm P99 < 2000ms（缓存效果验证：冷热差距应 > 3x）
- 错误率 = 0%

---

### 场景 C — /api/admin/usage?period=7d（用量页，需 JWT）

验证用量页查询优化效果（全表扫描已修复）。

```
并发：20
持续：30 秒
URL：https://aigc.guangai.ai/api/admin/usage?period=7d
Headers: Authorization: Bearer <JWT>
```

**预期：**
- Warm P99 < 800ms
- P50 < 250ms
- 错误率 < 1%

---

### 场景 D — /api/admin/usage/by-model（用量按模型，需 JWT）

```
并发：20
持续：30 秒
URL：https://aigc.guangai.ai/api/admin/usage/by-model?period=7d
Headers: Authorization: Bearer <JWT>
```

**预期：** 同场景 C（Warm P99 < 800ms，P50 < 250ms，错误率 < 1%）

---

### 场景 E — 混合并发（综合稳定性）

同时并发打 A + B + C，持续 60 秒，验证系统在多接口并发下的稳定性。

```
并发 A：20 × /v1/models
并发 B：10 × /api/admin/models-channels
并发 C：10 × /api/admin/usage?period=7d
总并发：40
持续：60 秒
```

**预期：**
- 全程错误率 < 1%
- Max P99 < 2000ms
- PM2 进程不重启

---

## 功能点

### F-STRESS-01 — 编写压测脚本

**文件：** `scripts/stress-test.ts`

脚本结构：
1. 登录获取 JWT（`POST /api/auth/login`）
2. 依次执行场景 A → B → C → D（缓存预热：每个场景跑两轮）
3. 执行场景 E（混合并发）
4. 汇总结果，打印至 stdout

脚本入口：
```bash
BASE_URL=https://aigc.guangai.ai npx tsx scripts/stress-test.ts
```

### F-STRESS-02 — 执行压测并生成报告

Generator 执行脚本，将结果写入：
```
docs/test-reports/stress-test-2026-04-04.md
```

报告格式：
- 每个场景：RPS / P50 / P95 / P99 / 错误率（两轮对比：冷/热）
- 混合并发：整体错误率 + 最高 P99
- 结论：是否达到预期指标，发现的瓶颈（如有）

---

## 验收标准

1. `scripts/stress-test.ts` 可正常执行，无运行时报错，P95 字段非 undefined
2. 报告文件 `docs/test-reports/stress-test-2026-04-04.md` 已生成，包含所有 5 个场景的冷/热两轮数据
3. 场景 A/B Warm P99 < 2000ms（当前无 gzip，大 JSON 传输受限）
4. 场景 C/D Warm P99 < 800ms，P50 < 250ms
5. 场景 B 冷热差距 > 3x（验证 Redis 缓存确实生效）
6. 场景 E 混合并发错误率 < 1%，Max P99 < 2000ms
7. 压测期间 PM2 进程未重启（`pm2 list` 显示 restart_time = 0）

---

## 注意事项

- **不测试 `/v1/chat/completions`**：会触发真实 AI Provider 调用，产生费用
- **不测试写操作**（POST/PATCH/DELETE）：避免污染生产数据
- 如场景 E 出现大量 5xx，立即停止测试，检查 PM2 日志
- 压测结束后 Redis 缓存会继续工作，不需要 flush

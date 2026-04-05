# nginx gzip 压缩 + /v1/models location 拆分 规格文档

**批次：** nginx-gzip 批次
**日期：** 2026-04-05
**优先级：** P1（压测发现的根本性性能瓶颈）

---

## 背景与目标

压测批次（2026-04-05 签收）发现：

1. **nginx 配置完全没有 gzip 指令**，`/v1/models` 和 `/api/admin/models-channels` 返回 100–300KB 的大 JSON，外网传输是 P99 偏高的根本原因（A/B Warm P99 ~1600ms）
2. **`/v1/` location 统一设了 `proxy_buffering off`**（为 SSE streaming），导致 `/v1/models`（非流式）也无法受益于 nginx gzip
3. **`proxy_pass` 仍写着 `http://app:3000`**（Docker 遗留），与生产实际（PM2 + localhost:3000）不一致，需一并修正

**目标：** A/B Warm P99 从 ~1600ms 降至 < 800ms。

---

## 变更范围

仅修改 `nginx/conf.d/default.conf`，不涉及应用代码。

---

## 设计决策

### 1. 启用 nginx gzip

在 `aigc.guangai.ai` server block 内加入：

```nginx
gzip on;
gzip_types application/json text/plain text/css application/javascript;
gzip_min_length 1024;
gzip_comp_level 4;
gzip_vary on;
```

- `gzip_min_length 1024`：小于 1KB 的响应不压缩（C/D 用量接口响应体很小，压缩收益低于 CPU 开销）
- `gzip_comp_level 4`：平衡压缩率（~70%）与 CPU 开销
- `gzip_vary on`：添加 `Vary: Accept-Encoding`，确保 CDN / 代理正确缓存

### 2. 拆分 `/v1/models` location

在 `/v1/` location **之前**新增精确匹配块：

```nginx
# 非流式：允许 buffering，受益于 gzip
location = /v1/models {
    proxy_pass         http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
    # 不设 proxy_buffering off → nginx 可 gzip 压缩此响应
}
```

原 `/v1/` location 保持 `proxy_buffering off`（SSE streaming 必需），仅将 `proxy_pass` 地址修正。

### 3. 全局替换 `proxy_pass` 地址

将所有 `proxy_pass http://app:3000` 改为 `proxy_pass http://localhost:3000`，与生产部署（PM2 非 Docker）一致。

---

## 部署方式

Generator 修改 `nginx/conf.d/default.conf` 后：

1. 代码推送到 main → CI/CD 自动部署（GitHub Actions）
2. 部署脚本中 nginx reload 步骤已包含（或 Codex 在验收时 SSH 手动 `nginx -t && systemctl reload nginx`）

---

## 功能点

### F-GZIP-01 — 修改 nginx 配置（executor: generator）

文件：`nginx/conf.d/default.conf`

改动清单：
1. 在 `aigc.guangai.ai` server block 顶部加入 gzip 配置块
2. 在 `/v1/` location 前新增 `location = /v1/models` 精确匹配块（无 proxy_buffering off）
3. 将所有 `proxy_pass http://app:3000` 改为 `proxy_pass http://localhost:3000`

**验收标准：**
- `nginx -t` 通过（语法无误）
- `/v1/models` location 在 `/v1/` location 之前定义
- gzip 配置包含 `application/json`
- 不存在 `http://app:3000`

### F-GZIP-02 — 部署验证 + 压测复跑（executor: codex）

Codex 在生产服务器完成以下步骤：

1. SSH 确认 nginx 已加载新配置（`nginx -T | grep gzip`）
2. 验证 `/v1/models` 响应带有 `Content-Encoding: gzip` 头（`curl -H "Accept-Encoding: gzip" -I`）
3. 重跑完整压测：`BASE_URL=https://aigc.guangai.ai npx tsx scripts/stress-test.ts`
4. 对比新旧数据，确认 A/B Warm P99 明显下降
5. 更新 `docs/specs/stress-test-spec.md` 中 A/B 的阈值（若 Warm P99 < 800ms 则收紧为 < 800ms）
6. 将压测结果写入 `docs/test-reports/stress-test-postgzip-2026-04-05.md`

**验收标准：**
1. `nginx -T | grep gzip` 输出包含 `gzip on`
2. `curl -sI -H "Accept-Encoding: gzip" https://aigc.guangai.ai/v1/models | grep content-encoding` 返回 `content-encoding: gzip`
3. A Warm P99 < 800ms（当前 1654ms，目标降幅 > 50%）
4. B Warm P99 < 800ms（当前 1554ms）
5. C/D Warm P99 仍 < 800ms（不应退步）
6. 场景 E 错误率 < 1%，PM2 未重启
7. 压测报告文件已生成

---

## 注意事项

- nginx `location` 匹配优先级：精确匹配（`= /v1/models`）优先于前缀匹配（`/v1/`），顺序是保险，也是规范写法
- `cdn.aigc.guangai.ai` server block 不需要 gzip（静态资源已由 `Cache-Control: immutable` 处理）
- 不修改应用代码，不修改 Redis 缓存逻辑
- 若 A/B Warm P99 未达 < 800ms，Codex 应分析原因（可能 gzip 未生效或 Redis 未命中），写入报告

---

## 预期效果

| 接口 | 当前 Warm P99 | 预期 Warm P99 | 依据 |
|---|---|---|---|
| `/v1/models` | 1654ms | < 600ms | gzip 后响应体 ~200KB → ~40KB |
| `/api/admin/models-channels` | 1554ms | < 600ms | 同上 |
| `/api/admin/usage` | 615ms | < 600ms | 小响应，变化不大 |
| `/api/admin/usage/by-model` | 627ms | < 600ms | 同上 |

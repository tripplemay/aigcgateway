# Performance Test Assets

本目录存放 AIGC Gateway 的性能测试资产，只用于测试和验收，不属于产品实现。

## 目录结构

- `k6/`
  - `public-read-baseline.js`
  - `developer-paths.js`
  - `admin-and-jobs.js`
- `autocannon/`
  - `quick-regression.sh`
- `.env.example`

## 前置条件

至少准备以下测试数据：

- 普通用户账号 1 个
- 管理员 token 1 个
- 正常余额项目
- 零余额项目
- 至少 3 个 Key：
  - 正常 Key
  - `chatCompletion=false` Key
  - 低 RPM 或专用限流 Key

## 环境变量

先复制一份环境变量模板：

```bash
cp tests/perf/.env.example tests/perf/.env.local
```

然后补齐：

- `BASE_URL`
- `DEV_EMAIL`
- `DEV_PASSWORD`
- `ADMIN_TOKEN`
- `ZERO_BALANCE_KEY`
- `NO_CHAT_KEY`
- `REAL_CHAT_KEY`
- `CHAT_MODEL`

## 推荐执行顺序

### 1. 快速回归

```bash
set -a
source tests/perf/.env.local
set +a
bash tests/perf/autocannon/quick-regression.sh
```

### 2. 公开读基线

```bash
set -a
source tests/perf/.env.local
set +a
k6 run tests/perf/k6/public-read-baseline.js
```

### 3. 普通用户路径

```bash
set -a
source tests/perf/.env.local
set +a
k6 run tests/perf/k6/developer-paths.js
```

### 4. 管理员与后台任务

```bash
set -a
source tests/perf/.env.local
set +a
k6 run tests/perf/k6/admin-and-jobs.js
```

## 当前脚本覆盖范围

### `public-read-baseline.js`

- `GET /api/v1/models`
- 适合公开读 smoke 和小负载基线

### `developer-paths.js`

- `POST /api/auth/login`
- `POST /api/v1/chat/completions`
  - 零余额 fast-fail
  - 无聊天权限 fast-fail
  - 真实聊天基线

### `admin-and-jobs.js`

- `GET /api/admin/sync-status`
- `GET /api/admin/channels`
- `GET /api/admin/users`
- `POST /api/admin/sync-models`

### `quick-regression.sh`

- `GET /api/v1/models`
- `POST /api/auth/login`
- `GET /api/admin/sync-status`
- `GET /api/admin/channels`

## 注意事项

- 默认不要在生产上直接跑真实聊天高并发
- `POST /api/admin/sync-models` 默认只做单次 smoke
- 如果要在生产执行，先遵守仓库 `AGENTS.md`
- 遇到 5xx、502、504 或明显延迟飙升，应立即降载

## 当前状态

- 当前目录已具备首轮执行骨架
- 当前未包含性能结果报告
- 当前环境未检测到 `k6` 和 `autocannon` 已安装

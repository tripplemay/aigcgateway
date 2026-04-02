# AIGC Gateway Staging 首轮性能执行清单

## 目标

基于 [aigc-gateway-performance-test-plan-2026-04-02.md](/Users/yixingzhou/project/aigcgateway/docs/test-reports/aigc-gateway-performance-test-plan-2026-04-02.md)，定义一套 staging 环境首轮执行清单，确保第一次正式性能试跑可控、可回滚、可复盘。

## 执行前确认

### 环境

- 确认目标环境为 staging / perf，不是生产
- 记录基线版本：
  - git 分支 / commit SHA
  - 构建时间
  - 部署批次
- 记录基础地址：
  - `BASE_URL`
  - 是否走 CDN / Nginx / 直连服务

### 数据准备

- 普通用户账号 1 个
- 管理员账号 1 个
- 已登录普通用户项目 2 个：
  - 1 个正常余额项目
  - 1 个零余额项目
- API Key 至少 3 个：
  - 正常 Key
  - `chatCompletion=false` Key
  - 低 RPM Key
- 至少 1 个低成本文本模型可用

### 观测准备

- 打开应用日志 / PM2 日志
- 打开 Nginx access/error log
- 打开数据库监控
- 打开 Redis 监控
- 若有 APM，记录 dashboard 链接

### 风险边界

- 首轮不跑支付链路
- 首轮不跑高并发真实模型压测
- 首轮只允许单次 `sync-models` trigger
- 如果出现连续 5xx、502、504，立即停止

## 首轮执行顺序

### Batch 1: Smoke

1. `python3 scripts/http_load_probe.py --url $BASE_URL/api/v1/models --requests 20 --concurrency 2`
2. 登录 smoke
3. `GET /api/admin/sync-status` smoke

通过标准：

- 所有请求成功
- 无 5xx
- 无鉴权异常

### Batch 2: Quick Regression

执行：

- [quick-regression.sh](/Users/yixingzhou/project/aigcgateway/tests/perf/autocannon/quick-regression.sh)

通过标准：

- `GET /api/v1/models` p95 < 500ms
- `POST /api/auth/login` p95 < 800ms
- `GET /api/admin/sync-status` p95 < 500ms
- `GET /api/admin/channels` p95 < 800ms

### Batch 3: Developer k6

执行：

- [developer-paths.js](/Users/yixingzhou/project/aigcgateway/tests/perf/k6/developer-paths.js)

首轮只启用：

- login
- zero balance gate
- no chat permission gate

真实模型 `real_chat_baseline` 只在预算确认后打开。

通过标准：

- login p95 < 800ms
- 402 / 403 fast-fail 稳定
- 无 provider 误调用

### Batch 4: Admin k6

执行：

- [admin-and-jobs.js](/Users/yixingzhou/project/aigcgateway/tests/perf/k6/admin-and-jobs.js)

首轮只启用：

- sync status
- channels
- users
- 单次 sync trigger

通过标准：

- 读接口无 5xx
- sync trigger 返回时间 < 5s
- 后台同步状态正常刷新

### Batch 5: Data Chain Validation

在执行一次真实聊天请求后，复查：

- `GET /api/projects/:id/logs`
- `GET /api/projects/:id/usage`
- `GET /api/projects/:id/usage/daily`

通过标准：

- 1 次调用能在可接受延迟内进入日志和统计

## 建议环境变量

```bash
export BASE_URL="https://staging.example.com"
export DEV_EMAIL="dev@example.com"
export DEV_PASSWORD="Test1234"
export ADMIN_TOKEN="..."
export ZERO_BALANCE_KEY="..."
export NO_CHAT_KEY="..."
export REAL_CHAT_KEY="..."
export CHAT_MODEL="deepseek/v3"
```

## 建议执行命令

```bash
k6 run tests/perf/k6/public-read-baseline.js
```

```bash
k6 run tests/perf/k6/developer-paths.js
```

```bash
k6 run tests/perf/k6/admin-and-jobs.js
```

```bash
bash tests/perf/autocannon/quick-regression.sh
```

## 产物要求

每个批次至少输出：

- 环境
- 工作负载
- p50 / p95 / p99
- success rate
- status-code 分布
- 失败截图或日志摘要
- Stop Condition 是否触发

建议文件：

- `docs/test-reports/perf-staging-batch1-smoke-<date>.md`
- `docs/test-reports/perf-staging-batch2-regression-<date>.md`
- `docs/test-reports/perf-staging-batch3-developer-<date>.md`
- `docs/test-reports/perf-staging-batch4-admin-<date>.md`

## 当前状态

- 当前文档只定义 staging 首轮执行清单
- 当前未执行任何性能测试

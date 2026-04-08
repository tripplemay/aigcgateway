# R2A 验收报告（verifying）

- 批次: `R2A-user-pages-keys-logs-models`
- 阶段: `verifying`
- 执行时间: `2026-04-08`
- 环境: `L1 本地` (`http://localhost:3099`)
- 执行者: `codex: Reviewer`

## 执行概览

1. 按规范启动测试环境：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`。
2. 登录控制台（`admin@aigc-gateway.local / admin123`），创建项目 `R2A Verify Project`。
3. 验证目标页面可访问：`/keys`、`/keys/[keyId]`、`/logs`、`/logs/[traceId]`、`/models`。
4. 执行关键链路：创建 Key、编辑 Key、吊销 Key、日志列表查看与详情页访问。
5. 结合源码与 `design-draft/*/code.html` 做结构与验收项核对。

## 结果汇总

- PASS: 2
- PARTIAL: 2
- FAIL: 5

## 各功能判定

- `F-R2A-01` PASS
  - `/keys` 列表使用 `useAsyncData + Table + SearchBar + Pagination`，列与编辑/吊销操作存在且可用。
- `F-R2A-02` FAIL
  - 创建弹窗过期选项与验收不一致：实现为 `Never/30d/90d/1y`，缺少 `60d` 且多出 `1y`。
- `F-R2A-03` PASS
  - 吊销确认弹窗可用，执行后状态更新为 `已吊销`。
- `F-R2A-04` FAIL
  - `/keys/[keyId]` 缺少过期设置项；不满足“过期设置可编辑”验收点。
- `F-R2A-05` FAIL
  - `/logs` 未实现“模型筛选下拉”；行点击行为为“行内展开”而非“跳转详情页”。
- `F-R2A-06` FAIL
  - `/logs/[traceId]` 未实现“质量评分按钮（POST quality API）”。
- `F-R2A-07` PARTIAL
  - 页面加载、分组框架与筛选控件存在；但种子数据下无模型，未能完成真实分组折叠行为验证。
- `F-R2A-08` FAIL
  - 存在多处硬编码英文，违反“无硬编码用户文案”验收要求。
- `F-R2A-09` PARTIAL
  - 页面加载正常，关键 CRUD（创建/吊销 key、查看日志详情）已验证；但 DS/Card 与设计还原及 i18n 仍有未达标项，不能签收。

## 关键证据

### 运行时证据

- `/keys`：创建 key 成功，出现一次性明文 key；吊销后状态变更为 `已吊销`。
- `/logs`：插入测试日志后可见记录并可展开详情。
- `/logs/[traceId]`：可直达详情页并展示 `Prompt/Response/Parameters`。
- `/models`：页面可访问，无崩溃。

### 代码证据（行号）

- 创建弹窗过期选项不符合验收：
  - `src/components/keys/create-key-dialog.tsx:212-216`
- Keys 设置页缺少过期字段（仅有 rate limit + ip whitelist）：
  - `src/app/(console)/keys/[keyId]/page.tsx:170-190`
- Logs 页未实现模型下拉；点击行走 `loadDetail` 行内展开：
  - `src/app/(console)/logs/page.tsx:199-203`
- Logs 详情页无质量评分按钮/调用：
  - `src/app/(console)/logs/[traceId]/page.tsx:1-260`（无 `/quality` 或评分入口）
- i18n 未完全接入（硬编码英文示例）：
  - `src/app/(console)/logs/page.tsx:128`
  - `src/app/(console)/logs/page.tsx:192`
  - `src/app/(console)/logs/page.tsx:316-321`
  - `src/app/(console)/logs/[traceId]/page.tsx:64`
  - `src/app/(console)/logs/[traceId]/page.tsx:120`

## 风险结论

- 当前批次不满足签收条件，`status` 应转入 `fixing`。
- 建议优先修复顺序：`F-R2A-05` / `F-R2A-06` / `F-R2A-08` / `F-R2A-04` / `F-R2A-02`，最后复验 `F-R2A-07` 与 `F-R2A-09`。


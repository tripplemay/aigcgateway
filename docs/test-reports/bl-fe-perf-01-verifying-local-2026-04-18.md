# BL-FE-PERF-01 本地验收报告（verifying）

- 批次：`BL-FE-PERF-01`
- 执行日期：`2026-04-18`
- 环境：L1 本地（`http://localhost:3099`）
- 执行者：Codex（Reviewer）

## 执行说明

1. 按约定启动方式执行：
   - `ADMIN_SEED_PASSWORD='***' IMAGE_PROXY_SECRET='***' bash scripts/test/codex-setup.sh`
   - `bash scripts/test/codex-wait.sh`
2. 发现并处理两处环境阻塞（仅运行时变量）：
   - 初次 seed 失败：缺少 `ADMIN_SEED_PASSWORD`
   - 初次启动失败：缺少 `IMAGE_PROXY_SECRET`
3. 未修改任何产品实现代码，仅执行验证并生成测试产物。

## 验收结果总览（对应 F-PF-07 的 19 条）

| # | 验收项 | 结果 | 证据摘要 |
|---|---|---|---|
| 1 | `/dashboard` First Load JS ≤ 180kB | PASS | `169 kB`（`npm run build`） |
| 2 | `/usage` First Load JS ≤ 180kB | PASS | `159 kB` |
| 3 | `/admin/usage` First Load JS ≤ 160kB | PASS | `112 kB` |
| 4 | `/` First Load JS ≤ 90kB | PASS | `87.8 kB` |
| 5 | Recharts chunk 不在三大路由 First Load | PASS | `6627.65f71e1b98d155d3.js` 存在；Route 表中三路由首包未包含该 chunk |
| 6 | `/dashboard` LCP ≤ 1.5s | PASS | 性能 trace：`LCP 159ms` |
| 7 | `/dashboard` CLS ≤ 0.1 | PASS | 性能 trace：`CLS 0.00` |
| 8 | `/` 首字节为重定向（meta/302） | PASS | HTML RSC 流中出现 `NEXT_REDIRECT;replace;/landing.html;307;` / `.../dashboard;307;` |
| 9 | `/dashboard` 只加载一个 `messages/*.json` | FAIL | Network 未出现 `messages/*.json`，实际加载 locale chunk（`5121...js`） |
| 10 | 语言切换动态请求另一个 JSON | FAIL | 切换 CN 后加载的是 `5504...js` locale chunk，不是 `messages/*.json` |
| 11 | `npm run build` 通过 | PASS | 命令成功；Route 体积输出完整 |
| 12 | `npx tsc --noEmit` 通过 | PASS | 命令退出码 `0`（无错误输出） |
| 13 | `npx vitest run` 全过 | PASS | `16 passed / 116 passed` |
| 14 | `npm run analyze` 生成 report | PASS | 生成 `.next/analyze/nodejs.html`、`edge.html`、`client.html` |
| 15 | 未登录访问 `/` → `/landing.html` | PASS | `NEXT_REDIRECT;replace;/landing.html;307;` |
| 16 | 已登录访问 `/` → `/dashboard` | PASS | 登录后请求 `/`，出现 `NEXT_REDIRECT;replace;/dashboard;307;` |
| 17 | dashboard 图表正常显示、无白屏闪烁 | PASS | 创建项目后进入仪表盘，图表区标题与卡片正常呈现（见浏览器快照） |
| 18 | zh-CN ↔ en 切换生效 | PASS | UI 文案双向切换成功（中英导航与空态文案可见） |
| 19 | 生成 signoff 报告 | BLOCKED | 存在 FAIL（#9/#10），不满足 signoff 条件 |

## 关键命令与输出

1. `npx vitest run`：
   - `Test Files 16 passed`
   - `Tests 116 passed`
2. `npm run analyze`：
   - `Webpack Bundle Analyzer saved report to .../.next/analyze/nodejs.html`
   - `...edge.html`
   - `...client.html`
3. `npm run build`（关键路由）：
   - `/ 87.8 kB`
   - `/dashboard 169 kB`
   - `/usage 159 kB`
   - `/admin/usage 112 kB`

## 性能证据附件

- `docs/test-reports/perf-raw/bl-fe-perf-01-dashboard-lighthouse-navigation-2026-04-18.json`
- `docs/test-reports/perf-raw/bl-fe-perf-01-dashboard-lighthouse-navigation-2026-04-18.html`

> 注：`chrome_devtools.lighthouse_audit` 不含 performance 分；LCP/CLS 来自同次导航性能 trace（`LCP 159ms`，`CLS 0.00`）。

## 结论

当前批次 **未达到全量签收条件**。  
失败点集中在 i18n 验收口径（要求 `messages/*.json`）与实际实现形态（locale chunk `*.js`）不一致。

建议进入修复/澄清二选一：
1. 若产品要求必须是 `messages/*.json` 网络请求：实现需继续调整。
2. 若接受“按需 locale chunk 动态加载”作为等效方案：需先更新验收标准后再复验。

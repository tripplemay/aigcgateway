# BL-FE-PERF-01 验收用例（待执行）

- 批次：`BL-FE-PERF-01`
- 阶段：`verifying` / `reverifying`
- 目标功能：`F-PF-07`（`executor: codex`）
- 当前状态：**仅准备用例，不执行测试**

## 验收范围

1. 三大路由 Recharts 懒加载后的 First Load JS 体积达标。
2. i18n 改为按需加载，单页只拉取当前语言 JSON。
3. dashboard CLS 修复与字体 preconnect 生效。
4. `/` 路由改为 RSC 重定向并完成未登录/已登录冒烟。
5. console 路由 loading 边界与图表渲染体验回归。
6. 构建、类型、单测、analyze 工具链通过。
7. 产出 signoff 报告。

## 前置条件（执行时）

1. Generator 已完成并推送 `F-PF-01` ~ `F-PF-06`。
2. 本地按 Codex 端口启动：
1. `bash scripts/test/codex-setup.sh`
2. `bash scripts/test/codex-wait.sh`
3. 使用 `http://localhost:3099` 作为验证地址。
3. 可使用测试账号登录：
1. `codex-admin@aigc-gateway.local`
2. `codex-dev@aigc-gateway.local`
4. 浏览器可打开 DevTools（Network + Lighthouse）。

## L1 本地验收矩阵

### TC-PF-01 构建产物体积基线采集
- 目的：一次性收集 `/dashboard`、`/usage`、`/admin/usage`、`/` 的 First Load JS。
- 步骤：
1. 执行 `npm run build`。
2. 记录 build 输出中四个路由的 First Load JS。
- 期望：
1. 输出可见四个路由体积，供后续阈值断言。

### TC-PF-02 /dashboard First Load 阈值
- 目的：验证 dashboard 降至目标体积。
- 步骤：
1. 复用 TC-PF-01 的 build 输出。
- 期望：
1. `/dashboard` First Load JS `<= 180 kB`。

### TC-PF-03 /usage First Load 阈值
- 目的：验证 usage 降至目标体积。
- 步骤：
1. 复用 TC-PF-01 的 build 输出。
- 期望：
1. `/usage` First Load JS `<= 180 kB`。

### TC-PF-04 /admin/usage First Load 阈值
- 目的：验证 admin usage 降至目标体积。
- 步骤：
1. 复用 TC-PF-01 的 build 输出。
- 期望：
1. `/admin/usage` First Load JS `<= 160 kB`。

### TC-PF-05 / 路由 First Load 阈值
- 目的：验证首页改 RSC 后体积达标。
- 步骤：
1. 复用 TC-PF-01 的 build 输出。
- 期望：
1. `/` First Load JS `<= 90 kB`。

### TC-PF-06 recharts chunk 不进入三大路由 First Load
- 目的：确认 Recharts 仍可按需加载但不污染首包。
- 步骤：
1. 在 `.next/static/chunks` 中查找 Recharts 大 chunk（如 `6627-*.js`）。
2. 对照 build 输出确认三大路由 First Load 列表不包含该 chunk。
- 期望：
1. Recharts chunk 存在（可懒加载）。
2. `/dashboard`、`/usage`、`/admin/usage` 首包不再被其拖大。

### TC-PF-07 /dashboard Lighthouse LCP
- 目的：验证性能体验目标中的 LCP。
- 步骤：
1. `npm run build && npm start` 启动生产模式。
2. Lighthouse 跑 `/dashboard` 一次（桌面，默认配置）。
- 期望：
1. LCP `<= 1.5s`。

### TC-PF-08 /dashboard Lighthouse CLS
- 目的：验证布局偏移指标修复。
- 步骤：
1. 复用 TC-PF-07 的 Lighthouse 报告。
- 期望：
1. CLS `<= 0.1`。

### TC-PF-09 / 路由首字节重定向验证
- 目的：验证首页由服务端直接重定向。
- 步骤：
1. 未登录状态请求 `curl -i -sS http://localhost:3099/`。
2. 浏览器 `view-source:http://localhost:3099/` 辅助核对。
- 期望：
1. 响应为 `302/307` 到 `/landing.html`，或 HTML 首包即 redirect meta。
2. 不出现依赖客户端 JS 再跳转的行为。

### TC-PF-10 i18n 单语言加载（首次进入 dashboard）
- 目的：验证默认仅请求当前语言消息包。
- 步骤：
1. 登录并进入 `/dashboard`。
2. DevTools Network 过滤 `messages/*.json`。
- 期望：
1. 仅看到一个语言文件（`en.json` 或 `zh-CN.json`）。

### TC-PF-11 i18n 切换后动态加载另一个语言包
- 目的：验证语言切换触发动态 import。
- 步骤：
1. 在 dashboard 执行语言切换（`zh-CN` ↔ `en`）。
2. 观察 Network 新请求。
- 期望：
1. 切换后请求另一个 `messages/*.json`。
2. 文案切换生效且无报错。

### TC-PF-12 build 命令通过
- 目的：验证发布构建可通过。
- 步骤：
1. 执行 `npm run build`。
- 期望：
1. 命令成功退出（exit code 0）。

### TC-PF-13 TypeScript 检查通过
- 目的：验证类型安全无回归。
- 步骤：
1. 执行 `npx tsc --noEmit`。
- 期望：
1. 命令成功退出（exit code 0）。

### TC-PF-14 单元测试通过
- 目的：验证既有测试无回归。
- 步骤：
1. 执行 `npx vitest run`。
- 期望：
1. 全部测试通过。

### TC-PF-15 analyze 可生成报告
- 目的：验证 bundle-analyzer 接入可用。
- 步骤：
1. 执行 `npm run analyze`。
2. 检查 analyzer 报告文件是否生成（按项目脚本实际路径记录）。
- 期望：
1. 命令成功退出。
2. report 文件可打开。

### TC-PF-16 未登录访问 / 冒烟
- 目的：验证首页分流到 landing。
- 步骤：
1. 清除 cookie 后访问 `http://localhost:3099/`。
- 期望：
1. 最终到达 `/landing.html`。

### TC-PF-17 已登录访问 / 冒烟
- 目的：验证首页分流到 dashboard。
- 步骤：
1. 先登录，保留会话 cookie。
2. 访问 `http://localhost:3099/`。
- 期望：
1. 最终到达 `/dashboard`。

### TC-PF-18 dashboard 图表渲染体验
- 目的：验证图表延迟加载后功能正常且无白屏闪烁。
- 步骤：
1. 进入 dashboard，观察图表区域加载过程。
2. 刷新页面再次观察。
- 期望：
1. 先显示 Skeleton/占位，再平滑显示图表。
2. 无长时间白屏或图表缺失。

### TC-PF-19 signoff 文档产出校验
- 目的：确保全 PASS 后签收文件落盘。
- 步骤：
1. 若 TC-PF-01 ~ TC-PF-18 全通过，创建 signoff：
   `docs/test-reports/BL-FE-PERF-01-signoff-2026-04-18.md`
2. 更新 `progress.json` 的 `docs.signoff` 指向该文件（执行阶段完成）。
- 期望：
1. signoff 文件存在且内容完整。
2. `docs.signoff` 非空。

## 证据采集要求（执行时）

1. 命令行证据：build / tsc / vitest / analyze 输出摘要。
2. 网络证据：`messages/*.json` 请求截图（首次加载 + 切换语言）。
3. Lighthouse 证据：`/dashboard` 报告（含 LCP/CLS）。
4. 路由证据：`/` 未登录与已登录重定向结果。
5. 体验证据：dashboard 图表 Skeleton → 图表渲染过程截图。

## 执行输出（执行时）

1. 首轮验收报告（建议）：
`docs/test-reports/bl-fe-perf-01-verifying-local-2026-04-18.md`
2. 复验报告（如有）：
`docs/test-reports/bl-fe-perf-01-reverifying-local-2026-04-18-roundN.md`
3. 最终签收：
`docs/test-reports/BL-FE-PERF-01-signoff-2026-04-18.md`

## 备注

1. 当前仅完成用例准备，未执行任何测试命令。
2. 收到你“开始测试”指令后，将按本用例逐项执行并附证据。

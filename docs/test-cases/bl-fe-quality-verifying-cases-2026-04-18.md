# BL-FE-QUALITY 验收用例（待执行）

- 批次：`BL-FE-QUALITY`
- 阶段：`verifying` / `reverifying`
- 目标功能：`F-FQ-05`（`executor: codex`）
- 当前状态：**仅准备用例，不执行测试**

## 验收范围

1. UX 交互改造：9 处 reload SPA 化、settings 双事件、keys 复制行为、通知轮询可见性门控、admin 页面并发请求策略。
2. template-testing polish：admin PATCH 非法 JSON 返回、Decimal 精度累加、waitForCallLog 等待策略。
3. A11y + i18n：Lighthouse 分数、error 页面文案、本地化文本、通知相对时间本地化。
4. DS Critical：3 个关键页面色值与类名合规、视觉回归。
5. 构建回归与签收产物。

## 前置条件（执行时）

1. Generator 已完成并推送 `F-FQ-01` ~ `F-FQ-04`。
2. 本地按 Codex 端口启动：
1. `bash scripts/test/codex-setup.sh`
2. `bash scripts/test/codex-wait.sh`
3. 使用 `http://localhost:3099` 作为验证地址。
3. 可使用管理员测试账号登录并访问 `/admin/*` 页面。
4. 可使用浏览器 DevTools（Network、Performance、Lighthouse、Elements）。

## L1 本地验收矩阵

### TC-FQ-01 9 页面 `onCreated` 的 SPA 行为
- 目的：验证 `window.location.reload()` 已改为 SPA 友好刷新，不出现全页闪烁重载。
- 步骤：
1. 覆盖 9 个页面：`balance`、`usage`、`dashboard`、`logs/[traceId]`、`logs`、`actions`、`templates`、`keys/[keyId]`、`keys`。
2. 在每页触发 `EmptyState` 的创建回调（如创建项目/资源）。
3. 观察页面跳转与滚动/状态保留情况。
- 期望：
1. 无浏览器级整页硬重载闪白。
2. 数据刷新成功且页面交互保持 SPA 体验。

### TC-FQ-02 settings 点击事件仅触发一次
- 目的：验证重复绑定事件已移除。
- 步骤：
1. 打开 `settings` 页面。
2. 对目标按钮连续单击并监控一次点击产生的副作用（请求数、toast、日志）。
- 期望：
1. 单次点击只触发一次 handler。
2. 无双请求/双提示现象。

### TC-FQ-03 keys 复制按钮语义校验
- 目的：验证复制逻辑与提示符合新策略。
- 步骤：
1. 打开 `keys` 页面。
2. 对可复制场景点击复制，读取剪贴板值（或 UI 返回）。
3. 对不可复制场景检查按钮状态与提示文案。
- 期望：
1. 可复制时复制真实 key。
2. 不可复制时明确提示“仅创建时可复制”（或等效文案）并禁用。

### TC-FQ-04 NotificationCenter 可见性门控
- 目的：验证隐藏标签页时轮询停止，恢复可见时才重新轮询。
- 步骤：
1. 在 dashboard 打开通知中心并记录初始请求。
2. 切换到其他标签页并等待 30s+。
3. 返回标签页观察网络请求。
- 期望：
1. 页面隐藏期间无持续 30s 轮询请求。
2. 恢复可见后立即一次请求并恢复正常 interval。

### TC-FQ-05 admin 页面并发抓取策略
- 目的：验证 admin/usage、admin/models、admin/operations 无无序串行阻塞。
- 步骤：
1. 分别打开 3 个页面并记录首屏请求序列。
2. 检查是否单次聚合请求或 `Promise.all` 并发请求模式。
- 期望：
1. 请求数量与并发模式符合批次改造目标。
2. 无明显串行 waterfall。

### TC-FQ-06 admin templates PATCH 非法 JSON
- 目的：验证非法 body 返回 400 而非 500。
- 步骤：
1. 构造 `PATCH /api/admin/templates/:templateId` 请求，发送非法 JSON。
2. 记录响应状态码与错误结构。
- 期望：
1. 返回 `400`。
2. 错误语义为 `invalid_parameter`（或等效明确参数错误）。

### TC-FQ-07 test-runner Decimal 精度
- 目的：验证 `totalCostUsd` 累加精度不丢失。
- 步骤：
1. 准备 10 步模板测试运行数据。
2. 记录 runner 汇总 `totalCostUsd`。
3. 直接查询 callLog 的 `sum(sellPrice)` 做对照。
- 期望：
1. 二者差值 `< 1e-12`。

### TC-FQ-08 waitForCallLog 等待优化
- 目的：验证等待策略已缩短或改为事务直出。
- 步骤：
1. 执行模板测试路径并测量每 step 的 callLog 等待时间。
2. 查看日志是否存在超时时的明确 warn。
- 期望：
1. 等待时间符合 `<= 1s/step`（或事务直出无轮询等待）。
2. 失败路径有明确日志，不静默吞掉。

### TC-FQ-09 Lighthouse A11y 分数
- 目的：验证可访问性达到目标。
- 步骤：
1. 对 `dashboard` / `usage` / `settings` 任选其一跑 Lighthouse（desktop）。
- 期望：
1. A11y 分数 `>= 98`。

### TC-FQ-10 error.tsx 中文文案
- 目的：验证错误页已接入翻译。
- 步骤：
1. 切换 `zh-CN`。
2. 触发 console 路由错误页。
- 期望：
1. 标题、说明、按钮文案为中文。

### TC-FQ-11 admin/models `Free` / `Degraded` 本地化
- 目的：验证硬编码状态文案已移除。
- 步骤：
1. 打开 `admin/models`。
2. 切换到 `zh-CN` 并观察价格与状态文本。
- 期望：
1. `Free` / `Degraded` 显示为中文翻译。

### TC-FQ-12 notification-center 相对时间本地化
- 目的：验证通知时间文案按语言显示。
- 步骤：
1. 打开通知中心。
2. 在 `zh-CN` 观察时间文案（如“5 分钟前”）。
- 期望：
1. 相对时间为中文本地化格式。

### TC-FQ-13 `admin/operations` 色值硬编码检查
- 目的：验证 DS Critical 文件 1 通过色值规则。
- 步骤：
1. 对 `src/app/(console)/admin/operations/page.tsx` 执行 grep：
   `grep -cE '#[0-9a-fA-F]{6}|rgba?\\(' <file>`
- 期望：
1. 结果为 `0`。

### TC-FQ-14 `dashboard` 色值硬编码检查
- 目的：验证 DS Critical 文件 2 通过色值规则。
- 步骤：
1. 对 `src/app/(console)/dashboard/page.tsx` 执行同样 grep。
- 期望：
1. 结果为 `0`。

### TC-FQ-15 `admin/logs` 色值硬编码检查
- 目的：验证 DS Critical 文件 3 通过色值规则。
- 步骤：
1. 对 `src/app/(console)/admin/logs/page.tsx` 执行同样 grep。
- 期望：
1. 结果为 `0`。

### TC-FQ-16 非 DS 颜色类违规检查（3 文件）
- 目的：验证非 DS Tailwind 颜色类已清理。
- 步骤：
1. 对上述 3 文件执行：
   `grep -cE 'text-(slate|indigo|rose|emerald|violet|amber)-|bg-(slate|indigo|rose|emerald|violet|amber)-' <file>`
- 期望：
1. 每个文件结果均为 `0`。

### TC-FQ-17 DS 视觉回归
- 目的：确保 token 替换后视觉无肉眼明显偏差。
- 步骤：
1. 打开 `admin/operations`、`dashboard`、`admin/logs`。
2. 对照改造前截图或基线表现进行视觉比对。
- 期望：
1. 无明显视觉回归（信息层级、颜色语义、可读性保持）。

### TC-FQ-18 构建与回归命令
- 目的：验证整体工程稳定性。
- 步骤：
1. `npm run build`
2. `npx tsc --noEmit`
3. `npx vitest run`
- 期望：
1. 三项全部通过。

### TC-FQ-19 signoff 产出校验
- 目的：确保全 PASS 后签收文件落盘。
- 步骤：
1. 若 TC-FQ-01 ~ TC-FQ-18 全通过，创建 signoff：
   `docs/test-reports/BL-FE-QUALITY-signoff-2026-04-18.md`
2. 更新 `progress.json` 的 `docs.signoff` 指向该文件。
- 期望：
1. signoff 文件存在且内容完整。
2. `docs.signoff` 非空。

## 证据采集要求（执行时）

1. 命令行证据：`build`、`tsc`、`vitest`、grep 结果。
2. 接口证据：`admin/templates PATCH` 非法 JSON 返回体。
3. 性能/网络证据：通知轮询隐藏后停止、恢复后重启。
4. A11y 证据：Lighthouse 报告（A11y 分数页）。
5. i18n 证据：error 页面中文、models 中文状态、notification-center 中文相对时间。
6. 视觉证据：3 个 DS Critical 页面对照截图。

## 执行输出（执行时）

1. 首轮验收报告（建议）：
`docs/test-reports/bl-fe-quality-verifying-local-2026-04-18.md`
2. 复验报告（如有）：
`docs/test-reports/bl-fe-quality-reverifying-local-2026-04-18-roundN.md`
3. 最终签收：
`docs/test-reports/BL-FE-QUALITY-signoff-2026-04-18.md`

## 备注

1. 当前仅完成用例准备，未执行任何测试命令。
2. 收到你“开始测试”指令后，将按本用例逐项执行并附证据。

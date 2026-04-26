# BL-FE-QUALITY 首轮验收报告（FAIL）

- 批次：BL-FE-QUALITY
- 验收功能：F-FQ-05 全量验收（19 项）
- 执行者：Codex / Reviewer / evaluator
- 环境：本地 L1 `http://localhost:3099`，测试库 `aigc_gateway_test`
- Git HEAD：`a157991`
- 日期：2026-04-26
- 结论：FAIL，不得 signoff，不得置 `done`

## 执行概述

已执行首轮验收的质量门禁、静态审查、L1 API 验证和代表性页面运行时验证。`build`、`tsc`、`vitest` 通过，但 F-FQ-05 的 Lighthouse A11y 与 DS Critical 静态要求未达标，阻断签收。

## 通过项

- `npm run build`：PASS。日志：`docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex/build.local.log`
- `npx tsc --noEmit`：PASS。日志：`docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex/tsc.local.log`
- `npx vitest run`：PASS，60 files / 414 tests。日志：`docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex/vitest.local.log`
- PATCH invalid JSON：PASS，本地 `PATCH /api/admin/templates/nonexistent-template-id` 使用非法 JSON 返回 `HTTP/1.1 400 Bad Request`，code=`invalid_parameter`。证据：`docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex/template-patch-invalid-json.local.http`
- 无 `window.location.reload` / `location.reload` 静态命中。证据：`docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex/static-checks.log`
- NotificationCenter 存在 `document.hidden` 与 `visibilitychange` 轮询门控。证据：`docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex/static-checks.log`
- admin/usage 与 admin/models 已使用单个 `useAsyncData` + `Promise.all` 聚合。证据：`docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex/static-checks.log`
- 代表性页面可打开且无浏览器 console error：dashboard / admin/operations / admin/logs。截图：`dashboard.local.png`、`admin-operations.local.png`、`admin-logs.local.png`

## 失败项

### F-FQ-05-09：Lighthouse A11y ≥ 98 未通过

- 实际：Dashboard snapshot Lighthouse Accessibility = 96
- 预期：≥ 98
- 证据：`docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex/lighthouse-dashboard/report.json`
- 失败明细：`docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex/lighthouse-dashboard-failures.txt`
- 具体失败：顶部用户头像 `AD` 前景 `#ffffff` / 背景 `#d2cdf2` 对比度 1.52，低于 4.5；同一用户菜单按钮 `aria-label="用户菜单"` 未包含可见文本 `AD`，触发 label-content-name-mismatch。

### F-FQ-05-14：非 DS Tailwind 色类 grep 必须为 0 未通过

静态检查命中以下非设计系统 Tailwind 色类：

- `src/app/(console)/admin/logs/page.tsx:181`：`divide-slate-50`
- `src/app/(console)/admin/logs/page.tsx:315`：`divide-slate-50`
- `src/app/(console)/admin/operations/page.tsx:203`：`bg-blue-50 text-blue-600`
- `src/app/(console)/admin/operations/page.tsx:305`：`border-slate-100/60`
- `src/app/(console)/admin/operations/page.tsx:531`：`text-blue-700 bg-blue-50`
- `src/app/(console)/admin/operations/page.tsx:589`：`text-blue-700 bg-blue-50`
- `src/app/(console)/admin/operations/page.tsx:1186`：`bg-teal-50 text-teal-600`

证据：`docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex/static-checks.log`

## 未签收项

- F-FQ-05-19：未生成 signoff。原因：存在阻断失败项，按 AGENTS.md/signoff 硬性要求不得置 `done`。
- 视觉回归只采集当前页截图，未做“改造前/后”成对对比。原因：DS 静态要求已失败，当前轮无需继续签收级视觉判定。

## 风险项

- `scripts/test/codex-setup.sh` 首次按默认方式启动失败：缺少 `ADMIN_SEED_PASSWORD`；第二次补齐 seed 密码后 standalone 又缺少 `IMAGE_PROXY_SECRET`/`AUTH_SECRET`。第三次临时注入测试变量后服务就绪。失败与重试日志均保存在 artifacts。
- 本地 3099 启动后后台 reconciliation 因本地 provider key 未配置输出错误日志；本轮未执行真实 provider 调用，不影响已执行的前端质量验收结论。

## 修复要求

1. 修复顶部用户菜单头像的对比度问题，并让 accessible name 包含可见文本 `AD` 或移除可见文本与 aria-label 的不一致。
2. 清除 `admin/operations` 与 `admin/logs` 中所有非 DS Tailwind 色类，确保 F-FQ-05-14 grep 结果为 0。
3. 修复后重新进入 `reverifying`，由 Codex 复跑 F-FQ-05 阻断项与回归门禁。

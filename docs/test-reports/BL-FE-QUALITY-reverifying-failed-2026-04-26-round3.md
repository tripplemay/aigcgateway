# BL-FE-QUALITY 复验报告（reverifying / FAIL / round3）

- 批次：`BL-FE-QUALITY`
- 功能：`F-FQ-05`（19 项全量验收）
- 执行者：Codex / Reviewer
- 环境：L1 本地 `http://localhost:3099`
- 日期：2026-04-26
- 结论：**FAIL**（回退 `fixing`）

## 通过项

1. `npm run build`：PASS（见 `build.local.log`）
2. `npx tsc --noEmit`：PASS
3. `npx vitest run`：PASS，`60 files / 414 tests`
4. DS 静态检查：PASS
- 3 文件 hex/rgb 命中均为 `0`
- 3 文件非 DS Tailwind 色类命中均为 `0`
5. 代码静态检查：PASS
- 未命中 `window.location.reload` / `location.reload`
- `notification-center` 包含 `document.hidden` + `visibilitychange` 轮询门控
- `admin/usage` 与 `admin/models` 命中 `Promise.all` 聚合

## 失败项（阻断）

1. **F-FQ-05-09 Lighthouse A11y 未达标**
- CLI Lighthouse 分数 `92`，且目标 URL 为 `/zh/login`（非 dashboard 验收页面）
- 已登录浏览器 snapshot Lighthouse A11y 分数 `91`（仍低于 `>=98`）

2. **F-FQ-05-06 PATCH invalid JSON 未通过**
- `PATCH /api/admin/templates/nonexistent-template-id` 当前返回 **404 HTML**（非预期 `400 invalid_parameter`）
- 说明该验收路径在当前运行环境下失效

3. **运行时阻断：前端 chunk 加载错误**
- `/zh/dashboard`、`/zh/admin/models`、`/zh/error-test` 出现 `Application error: a client-side exception has occurred`
- Console 出现 `ChunkLoadError` 与 React `#423`
- Network 命中关键 chunk 404：`/_next/static/chunks/app/layout-469674eabe881b93.js`

4. **F-FQ-05-10/11/12 动态 i18n 验收被阻断**
- 因页面运行时异常，无法稳定完成 error 页面中文文案、models Free/Degraded 中文、notification 相对时间中文的动态通过判定

## 证据目录

- `docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex-reverify/build.local.log`
- `docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex-reverify/tsc.local.log`
- `docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex-reverify/vitest.local.log`
- `docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex-reverify/static-checks.log`
- `docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex-reverify/template-patch-invalid-json.local.http`
- `docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex-reverify/lighthouse-dashboard-score.json`
- `docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex-reverify/lighthouse-dashboard-failures.json`
- `docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex-reverify/runtime-errors.txt`
- `docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex-reverify/dashboard-zh.png`
- `docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex-reverify/admin-models-zh.png`
- `docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex-reverify/error-test-zh.png`

## 修复建议（交 Generator）

1. 修复 `_next/static/chunks/app/layout-*.js` 404 与 `ChunkLoadError`（优先级 P0）
2. 恢复 `/api/admin/templates/[templateId]` 路径可达并确认非法 JSON 返回 `400 invalid_parameter`
3. 修复 dashboard 可访问性分数至 `>=98`
4. 页面恢复稳定后，重新执行 F-FQ-05 动态 i18n 验收（10/11/12）

# BL-FE-QUALITY 复验报告（reverifying / FAIL / round4）

- 批次：`BL-FE-QUALITY`
- 功能：`F-FQ-05`（全量 19 项）
- 执行者：Codex / Reviewer
- 环境：L1 本地 `http://localhost:3099`（按 `codex-setup.sh` 重建）
- 日期：2026-04-26
- 结论：**FAIL**（继续 `fixing`）

## 本轮已通过

1. `npm run build`：PASS
2. `npx tsc --noEmit`：PASS
3. `npx vitest run`：PASS（`60 files / 414 tests`）
4. DS 静态检查：PASS
- 3 文件 hex/rgb 命中均为 `0`
- 3 文件非 DS Tailwind 色类命中均为 `0`
5. PATCH 非法 JSON：PASS
- 鉴权后 `PATCH /api/admin/templates/nonexistent-template-id` 返回 `400 invalid_parameter`

## 本轮阻断失败

1. **路由层阻断：`/zh/dashboard` 命中 404**
- `curl -si http://localhost:3099/zh/dashboard` 返回 `HTTP/1.1 404 Not Found`
- 响应 RSC `initialTree` 指向 `/_not-found`

2. **静态资源加载阻断：`_next` 多资源 400/404**
- `/_next/static/chunks/*.js` 出现多个 `400`
- `/_next/static/chunks/app/layout-469674eabe881b93.js` 返回 `404`
- `/_next/static/css/7b58c13ea0bbc767.css` 返回 `404`
- 导致 dashboard/error-test/admin/models 页面白屏（截图为纯空白）

3. **A11y 目标无法达成**
- `npx lighthouse http://localhost:3099/zh/dashboard` 得分 `0`
- 由于页面已是 404 + 资源加载失败，不具备可用验收前提

4. **TC10/11/12 动态 i18n 验收被阻断**
- 页面白屏导致无法验证：
  - `error.tsx` 中文文案
  - `admin/models` Free/Degraded 中文
  - notification 相对时间中文

## 证据

- `docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex-reverify-round4/build.local.log`
- `docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex-reverify-round4/tsc.local.log`
- `docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex-reverify-round4/vitest.local.log`
- `docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex-reverify-round4/static-checks.log`
- `docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex-reverify-round4/template-patch-invalid-json.local.http`
- `docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex-reverify-round4/network-failures.json`
- `docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex-reverify-round4/lighthouse.zh-dashboard.json`
- `docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex-reverify-round4/dashboard.zh.png`
- `docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex-reverify-round4/error-test.zh.png`
- `docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex-reverify-round4/admin-models.zh.png`

## 回传 Generator 的修复焦点

1. 修复 locale 路由解析：`/zh/dashboard` 不应落到 `_not-found`
2. 修复 `_next/static/*` 返回 400/404 的链路（middleware matcher / i18n rewrite / asset bypass）
3. 页面恢复可用后，重跑 A11y（`>=98`）与 TC10/11/12 动态 i18n

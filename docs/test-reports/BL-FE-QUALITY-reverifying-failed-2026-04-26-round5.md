# BL-FE-QUALITY 复验报告（reverifying / FAIL / round5）

- 批次：`BL-FE-QUALITY`
- 功能：`F-FQ-05`（全量 19 项）
- 执行者：Codex / Reviewer
- 环境：L1 本地 `http://localhost:3099`
- 日期：2026-04-26
- 复验口径：**按 generator push-back 执行无前缀路径**（`/dashboard`、`/error-test`、`/admin/models`）
- 结论：**FAIL（回退 fixing）**

## 本轮通过

1. `npx tsc --noEmit`：PASS
2. `npx vitest run`：PASS（`60 files / 414 tests`）
3. PATCH invalid JSON（鉴权）：PASS
- `PATCH /api/admin/templates/nonexistent-template-id` 返回 `400 invalid_parameter`

## 本轮失败（阻断）

1. **无前缀路径动态验收仍失败**（已按 push-back 方法执行）
- 动态脚本落地在无前缀 URL：`/dashboard`、`/error-test`、`/admin/models`
- 结果：页面均无法正常渲染，截图为空白
- 因此 TC10/TC11/TC12 均 FAIL

2. **静态资源链路异常（关键根因）**
- `_next/static` 资源大量 `400/404`
- 关键缺失：`/_next/static/chunks/app/layout-469674eabe881b93.js` 返回 `404`
- 导致前端无法完成首屏渲染（Lighthouse 提示 `NO_FCP`）

3. **A11y 无法达成**
- `lighthouse /dashboard` 分数 `0`
- 原因不是业务可访问性细节，而是页面未完成可见内容渲染

## 对 push-back 的验证结论

- 本轮已严格采用 generator 建议的无前缀 URL 复验，失败依旧。
- 因此 round3/round4 的失败并非“仅验收方法学问题”，当前存在真实运行时阻断（静态资源返回异常）。

## 证据

- `docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex-reverify-round5/summary.json`
- `docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex-reverify-round5/dynamic-evidence.json`
- `docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex-reverify-round5/dynamic-check.log`
- `docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex-reverify-round5/template-patch-invalid-json.local.http`
- `docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex-reverify-round5/lighthouse-dashboard-auth.json`
- `docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex-reverify-round5/dashboard.zhCN.png`
- `docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex-reverify-round5/error-test.zhCN.png`
- `docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex-reverify-round5/admin-models.zhCN.png`

## 回传 Generator 的修复焦点

1. 修复 `/_next/static/*` 资源 400/404（特别是 app layout chunk 丢失）
2. 修复后先证明页面可稳定渲染（`/dashboard` 非白屏、`NO_FCP` 消失）
3. 再重跑 A11y 与 TC10/11/12 动态 i18n 验收

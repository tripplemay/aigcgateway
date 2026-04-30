# M1b Alias Automation + Admin UI Verifying Report (2026-04-10)

## Scope
- Batch: `M1b-alias-automation-admin-ui`
- Feature: `F-M1b-06`
- Env: L1 local (`http://localhost:3099`)
- Script: `scripts/test/_archive_2026Q1Q2/m1b-alias-admin-verifying-e2e-2026-04-10.ts`

## Result
- Pass: `5`
- Fail: `3`
- Evidence JSON: `docs/test-reports/m1b-alias-admin-verifying-e2e-2026-04-10.json`

## Passed
1. Sync 触发后 `lastSyncAt` 前进。
2. LLM 分类自动创建别名并挂载模型。
3. Brand 推断持久化成功（DeepSeek）。
4. Admin 别名管理页存在。
5. 白名单页/能力页删除，侧边栏入口已清理。

## Failed
1. 设计稿一致性 FAIL（F-M1b-03）
- 证据：设计稿存在 `Supported Sizes` 区块，但实现缺失。
- 设计稿位置：`design-draft/admin-model-aliases/code.html:311`、`design-draft/admin-model-aliases/code.html:314`
- 影响：与“布局与设计稿一致”验收不符。

2. DS Token / 颜色规范 FAIL（F-M1b-03）
- 证据（实现存在硬编码色系类）：
  - `src/app/(console)/admin/model-aliases/page.tsx:648` (`bg-green-100 text-green-700`)
  - `src/app/(console)/admin/model-aliases/page.tsx:734` (`hover:bg-slate-50`)
  - `src/app/(console)/admin/model-aliases/page.tsx:492` (`text-slate-400`)
  - `src/app/(console)/admin/model-aliases/page.tsx:484`、`:606` (`bg-slate-200`)
- 影响：与“DS token 一致，零硬编码颜色”不符。

3. i18n 残留 FAIL（F-M1b-05）
- 证据（实现存在硬编码文案）：
  - `src/app/(console)/admin/model-aliases/page.tsx:62` `Function Calling`
  - `src/app/(console)/admin/model-aliases/page.tsx:63` `Streaming`
  - `src/app/(console)/admin/model-aliases/page.tsx:65` `System Prompt`
  - `src/app/(console)/admin/model-aliases/page.tsx:66` `JSON Mode`
  - `src/app/(console)/admin/model-aliases/page.tsx:67` `Image Input`
  - `src/app/(console)/admin/model-aliases/page.tsx:284` `e.g. gpt-4o`
  - `src/app/(console)/admin/model-aliases/page.tsx:295` `e.g. OpenAI`
- 影响：与“i18n 无残留”不符。

## Conclusion
本轮 `verifying` 结论：`M1b` 未通过，需进入 `fixing`。
建议 Generator 优先修复 `F-M1b-03` 与 `F-M1b-05`，修复后进入 `reverifying`。

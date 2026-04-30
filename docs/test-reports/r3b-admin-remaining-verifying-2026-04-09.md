# R3B Admin Remaining Verifying Report (2026-04-09)

## 测试目标

- 执行 `F-R3B-08`（executor: codex）首轮验收。
- 覆盖 6 个 Admin 页面：Health / Logs / Usage / Users / UserDetail / Templates。
- 验证 useAsyncData 迁移、核心 CRUD、i18n 与设计稿关键对齐点。

## 测试环境

- L1 Local: `http://localhost:3099`
- 启动方式：
  - `bash scripts/test/codex-setup.sh`（PTY 前台）
  - `bash scripts/test/codex-wait.sh`
- 执行脚本：
  - `source scripts/test/codex-env.sh`
  - `npx tsx scripts/test/_archive_2026Q1Q2/r3b-admin-remaining-verifying-e2e-2026-04-09.ts`

## 结果概览

- 结论：**FAIL（进入 fixing）**
- 自动化步骤：6
- 通过：5
- 失败：1
- 证据：`docs/test-reports/r3b-admin-remaining-verifying-e2e-2026-04-09.json`

## 通过项

1. Smoke 可用：`/api/v1/models` 返回 200。
2. 6 个 admin 页面可加载（admin auth）：`/admin/health`、`/admin/logs`、`/admin/usage`、`/admin/users`、`/admin/users/[id]`、`/admin/templates`。
3. 6 个目标页面均使用 `useAsyncData`，且未回退到 `useEffect/useCallback` 拉取模式。
4. 核心 API/CRUD 可执行：health/logs/usage/users/templates 接口 200；manual recharge 201；template toggle 200；template delete 200。
5. 设计稿关键元素 spot check 通过（health/logs/usage/users/templates）。

## 失败项

1. i18n 验收失败（AC4）
   - `src/app/(console)/admin/templates/page.tsx`：删除确认文案硬编码英文 `Delete template "...?"`。
   - `src/app/(console)/admin/usage/page.tsx`：周期按钮存在硬编码英文 `today`（`["today", "7d", "30d"]`）。
   - 影响：不满足 `F-R3B-07` “所有用户可见文本无硬编码英文、切换中文无英文残留”。

## 风险

- 若不修复上述两处，中文界面仍会出现英文残留，影响 R3B 语言一致性签收。

## 状态机回写

- `progress.json.status` 已置为 `fixing`。
- 以下 feature 已回退为 `pending`：
  - `F-R3B-03`（Admin Usage 页面还原）
  - `F-R3B-06`（Admin Templates 页面还原）
  - `F-R3B-07`（i18n 补全）
  - `F-R3B-08`（R3B 视觉回归验收，待复验）


# R4 Design Restoration Verifying Report (2026-04-09)

## 测试目标

- 执行 `F-R4-08`（executor: codex）首轮验收。
- 覆盖 7 个目标页面：whitelist / aliases / capabilities / user-detail / admin-templates / mcp-setup / login-register 左侧统一。
- 检查页面可用性、设计结构、DS token 与 i18n。

## 测试环境

- L1 Local：`http://localhost:3099`
- 启动：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- 执行脚本：`npx tsx scripts/test/_archive_2026Q1Q2/r4-design-restoration-verifying-e2e-2026-04-09.ts`

## 结果概览

- 结论：**FAIL（进入 fixing）**
- 自动化步骤：5
- 通过：3
- 失败：2
- 证据：`docs/test-reports/r4-design-restoration-verifying-e2e-2026-04-09.json`

## 通过项

1. Smoke：`/api/v1/models` 返回 200。
2. 目标页面全部可加载（`/login`、`/register`、`/admin/model-whitelist`、`/admin/model-aliases`、`/admin/model-capabilities`、`/admin/templates`、`/mcp-setup`）。
3. 结构还原 spot check 通过：whitelist 9 列关键字段、aliases 3 列卡片、capabilities 12 栅格、user-detail balance-history+danger-zone、templates 3 列卡片、mcp bento、login/register 共享左侧组件。

## 失败项

1. DS token / 颜色规范失败（AC3）
   - 审计结果：`legacy=0`，但 `hardcodedColor=35`。
   - 典型证据：
     - [auth-terminal.tsx](/Users/yixingzhou/project/aigcgateway/src/components/auth-terminal.tsx:128) 使用 `bg-[#13141C]` 等十六进制色值
     - [page.tsx](/Users/yixingzhou/project/aigcgateway/src/app/(console)/mcp-setup/page.tsx:415) 使用 `bg-slate-950` / `text-indigo-100`
     - [page.tsx](/Users/yixingzhou/project/aigcgateway/src/app/(console)/admin/templates/page.tsx:146) 使用 `text-slate-500` 等
     - [page.tsx](/Users/yixingzhou/project/aigcgateway/src/app/(console)/admin/model-whitelist/page.tsx:523) 使用 `bg-emerald-100/bg-amber-100/bg-red-100`

2. i18n 审计失败（AC4）
   - 审计结果：`hardcoded=auth-terminal.stream-line|auth-terminal.command|mcp.tool-desc`
   - 典型证据：
     - [auth-terminal.tsx](/Users/yixingzhou/project/aigcgateway/src/components/auth-terminal.tsx:12) 终端响应文案硬编码英文
     - [auth-terminal.tsx](/Users/yixingzhou/project/aigcgateway/src/components/auth-terminal.tsx:14) 命令行硬编码英文
     - [page.tsx](/Users/yixingzhou/project/aigcgateway/src/app/(console)/mcp-setup/page.tsx:314) tool desc 列表硬编码英文描述

## 状态机回写

- `progress.json.status` 已置为 `fixing`
- 已回退 `pending`：
  - `F-R4-01`（Whitelist）
  - `F-R4-05`（Admin Templates）
  - `F-R4-06`（MCP Setup）
  - `F-R4-07`（Register/Login 左侧统一）
  - `F-R4-08`（R4 全量验收）


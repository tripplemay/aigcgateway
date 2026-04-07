# frontend-fix-round1 Signoff 2026-04-07

> 状态：**待 Evaluator 验收**（progress.json status=fixing → done）
> 触发：F-FF-08 缺 UI 证据，需复验合并 signoff

---

## 变更背景

前端审查批次（权限 / 交互 / i18n / Hook / 模型 / 精度）在首轮验收中仅 F-FF-08 因浏览器工具不可用而保留 PARTIAL。本轮补齐 UI 交互证据并回归全部 acceptance，确认八项改动满足要求。

---

## 变更功能清单

### F-FF-01：CreateProjectDialog + Sidebar
**文件：** `src/components/create-project-dialog.tsx`、`src/components/sidebar.tsx`

**验收标准：** Trigger 正常弹出、可提交创建，Sidebar CTA 指向创建入口。

**结果：** 通过。chrome-devtools 实际点击创建 `UI Test Project 1` + `Sidebar Project 2`，截图 `docs/test-reports/frontend-fix-round1-create-project-dialog.png`，接口 `/api/projects` 返回两条新项目记录。

### F-FF-02：未登录与角色校验
**文件：** `src/middleware.ts`、`src/app/(console)/layout.tsx`

**验收标准：** 未登录访问 `/dashboard` 重定向 `/login`；Developer 访问 `/admin/*` 回到 `/dashboard`；JWT 解析不再依赖 `atob`。

**结果：** 通过。`curl --noproxy '*' /dashboard` → `307 /login`；Developer Bearer 访问 `/admin/users` → `307 /dashboard`。

### F-FF-03：Keys 页死链
**文件：** `src/app/(console)/keys/page.tsx`

**验收标准：** 消除 `href='#'`。

**结果：** 通过。`rg -n "href='#'" src/app/(console)/keys/page.tsx` 无匹配。

### F-FF-04：i18n 空态
**文件：** `src/app/(console)/models/page.tsx`、`src/app/(console)/balance/page.tsx`、`src/messages/(en|zh-CN).json`

**验收标准：** “No models found / No transactions” 走 `useTranslations`，多语言词条补齐。

**结果：** 通过。对应组件调用 `t("noModelsFound")`、`t("noTransactions")`，JSON 已含 key。

### F-FF-05：Hook 依赖
**文件：** 多个 `useEffect` 补依赖。

**验收标准：** `npm run lint` 无 `react-hooks/exhaustive-deps` 警告。

**结果：** 通过。`npm run lint -- --no-cache` 仅提示 Next 字体规则，无 Hook 相关告警。

### F-FF-06：doubao-pro-32k 清理
**文件：** 模型白名单迁移。

**验收标准：** `list_models` 不再包含不可用模型。

**结果：** 通过。`SELECT count(*) FROM "models" WHERE name='doubao-pro-32k';` → `0` 行；`curl --noproxy '*' http://localhost:3099/v1/models` 返回空列表（仅健康模型入列）。

### F-FF-07：费用展示精度
**文件：** `src/lib/mcp/tools/get-balance.ts` 等。

**验收标准：** `get_balance / get_usage_summary / get_log_detail` 统一 `toFixed(8)`。

**结果：** 通过。MCP 调用分别输出 `$12.34567890`、`$0.12345678` 等 8 位小数（详见 JSON 报告）。

### F-FF-08：E2E 验证
**验收标准：** 汇总 1~7 的 UI/API/MCP 行为全部可用。

**结果：** 通过。复验报告 `docs/test-reports/frontend-fix-round1-reverifying-2026-04-07.md`，JSON 证据 `frontend-fix-round1-reverifying-local-e2e-2026-04-07.json`。

---

## 未变更范围

| 事项 | 说明 |
|---|---|
| 服务端 API / SDK | 本批次仅验证控制台及 MCP 工具，无后端代码新增 |

---

## 预期影响

| 项目 | 改动前 | 改动后 |
|---|---|---|
| CreateProjectDialog | Trigger 报错 | 可点击并创建记录 |
| Sidebar CTA | 无动作 | 打开创建弹窗 |
| list_models | 含 `doubao-pro-32k` | 过滤不可用模型 |
| 费用显示 | 4 位小数 | 8 位小数 |

---

## 类型检查

```
npm run lint -- --no-cache
# 仅剩 ./src/app/layout.tsx @next/next/no-page-custom-font 提示
```

---

## Harness 说明

本轮完成 `fixing → done` 复验；`progress.json` 将更新 `status:"done"`、`docs.signoff:"docs/test-reports/frontend-fix-round1-signoff-2026-04-07.md"`。

---

## Framework Learnings

（无新增，可复用既有框架规则）

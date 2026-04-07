# project-switcher-ui Signoff 2026-04-07

> 状态：**完成 Verifying**（progress.json status=verifying → done）
> 触发：用户反馈“创建项目后不会自动切换 + Sidebar 缺少项目下拉”批次交付完毕，Codex 首轮验收全 PASS。

---

## 变更背景
- Console 侧缺少项目切换入口，导致多项目用户无法快速查看 Keys / Actions / Dashboard。
- `useProject` hook 无共享 Context，创建新项目后各页面状态不同步，余额数值也需要手动刷新。
- 此批（F-PS-01~06）聚焦于将项目列表提升至 Sidebar 下拉、改造 Context Provider，并确保 CreateProjectDialog 与刷新流程互通。

---

## 变更功能清单

### F-PS-01：useProject 改为 Context Provider
**实现范围：** `src/hooks/use-project.tsx`、`src/app/(console)/layout.tsx`

**要点：**
- 新增 `ProjectProvider` 暴露 `projects/current/loading/select/refresh`，并包裹 console layout。
- 初始化时读取 `/api/projects` + `localStorage.projectId`，若当前项目被删除则自动兜底为最新项目。

**验收标准：** 初始化 & 切换后所有依赖 `useProject()` 的组件保持一致。

### F-PS-02：Sidebar 项目下拉
**实现范围：** `src/components/sidebar.tsx`, i18n 文案

**要点：**
- 在 Sidebar 顶部加入项目下拉、当前项目高亮，点击选项走 `ProjectProvider.select()`。
- `CreateProjectDialog` CTA 仍位于 Sidebar，复用 Provider 的刷新函数。

**验收标准：** 切换后 Dashboard/Keys/Actions 等页面数据即时更新、视觉状态与设计稿一致。

### F-PS-03：创建项目后自动切换
**实现范围：** `src/components/create-project-dialog.tsx`

**要点：**
- CreateProjectDialog 接收 `onCreated`，Sidebar/EmptyState 触发时调用 Provider.refresh() 并 auto-select 最新项目。
- Dashboard 空态先引导创建，第一个项目落地后自动进入实时卡片。

### F-PS-04：Layout 余额展示联动 Provider
**实现范围：** `src/components/sidebar.tsx` 钱包卡片

**要点：**
- 钱包余额从 `current.balance` 读取，不再独立调 API；切换项目后跟随更新。

### F-PS-05：i18n 补全
**实现范围：** `src/messages/en.json` / `zh-CN.json`

**要点：**
- 新增 Sidebar dropdown / CreateProjectDialog / EmptyState 相关文案。

### F-PS-06：E2E 验证（executor: codex）
**实现范围：** `docs/test-cases/project-switcher-ui-local-test-cases-2026-04-07.md`、`tests/e2e/project-switcher.spec.ts`

**验收标准：**
1. 创建项目后自动切换到最新项目并展示空态 → 非空状态。
2. Sidebar 下拉切换影响 Dashboard/Keys/Actions/余额。
3. 刷新页面后保持最后一次选中的项目。

---

## 未变更范围
| 事项 | 说明 |
| --- | --- |
| 后端 `/api/projects` schema | 仅使用现有接口；余额数值仍由后台充值逻辑维护，此批未改写 DB schema |
| Staging/L2 行为 | 本次仅做 L1 本地验收，未连接真实 Provider/充值系统 |

---

## 预期影响
| 项目 | 改动前 | 改动后 |
| --- | --- | --- |
| Sidebar 项目选择 | 无项目列表，需跳转 Keys/Actions 再操作 | 固定在 Sidebar 顶部，下拉可选/创建 |
| 项目创建体验 | 新建后仍在空态，需刷新页面 | 新建即自动刷新列表并选中新项目 |
| 余额显示 | 独立 API，需要手工刷新 | 项目切换时自动同步当前项目余额 |
| 页面持久化 | 刷新后回到默认项目（无记忆） | `localStorage.projectId` 记忆，刷新/重新登录保持项目 |

---

## 类型检查
```
npm run build  # 由 codex-setup.sh 触发：Next.js 14 build + ESLint + tsc 全量通过（仅字体 Warning）
```

---

## Harness 说明
- Codex 执行 `tests/e2e/project-switcher.spec.ts`（WebKit）+ L1 smoke，全部 PASS。
- `docs/test-reports/project-switcher-ui-verification-2026-04-07.md` 记录验证细节，`docs/test-reports/project-switcher-ui-playwright-report.json` 保存自动化日志。
- 本 signoff 文件已写入，`progress.json` 将设置 `status: "done"` 且 `docs.signoff` 指向本路径。

---

## Framework Learnings
- 无新增。

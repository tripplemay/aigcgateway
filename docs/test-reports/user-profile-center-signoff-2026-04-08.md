# user-profile-center Signoff 2026-04-08

> 状态：**Evaluator 已验收**（progress.json status=verifying → done）
> 触发：Sidebar 用户信息 + LoginHistory 后端完成，Codex L1 复验全部通过

---

## 变更背景

批次目标：在控制台 Sidebar 展示当前用户身份，提供跳转个人中心入口，并在 Settings 页新增登录历史安全日志，方便开发者追踪异常登录。实现内容覆盖 Prisma schema、REST API、Sidebar/UI 文案及 E2E 验证。

---

## 变更功能清单

### F-UP-01/02 Sidebar 用户信息 + Settings 入口
**文件：**
- `src/components/sidebar.tsx`
- `src/app/(console)/layout.tsx`

**改动：**
- Sidebar 底部新增用户信息卡片（名称/email 前缀 + 角色徽标），可点击跳转 `/settings`。
- 导航列表新增 Settings 菜单项，Layout 注入 email/name。

**验收：** 通过 UI 自动化（Playwright）及手工 sanity 验证。

### F-UP-03 LoginHistory schema + 登录写入
**文件：**
- `prisma/migrations/20260408020000_add_login_history/migration.sql`
- `src/app/api/auth/login/route.ts`

**改动：**
- 新建 `login_history` 表，记录 userId/ip/userAgent/createdAt。
- 登录成功时 async 写入，并保持兼容。

**验收：** `scripts/test/user-profile-center-e2e-2026-04-08.ts` 校验连续登录写入两条记录。

### F-UP-04/05 Settings 安全日志 + i18n
**文件：**
- `src/app/(console)/settings/page.tsx`
- `src/app/api/auth/login-history/route.ts`
- `src/messages/{en,zh-CN}.json`

**改动：**
- 新增列表展示最近 20 条登录历史（时间/IP/设备）。
- 新增 API GET `/api/auth/login-history`，受 JWT 保护。
- 文案国际化。

**验收：** Playwright 检查列表出现最新 UA；English/中文 Keys 均存在。

### F-UP-06 E2E 验证
**文件：**
- `scripts/test/user-profile-center-e2e-2026-04-08.ts`
- `tests/e2e/user-profile-center.spec.ts`

**改动：** Codex 提供自动化脚本与 UI 测试覆盖登录历史与 Sidebar/Settings。已在 L1 环境运行并产出报告。

---

## 未变更范围

| 事项 | 说明 |
|---|---|
| Admin 控制台其他页面 | 未调整，保持既有布局 |
| 生产环境 | 仅 L1 验证，未触及 L2/生产 |

---

## 预期影响

| 项目 | 改动前 | 改动后 |
|---|---|---|
| 登录审计 | 无历史视图 | `/api/auth/login-history` + Settings UI |
| Sidebar 底部 | 空白 | 显示用户身份 + Settings 入口 |

---

## 类型检查

```
npm run build
# 成功（Next lint 提示 custom font warning，可接受）
```

---

## Harness 说明

Codex 完成复验并写入 `docs/test-reports/user-profile-center-verification-2026-04-08.md`，progress.json 将设为 `done`，`docs.signoff` 指向本文件。

---

## Framework Learnings（可选）

- 登录历史这类审计型数据建议使用 async/non-blocking 写入，避免影响登录延迟；脚本中验证了该模式的可测性，可纳入经验库。

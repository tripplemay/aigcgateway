# balance-user-level-backend Signoff 2026-04-08

> 状态：**Evaluator 已验收**（progress.json status=reverifying → done）
> 触发：Generator 完成 F-BU-01/F-BU-02 migration fix，Codex 复验通过

---

## 变更背景

余额从 Project 级迁移到 User 级涉及 schema、原生 SQL、API、MCP、UI 全链路。上一轮在 L1 环境发现 migration 由于 `deduct_balance` 返回类型改变无法回放，本轮 Generator 已在 `20260408010000_balance_user_level` 中加入显式 `DROP FUNCTION`，确保 setup 流程可一键完成。Codex 需要复验数据库迁移、API 扣费链路和控制台显示。

---

## 变更功能清单

### F-BU-01：User 表新增 balance 字段 + migration
**文件：**
- `prisma/migrations/20260408010000_balance_user_level/migration.sql`

**改动：**
- `users.balance` 新列 + backfill 逻辑。
- 通过 migration 自动迁移旧项目余额。

**验收标准：**
- `bash scripts/test/codex-setup.sh` 可一次性完成 migrate + seed。
- `SELECT balance FROM "users"` 返回用户级余额。

### F-BU-02：deduct_balance / check_balance SQL 函数
**文件：**
- 同 `prisma/migrations/20260408010000_balance_user_level/migration.sql`

**改动：**
- 新增 `DROP FUNCTION ...` 语句后重建函数，支持 user 级扣费。

**验收标准：**
- migration 无错。
- L1 脚本扣费成功，交易记录正确。

### F-BU-03~07：API/MCP/UI 同步用户级余额
**文件：**
- `src/lib/api/post-process.ts`, `src/app/(console)/**`, `src/lib/mcp/tools/**` 等（上一轮已验收，本轮确保回归）。

**验收标准：**
- REST + MCP 均返回 user.balance。
- Admin 充值、Sidebar 展示保持一致。

### F-BU-08：E2E 验证
**文件：**
- `scripts/test/_archive_2026Q1Q2/balance-user-level-e2e-2026-04-08.ts`
- `tests/e2e/balance-user-level-ui.spec.ts`

**验收标准：**
- L1 自动脚本 + Playwright WebKit 用例全绿，产出报告。

---

## 未变更范围

| 事项 | 说明 |
|---|---|
| Provider/Model 适配层 | 本批未触及 provider adapter，仅 mock OpenAI channel for testing |
| L2 / 生产环境 | 仅执行 L1，本轮不涉及实际生产部署 |

---

## 预期影响

| 项目 | 改动前 | 改动后 |
|---|---|---|
| 余额查询主体 | Project.balance | User.balance（所有项目共享） |
| Migration 可重复性 | 需手工 DROP | `prisma migrate deploy` 自动 drop/create |

---

## 类型检查

```
npm run build
# 成功（仅 next lint 提示 custom font warning，可接受）
```

---

## Harness 说明

本批改动已完成 Codex 复验。`progress.json` 将设为 `status: "done"`，`docs.signoff` 指向本文件。

---

## Framework Learnings（可选）

- `CREATE OR REPLACE FUNCTION` 无法更改返回类型；在 migration 中显式 `DROP FUNCTION ...` 再 `CREATE FUNCTION ...` 可避免部署失败。

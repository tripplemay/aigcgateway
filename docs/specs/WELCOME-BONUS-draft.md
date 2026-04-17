# WELCOME-BONUS 功能草案

**规模：** 2-3 个 generator features（可合并到其他批次）
**状态：** 草案，等 TEMPLATE-TESTING 签收后安排

## 需求

新用户注册后自动赠送一定金额到余额，作为注册激励。

| 决策 | 结论 |
|------|------|
| 金额 | SystemConfig 可配（`WELCOME_BONUS_USD`，默认如 $1.00） |
| 条件 | 无条件赠送，管理员可关闭（金额设 0 = 不送） |
| 记录 | 新增 `BONUS` 交易类型，和 RECHARGE/DEDUCTION/REFUND 区分 |

## 改动范围

| 层 | 改动 |
|----|------|
| **Schema** | TransactionType enum 新增 `BONUS`（migration） |
| **注册流程** | `src/app/api/auth/register/route.ts` 注册事务中读取 SystemConfig `WELCOME_BONUS_USD`，> 0 时写入 transactions(type=BONUS) + 更新 user.balance |
| **管理端** | admin/operations 的 SystemConfig 区域增加 `WELCOME_BONUS_USD` 编辑项（或直接在现有 SystemConfig 管理中支持） |
| **前端** | balance 页面的交易类型样式增加 BONUS 类型的颜色/标签（如绿色 "赠送"） |
| **i18n** | zh-CN: "注册赠送" / en: "Welcome Bonus" |

## Features（草案）

| ID | 标题 | 验收 |
|----|------|------|
| F-WB-01 | Schema + 注册赠送逻辑 | 1) TransactionType enum 新增 BONUS（migration）；2) 注册事务中：读取 SystemConfig WELCOME_BONUS_USD，> 0 时 insert transaction(type=BONUS, amount=X, description="Welcome bonus") + increment user.balance；3) 金额为 0 或 key 不存在时不赠送；4) 赠送在 defaultProject 创建和 notificationPreference seed 之后（事务内）；5) tsc 通过 |
| F-WB-02 | 管理端配置 + 前端 BONUS 类型展示 | 1) admin/operations 或 SystemConfig 管理处可编辑 WELCOME_BONUS_USD；2) balance 页面交易列表对 BONUS 类型显示绿色标签 "赠送"/"Welcome Bonus"；3) get_balance transactions 返回中 type=BONUS 的记录正常展示；4) i18n；5) tsc 通过 |
| F-WB-03 | 验收 | codex 执行：注册新用户后余额 = WELCOME_BONUS_USD；交易列表含 type=BONUS 一条；管理端改金额为 0 后新注册无赠送 |

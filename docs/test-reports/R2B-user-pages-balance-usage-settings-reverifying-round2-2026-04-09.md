# R2B 复验报告（reverifying round2）

- 批次：`R2B-user-pages-balance-usage-settings`
- 阶段：`reverifying`
- 时间：2026-04-09
- 环境：`http://localhost:3099`（L1）
- 复验目标：验证 fix round2 是否修复 `F-R2B-04`，并复评 `F-R2B-06`

## 结论

- 结论：**FAIL（继续 fixing）**
- `F-R2B-04`：FAIL（未修复）
- `F-R2B-06`：FAIL（受阻断项影响）

## 关键证据

1. `/settings` 保存链路仍失效
- 操作：将姓名由 `Admin` 改为 `Admin Round2`，点击 `Save Changes`
- 结果：Network 中未出现 profile 更新请求（无 `POST/PATCH/PUT /api/auth/profile`），仅见拉取请求
- 相关请求：`reqid=521`, `reqid=523`（均为 `GET /api/auth/profile`）
- 刷新后姓名仍为 `Admin`

2. 其余 smoke 验证
- `/balance` 可加载；充值弹窗可提交并跳转新支付页（`out_trade_no=cmnqb6t0z00qv9y0c2a5iug8j`）
- `/usage` 可加载，图表区与排行榜区渲染正常
- EN/CN 切换在导航与页面文案可生效

## 判定

- `F-R2B-04` 验收要求“显示名称可编辑、保存”仍不满足，继续 FAIL。
- `F-R2B-06` 受上述阻断问题影响，继续 FAIL。

## 建议修复方向

- 直接排查 `Save Changes` 的点击处理是否真正调用更新接口。
- 对照网络面板确认请求方法/路径与后端路由一致（建议显式断言调用成功后再 refetch）。

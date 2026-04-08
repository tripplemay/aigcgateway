# R2B 复验报告（reverifying round1）

- 批次：`R2B-user-pages-balance-usage-settings`
- 阶段：`reverifying`
- 时间：2026-04-09
- 环境：`http://localhost:3099`（L1 本地）
- 目标：验证 fixing round1 是否修复 `F-R2B-04`，并复评 `F-R2B-06`

## 复验结论

- 结论：**FAIL（仍需 fixing）**
- `F-R2B-04`：FAIL（未修复）
- `F-R2B-06`：FAIL（受阻断缺陷影响）

## 关键证据

1. `/settings` 个人信息保存仍未生效
- 操作：姓名改为 `Admin Reverifying`，点击“保存更改”
- 结果：Network 中仍未出现 profile 更新请求（无 `POST/PATCH/PUT /api/auth/profile`），仅见 `GET /api/auth/profile`
- 刷新页面后姓名回退为 `Admin`
- 相关请求：`reqid=390/392`（均为 `GET /api/auth/profile`）

2. 其他页面 smoke
- `/balance`：可加载，充值弹窗可打开并可发起下单，产生新支付跳转页（`out_trade_no=cmnqas0t100qv9y3pj45gbqzl`）
- `/usage`：KPI 与图表区块可渲染
- 控制台无阻断报错，但存在 chart 容器尺寸 warning（非本轮阻断项）

## 判定

- `F-R2B-04` 验收项“显示名称可编辑、保存”未满足，判 FAIL。
- `F-R2B-06` 作为整体验收项受 `F-R2B-04` 阻断，继续判 FAIL。

## 建议修复方向

- 检查 `/settings` “保存更改”按钮事件是否实际调用更新接口。
- 检查调用参数与后端路由路径是否一致，并在成功后刷新 profile 状态。

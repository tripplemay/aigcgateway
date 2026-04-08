# R2B 复验报告（reverifying round5，诊断轮）

- 批次：`R2B-user-pages-balance-usage-settings`
- 阶段：`reverifying`
- 时间：2026-04-09
- 环境：`http://localhost:3099`（L1）
- 本轮目标：验证诊断信号 `toast.info("Saving name: xxx")` 与 PATCH 请求关系

## 关键结论（按你要求明确记录）

1. 是否看到了 `Saving name: xxx` 的 toast？
- **没有看到**（常规点击与强制 requestSubmit 两种路径都未观察到该 toast）

2. 常规点击 `Save Changes`（UI 真实路径）
- 现象：**无 toast，且无 PATCH**
- 证据：请求列表未出现 `PATCH /api/auth/profile`（本轮请求至 `reqid=853`）
- 按诊断规则解释：`无 toast → handler 未被调用（事件路径断裂）`

3. 强制触发 `form.requestSubmit`（脚本路径）
- 现象：**无 toast，但有 PATCH**
- 证据：`reqid=807 PATCH /api/auth/profile [200]`，随后 `GET /api/auth/profile`，刷新后名称持久化为 `Admin ToastCheck`
- 解释：这说明后端更新链路可通，`fetch` 本身并未被环境/网络阻断；问题更接近于“正常 UI 交互未稳定触发提交处理”。

## 诊断判定

- `F-R2B-04`：FAIL（真实用户点击路径下仍不稳定，未满足“可编辑并保存”）
- `F-R2B-06`：FAIL（受 F-R2B-04 阻断）

## 备注

- 本轮已重启测试环境，且在同一会话内完成对比验证（UI 点击 vs requestSubmit）。
- 由于 toast 信号未出现但 requestSubmit 可成功 PATCH，toast 目前不能作为“handler 是否执行”的唯一判据。

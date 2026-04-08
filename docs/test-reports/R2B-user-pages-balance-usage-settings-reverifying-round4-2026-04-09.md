# R2B 复验报告（reverifying round4，含 .next 清缓存）

- 批次：`R2B-user-pages-balance-usage-settings`
- 阶段：`reverifying`
- 时间：2026-04-09
- 环境：`http://localhost:3099`（L1）
- 关键前置：**已执行 `rm -rf .next` 后重启测试环境**

## 结论

- 结论：**FAIL（继续 fixing）**
- `F-R2B-04`：FAIL（未修复）
- `F-R2B-06`：FAIL（受阻断项影响）

## 关键证据

1. `.next` 清缓存已执行
- 命令：`rm -rf .next`
- 随后重新运行：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`

2. `/settings` 保存链路仍失效
- 操作：将姓名由 `Admin` 改为 `Admin FormSubmit`，点击 `Save Changes`（当前实现为 `form onSubmit + submit` 路径）
- 结果：Network 中仍未出现 profile 更新请求（无 `POST/PATCH/PUT /api/auth/profile`）
- 相关请求：`reqid=738`, `reqid=740`（均为 `GET /api/auth/profile`）
- 刷新后姓名仍为 `Admin`

3. 其余 smoke
- 页面加载正常；项目创建成功
- `/settings` 其余区域可渲染

## 判定

- `F-R2B-04` 的“显示名称可编辑、保存”仍不满足，继续 FAIL。
- `F-R2B-06` 受阻断项影响，继续 FAIL。

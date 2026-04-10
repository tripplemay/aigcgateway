# U1 验收报告（verifying）

## 测试目标
- 验证 `U1-admin-user-detail` 的 `F-U1-07`：Admin 用户详情页在 K1 用户级余额模型下，是否正确展示余额、最近活跃、项目信息、交易记录，并支持充值、暂停、删除。

## 测试环境
- L1 本地：`http://localhost:3099`
- 启动方式：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- 执行脚本：`source scripts/test/codex-env.sh && npx tsx scripts/test/u1-admin-user-detail-verifying-e2e-2026-04-10.ts`
- 结果 JSON：[u1-admin-user-detail-verifying-e2e-2026-04-10.json](/Users/yixingzhou/project/aigcgateway/docs/test-reports/u1-admin-user-detail-verifying-e2e-2026-04-10.json)

## 执行结果
- 结论：FAIL（回退 fixing）
- 自动化步骤：5
- 通过：4
- 失败：1

## 通过项
1. 用户详情 API 返回真实 `balance`、`lastActive`、项目列表，交易记录分页可用。
2. 用户详情页可展示余额卡、最近活跃、交易记录分页和管理操作区。
3. 暂停用户后，JWT 登录返回 `403`，现有 API Key 调用被阻断；恢复后登录恢复，重新创建 Key 可正常调用 `/v1/models`。
4. 删除用户后，用户从 Admin 列表消失，且登录返回 `403`。

## 失败项
1. `F-U1-04 / F-U1-07`：项目卡片缺少 Key 数
   - 严重级别：Medium
   - 稳定复现：是
   - 复现步骤：
   1. 执行 `source scripts/test/codex-env.sh && npx tsx scripts/test/u1-admin-user-detail-verifying-e2e-2026-04-10.ts`
   2. 查看 `GET /api/admin/users/:id` 的返回体中 `projects` 数组
   3. 返回项仅含 `id/name/callCount/createdAt`，缺少规格要求的 `keyCount`
   - 实际结果：
   `project detail missing keyCount`
   - 预期结果：
   详情接口与项目卡片应满足规格和设计稿要求，展示“调用数 / Key 数”
   - 证据：
   [route.ts](/Users/yixingzhou/project/aigcgateway/src/app/api/admin/users/[id]/route.ts)
   [page.tsx](/Users/yixingzhou/project/aigcgateway/src/app/(console)/admin/users/[id]/page.tsx)
   [code.html](/Users/yixingzhou/project/aigcgateway/design-draft/admin-user-detail/code.html)

## 风险项
- 当前项目卡片缺少 Key 数，Admin 无法在用户详情页按规格查看每个项目的完整摘要信息。
- 该缺口不是纯展示问题；详情接口本身也未提供 `keyCount`，前端无法自行补齐。

## 最终结论
U1 首轮 `verifying` 不通过，状态应回退至 `fixing`。修复 `GET /api/admin/users/:id` 的项目数据结构，并在用户详情页展示项目 Key 数后，再进入 `reverifying`。

# N1 UI Navigation Polish Reverify (2026-04-10 Round 1)

## 测试目标
- 批次：`N1-ui-navigation-polish`
- 阶段：`reverifying`（fix round 1）
- 目标：复验 N1 首轮阻断问题是否修复，并回归 Sidebar/Docs/Keys/i18n 关键项

## 测试环境
- 环境：L1 本地
- 基址：`http://localhost:3099`
- 提交：`1d9fe5c`
- 执行时间：`2026-04-10 17:34:14 CST`
- 账号：`admin@aigc-gateway.local`

## 测试数据
- 项目：`N1 Reverify n1r_mnspl7za`
- Project ID：`cmnspl7zc00r59ydumaq0ve2o`
- Key：`N1R Key n1r_mnspl7za`

## 覆盖摘要
- 通过：5
- 失败：1
- 阻塞：0

## 复验结果
1. `AC1` Sidebar 分组 + Docs 入口。
结果：PASS。Sidebar 分组在中英文下均正确，Docs 位于开发组，点击可进入 `/docs`。
2. `AC2` Topbar 旧文档链接移除。
结果：PASS。Topbar 不再出现 Documentation/API Reference/Support，仅保留语言切换/通知/头像菜单。
3. `AC3` Keys 页面精简。
结果：PASS。`/keys` 无顶部统计卡，创建按钮位于表格 header 区。
4. `AC4` Settings Project tab 删除项目。
结果：PASS。输入项目名后可删除，跳回 `/dashboard`；API 复核 `GET /api/projects/cmnspl7zc00r59ydumaq0ve2o` 返回 `404`。
5. `AC5` i18n 抽查。
结果：PASS。EN/CN 切换后 Sidebar 分组、Settings tab、Docs/Keys 文案切换正常。
6. `BLOCKER` Settings Project tab 保存项目名称/描述。
结果：FAIL。页面编辑后点击 `Save Changes`，项目数据未更新；网络请求中未出现 `PATCH /api/projects/cmnspl7zc00r59ydumaq0ve2o`。

## 缺陷（复验仍存在）

### 1) Settings Project tab 点击保存不触发项目更新请求
- 严重级别：High
- 复现步骤：
  1. 打开 `/settings`
  2. 切换到 `Project` tab
  3. 修改项目名、描述
  4. 点击 `Save Changes`
  5. 检查 Network 与 `GET /api/projects/:id`
- 实际结果：
  - Network 仅有 `GET /api/projects/:id`，无 `PATCH /api/projects/:id`
  - API 复核返回旧值（页面点击保存后未变化）
- 预期结果：
  - 应发出 `PATCH /api/projects/:id`
  - 保存后 `GET /api/projects/:id` 返回新名称/描述
- 对照验证：
  - 直接 API 调用 `PATCH /api/projects/cmnspl7zc00r59ydumaq0ve2o` 可成功并落库，说明后端接口可用，问题在前端保存链路

## 结论
- N1 Round 1 `reverifying` 未通过，需继续 `fixing`。

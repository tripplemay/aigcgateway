# N1 UI Navigation Polish Verifying (2026-04-10)

## 测试目标
- 批次：`N1 — UI/导航打磨（Sidebar 分组 + Docs 入口 + Settings Project tab + Keys 精简）`
- 阶段：`verifying`
- 目标：验证 Sidebar 分组、Docs 入口迁移、Settings Project tab CRUD、Keys 页面精简、DS token 与 i18n 完整性

## 测试环境
- 环境：L1 本地
- 基址：`http://127.0.0.1:3099`
- 提交：`1d9fe5c`
- 执行时间：`2026-04-10T07:58:44Z`
- 测试账号：`admin@aigc-gateway.local`

## 使用的源文档
- `progress.json`
- `features.json`
- `src/components/sidebar.tsx`
- `src/components/top-app-bar.tsx`
- `src/app/(console)/settings/page.tsx`
- `src/app/(console)/keys/page.tsx`
- `src/app/api/projects/[id]/route.ts`

## 测试数据
- 测试项目：`N1 Eval n1_mnsm1pru`
- Project ID：`cmnsm1prx00qt9ydu74qn68ns`
- 测试 Key：`N1 Key n1_mnsm1pru`
- Key ID：`cmnsm1ps300qv9yduh3d87nmv`

## 覆盖摘要
- 通过：5
- 失败：1
- 阻塞：0
- 未执行：0

## 结构化测试用例与结果
1. `SMOKE` 登录后台并检查 Sidebar/Top Bar 主体结构。
结果：PASS。登录后 Sidebar 按 `Core / Develop / Data / Model Mgmt / Operations / Users` 分组展示，`Settings` 为独立项；Top Bar 仅保留语言切换、通知和头像，不再出现 Docs/API Reference/Support 顶部导航入口。
2. `AC1` Docs 入口从 Sidebar 可访问。
结果：PASS。点击 Sidebar 中 `Docs` 后进入 `/docs`，文档页面正常加载。
3. `AC2` Keys 页面已移除统计卡，创建入口合并到表格头部。
结果：PASS。`/keys` 首屏直接展示标题、表格 header bar、搜索框和 `Create Key` 按钮；页面未出现旧的三张统计卡/FAB。测试 key 可在表格中正常显示。
4. `AC3` Settings 页包含 Account / Project tab，Project tab 展示项目统计和删除区。
结果：PASS。`/settings` 可切换到 `Project` tab，展示项目名称、描述、`API Keys=1`、`API Calls=0` 以及 Danger Zone 删除确认。
5. `AC4` Settings Project tab 删除项目。
结果：PASS。输入项目名后 `Delete Project` 按钮解锁，点击后跳回 `/dashboard` 并出现 `Project deleted` toast；随后通过 API 复核 `GET /api/projects/cmnsm1prx00qt9ydu74qn68ns` 返回 `404 Project not found`。
6. `AC5` Settings Project tab 更新项目名称/描述。
结果：FAIL。两次在 Project tab 修改名称/描述并点击 `Save Changes` 后，页面无成功 toast，随后 API 复核 `GET /api/projects/cmnsm1prx00qt9ydu74qn68ns` 仍返回旧值 `name=\"N1 Eval n1_mnsm1pru\"`、`description=\"N1 acceptance project\"`，更新未生效。

## 缺陷列表

### 1. Settings Project tab 无法保存项目名称/描述
- 严重级别：High
- 环境：L1 本地 `http://127.0.0.1:3099`
- 前置条件：使用 `admin@aigc-gateway.local` 登录；存在项目 `N1 Eval n1_mnsm1pru`
- 复现步骤：
  1. 打开 `/settings`
  2. 切到 `Project` tab
  3. 将项目名改为 `N1 Eval Updated Again`
  4. 将描述改为 `N1 second save attempt`
  5. 点击 `Save Changes`
  6. 通过 API 查询 `GET /api/projects/cmnsm1prx00qt9ydu74qn68ns`
- 实际结果：
  - 页面未出现 `Project updated` 成功提示
  - API 返回的项目名和描述保持旧值，未被更新
- 预期结果：
  - 保存后应出现成功提示
  - `GET /api/projects/:id` 应返回新名称和新描述
- 证据：
  - 页面：`http://127.0.0.1:3099/settings`
  - API 复核：`GET /api/projects/cmnsm1prx00qt9ydu74qn68ns` 返回旧值
- 影响范围：
  - N1 的 Project tab CRUD 不完整
  - 本轮批次不能签收

## 风险项
- 删除项目后当前页即时快照仍短暂显示旧项目名；刷新后 Sidebar 会恢复为 `无项目`。该现象在本轮不单独记为阻断缺陷，但说明项目上下文刷新存在时序滞后。

## 最终结论
- `N1` 本轮 `verifying` 未通过，需进入 `fixing`。

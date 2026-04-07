Summary
- Scope: project-switcher-ui batch (F-PS-01~06) L1 local verification focusing on UI context provider + sidebar interactions
- Documents:
  - `features.json` (F-PS-01~06)
  - `docs/specs/layout-shell-spec.md` (sidebar layout references)
- Environment:
  - Local Next.js server via `bash scripts/test/codex-setup.sh` @ `http://localhost:3099`
  - Fresh PostgreSQL test DB seeded via script
- Result totals:
  - 待执行

Scenario Coverage
- Scenario A - First project creation auto-select + shared context propagation (Dashboard empty state -> populated)
- Scenario B - Sidebar dropdown switching propagates to Dashboard / Keys / Actions + wallet balance
- Scenario C - Persist last-selected project via `localStorage.projectId` across reloads + CreateProjectDialog refresh callback

可执行测试用例

ID: PS-L1-01
Title: Initial project creation auto-selects newest & hydrates context
Priority: Critical
Requirement Source: `F-PS-01` `F-PS-03`
Preconditions:
- Local server running at `http://localhost:3099`
- New developer account credentials ready
Steps:
1. 注册并登录新账号（UI）。
2. 触发 EmptyState / Sidebar 的「New Project」对话框，输入唯一名称 `PS Auto <timestamp>` 并提交。
3. 观察 Sidebar 顶部 Project Switcher 显示新名称，Dashboard 从 EmptyState 过渡到实时卡片骨架。
4. 校验 `localStorage.projectId` 与 `/api/projects` 列表返回的最新项目 `id` 相同。
State Assertions:
- `ProjectProvider.refresh()` 在新项目创建后选中新项目
- `Sidebar`、`TopAppBar`、`Dashboard` 等使用 `useProject()` 的组件立即收到更新
Cleanup:
- 无，保留项目供后续用例复用
Notes / Risks:
- EmptyState 仍会在 `current=null` 时出现，允许使用任一入口创建

ID: PS-L1-02
Title: Sidebar Project Switcher 切换后，业务页面数据隔离
Priority: Critical
Requirement Source: `F-PS-02` `F-PS-04` `F-PS-05` `F-PS-06`
Preconditions:
- 已创建两个及以上项目（PS-L1-01）
- 为项目 A 制造 API Keys / Actions 数据，项目 B 保持空
Steps:
1. 通过 UI 或 `page.evaluate` API 调用为项目 A 创建 1 个 API Key + 1 个 Action；记录两个项目的 ID。
2. 保持项目 B 处于当前选中状态，依次访问 `/keys` `/actions`，确认页面显示空态 & 统计为 0。
3. 打开 Sidebar 下拉，选择项目 A；确认 Project Switcher 当前项高亮变更。
4. 再次访问 `/keys` `/actions`，确认表格渲染项目 A 的数据（API Key 名称、Action 名称与步骤 1 一致）。
5. 检查 Sidebar 底部钱包余额文案与 `/api/projects` 中对应项目 `balance` 一致。
State Assertions:
- `useProject()` 的 `current.id` 变化后触发页面级数据请求
- Wallet balance 数字来源于当前项目余额，不再是独立 API
Cleanup:
- 保留创建的数据供持久化用例
Notes / Risks:
- 需要等待列表刷新完成，可通过 UI skeleton 消失或 `expect` API 响应完成来判断

ID: PS-L1-03
Title: 刷新页面后仍保持最后一次选中的项目
Priority: High
Requirement Source: `F-PS-06`
Preconditions:
- 延续 PS-L1-02，确保项目 A / B 均可正常切换
Steps:
1. 在 Sidebar 下拉中选中项目 A，并确认 `localStorage.projectId` = 项目 A ID。
2. 执行浏览器刷新（`page.reload()`）。
3. 等待 Dashboard 加载完成，读取 Project Switcher 文案与 `localStorage.projectId`，确认仍为项目 A。
4. 切换到项目 B，重复步骤 2~3，确认保持项目 B。
State Assertions:
- `ProjectProvider` 初始化时会读取本地 `projectId`，若存在则选中对应项目。
Cleanup:
- 无
Notes / Risks:
- 需要考虑 `localStorage` 清空或项目被删除的 fallback；本测试仅验证 happy path。

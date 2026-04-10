# N1 UI Navigation Polish Reverify (2026-04-10 Round 3)

## 测试目标
- 批次：`N1-ui-navigation-polish`
- 阶段：`reverifying`（fix round 3）
- 目标：复验 Settings Project tab 保存链路并回归 N1 导航/UI 验收项

## 测试环境
- 环境：L1 本地
- 基址：`http://localhost:3099`
- 提交：`7dfb869`
- 执行时间：`2026-04-10 17:53:57 CST`
- 账号：`admin@aigc-gateway.local`

## 覆盖摘要
- 通过：5
- 失败：1
- 阻断：0

## 复验结果
1. `AC1` Sidebar 分组 + Docs 入口  
结果：PASS。用户侧/管理侧分组完整，Docs 入口在侧栏开发组。
2. `AC2` Topbar 旧文档链接移除  
结果：PASS。Topbar 未出现 Documentation/API Reference/Support。
3. `AC3` Keys 页面精简  
结果：PASS。`/keys` 无顶部统计卡，创建按钮位于表格标题区。
4. `AC4` i18n 抽查  
结果：PASS。CN 下分组标题、Settings/Docs/Keys 文案正常；EN/CN 切换可用。
5. `AC5` Project 删除能力  
结果：PASS（API 对照）。创建临时项目 `cmnsqav3700rl9yduek53ehwf` 后，`DELETE /api/projects/:id` 返回 `200`，`GET` 返回 `404`。
6. `BLOCKER` Settings Project tab 保存项目名称/描述  
结果：FAIL。编辑为 `API Patch Name R3` / `API Patch Desc R3` 后点击 `保存更改`，项目未更新；Network 无 `PATCH /api/projects/cmnspl7zc00r59ydumaq0ve2o`。

## 缺陷（复验仍存在）

### 1) Settings Project tab 点击保存不触发 PATCH
- 严重级别：High
- 复现步骤：
  1. 打开 `/settings`
  2. 切换到 `Project` tab
  3. 修改项目名称和描述
  4. 点击 `保存更改`
  5. 检查 Network 与 `GET /api/projects/:id`
- 实际结果：
  - Network 仅有 `GET`，无 `PATCH /api/projects/cmnspl7zc00r59ydumaq0ve2o`
  - `GET /api/projects/cmnspl7zc00r59ydumaq0ve2o` 仍返回旧值 `API Patch Name` / `API Patch Desc`
- 预期结果：
  - 点击保存后应发出 `PATCH /api/projects/:id`
  - 保存后 `GET` 应返回更新后的名称/描述
- 对照验证：
  - 直接调用 `PATCH /api/projects/cmnspl7zc00r59ydumaq0ve2o` 可 `200` 成功，后端接口可用，问题仍在前端保存触发链路

## 结论
- N1 Round 3 `reverifying` 未通过，需继续 `fixing`。

# N1 UI Navigation Polish Reverify (2026-04-10 Round 2)

## 测试目标
- 批次：`N1-ui-navigation-polish`
- 阶段：`reverifying`（fix round 2）
- 目标：复验 N1 阻断问题（Settings Project tab 保存）并回归关键导航项

## 测试环境
- 环境：L1 本地
- 基址：`http://localhost:3099`
- 提交：`a88b804`
- 执行时间：`2026-04-10 17:44:38 CST`
- 账号：`admin@aigc-gateway.local`

## 覆盖摘要
- 通过：5
- 失败：1
- 阻断：0

## 复验结果
1. `AC1` Sidebar 分组 + Docs 入口  
结果：PASS。用户侧与 Admin 侧分组完整，Docs 位于开发组并可打开 `/docs`。
2. `AC2` Topbar 旧文档链接移除  
结果：PASS。Topbar 仅保留语言切换/通知/头像菜单，无 Documentation/API Reference/Support。
3. `AC3` Keys 页面精简  
结果：PASS。`/keys` 无旧统计卡，创建按钮位于列表 header（`Create Key`）。
4. `AC4` i18n 抽查  
结果：PASS。切换 CN 后，Sidebar 分组（核心/开发/数据/模型管理/运维/用户）与 Settings/Docs/Keys 文案正常。
5. `AC5` Project 删除能力（对照验证）  
结果：PASS（API 对照）。本轮创建测试项目 `cmnspvsnc00rh9ydua4j7zh04` 后执行 `DELETE /api/projects/:id` 返回 `200`，随后 `GET` 返回 `404`。
6. `BLOCKER` Settings Project tab 保存项目名称/描述  
结果：FAIL。`/settings` → `Project` tab 编辑后点击 `保存更改/Save Changes`，项目数据未更新；Network 中未出现 `PATCH /api/projects/cmnspl7zc00r59ydumaq0ve2o`。

## 缺陷（复验仍存在）

### 1) Settings Project tab 点击保存不触发 PATCH
- 严重级别：High
- 复现步骤：
  1. 打开 `/settings`
  2. 切换到 `Project` tab
  3. 修改项目名称/描述（例如 `API Patch Name R2` / `API Patch Desc R2`）
  4. 点击 `Save Changes`
  5. 检查 Network 与 `GET /api/projects/:id`
- 实际结果：
  - Network 列表中无 `PATCH /api/projects/cmnspl7zc00r59ydumaq0ve2o` 请求
  - `GET /api/projects/cmnspl7zc00r59ydumaq0ve2o` 仍返回旧值 `API Patch Name` / `API Patch Desc`
- 预期结果：
  - 点击保存后应发出 `PATCH /api/projects/:id`
  - 保存后应可读取到更新后的项目名称/描述
- 对照验证：
  - 直接调用同一路径 `PATCH /api/projects/cmnspl7zc00r59ydumaq0ve2o` 返回 `200`，后端接口可用，问题在前端保存触发链路

## 结论
- N1 Round 2 `reverifying` 未通过，需继续 `fixing`。

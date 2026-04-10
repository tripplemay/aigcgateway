# N1 UI Navigation Polish Reverify (2026-04-10 Round 4)

## 测试目标
- 批次：`N1-ui-navigation-polish`
- 阶段：`reverifying`（fix round 4）
- 目标：验证 Save 按钮改为与 Delete 同模式后是否修复；并排除测试环境缓存干扰

## 测试环境
- 环境：L1 本地
- 基址：`http://localhost:3099`
- 提交：`7dfb869`
- 执行时间：`2026-04-10 18:02:24 CST`
- 账号：`admin@aigc-gateway.local`

## 预处理
- 按建议执行环境清理与重编译：
  - `rm -rf .next`
  - `npm run build`（成功）
  - `bash scripts/test/codex-wait.sh`（服务就绪）

## 覆盖摘要
- 通过：5
- 失败：1
- 阻断：0

## 复验结果
1. `AC1` Sidebar 分组 + Docs 入口  
结果：PASS。分组与 Docs 入口正常。
2. `AC2` Topbar 旧文档链接移除  
结果：PASS。无 Documentation/API Reference/Support。
3. `AC3` Keys 页面精简  
结果：PASS。无顶部统计卡，创建按钮位于表格标题区。
4. `AC4` i18n 抽查  
结果：PASS。CN/EN 下分组与 Settings/Docs/Keys 文案正常。
5. `AC5` 删除能力与后端可用性对照  
结果：PASS（接口对照）。直接 `PATCH /api/projects/cmnspl7zc00r59ydumaq0ve2o` 返回 `200`。
6. `BLOCKER` Settings Project tab 保存项目名称/描述  
结果：FAIL。编辑为 `API Patch Name R4` / `API Patch Desc R4` 后点击保存，项目未更新；Network 无 `PATCH /api/projects/cmnspl7zc00r59ydumaq0ve2o`。

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
  - Network 仍仅有 `GET`，无 `PATCH /api/projects/cmnspl7zc00r59ydumaq0ve2o`
  - `GET /api/projects/cmnspl7zc00r59ydumaq0ve2o` 仍返回旧值 `API Patch Name` / `API Patch Desc`
- 预期结果：
  - 点击保存后发出 `PATCH /api/projects/:id`
  - 保存后 `GET` 应返回更新值
- 对照验证：
  - 在同会话直接调用 `PATCH /api/projects/cmnspl7zc00r59ydumaq0ve2o` 返回 `200`
  - 在清理 `.next` 并重新 `build` 后复测，问题仍存在

## 结论
- N1 Round 4 `reverifying` 未通过，需继续 `fixing`。
- 本轮已排除“旧编译缓存导致”的测试环境因素。

# T1 Template Experience Signoff (2026-04-10)

## 测试目标
- 批次：`T1-template-experience`
- 功能：Admin 模板详情页独立路由 + 用户侧步骤预览 Action
- 阶段：`verifying -> done`

## 测试环境
- 环境：L1 本地
- 基址：`http://127.0.0.1:3099`
- 提交：`f073697`
- 执行时间：`2026-04-10T07:35:34Z`
- 测试账号：`admin@aigc-gateway.local`

## 使用的源文档
- `progress.json`
- `features.json`
- `docs/specs/R2C-user-pages-actions-templates-spec.md`
- `design-draft/admin-templates/code.html`
- `src/app/(console)/admin/templates/[id]/page.tsx`
- `src/app/(console)/templates/[templateId]/page.tsx`

## 测试数据
- 本地新建项目：`T1 Eval t1_mnsl9e69`
- 模板：`T1 Template t1_mnsl9e69`
- Template ID：`cmnsl9efa00r39yfgfptu208q`
- Action IDs：`cmnsl9eew00qv9yfgqy7ohzqq`、`cmnsl9ef400qz9yfgd3utebsd`

## 覆盖摘要
- 通过：6
- 失败：0
- 阻塞：0
- 未执行：0

## 结构化测试用例与结果
1. `SMOKE` 登录本地控制台并进入目标项目。
结果：PASS。`/dashboard` 可正常加载，项目切换器显示 `T1 Eval t1_mnsl9e69`。
2. `AC1` Admin 模板列表页展示模板卡片并可通过可见性图标进入独立详情页。
结果：PASS。`/admin/templates` 展示模板名称、项目名、质量评分、公开开关；点击 `visibility` 后进入 `/admin/templates/cmnsl9efa00r39yfgfptu208q`，未出现空白页。
3. `AC2` Admin 模板详情页展示完整模板信息。
结果：PASS。页面展示 breadcrumb、模板名称、执行模式、项目、步骤、Action 名称、模型、活跃版本、系统消息摘要、变量、公开状态、质量评分和资源统计。
4. `AC3` 用户侧模板详情页展示步骤卡片并支持 accordion 展开 Action 预览。
结果：PASS。`/templates/cmnsl9efa00r39yfgfptu208q` 首屏可见步骤卡片；点击第一步后出现 `SYSTEM MESSAGE`/`VARIABLES` 区块及变量标签 `{{topic}}`、`{{audience}}`。
5. `AC4` 用户侧步骤卡片的 `open_in_new` 图标跳转到 Action 详情页。
结果：PASS。点击第一步的 `open_in_new` 后进入 `/actions/cmnsl9eew00qv9yfgqy7ohzqq`，Action 详情页可正常展示活跃版本、系统消息和变量表。
6. `AC5` i18n 与设计系统抽查。
结果：PASS。切换 EN 后 Admin 详情页与用户侧模板详情页关键文案切换为英文，未见新增硬编码中文；页面继续使用 `ds-*` token 和既有卡片/信息面板结构。

## 风险项
- 本地 seed 默认管理员账号为 `admin@aigc-gateway.local / admin123`，与 `.auto-memory/environment.md` 中共享测试账号不一致。该差异不影响本轮功能结论，但会影响后续本地复测效率。

## 证据
- `http://127.0.0.1:3099/admin/templates`
- `http://127.0.0.1:3099/admin/templates/cmnsl9efa00r39yfgfptu208q`
- `http://127.0.0.1:3099/templates/cmnsl9efa00r39yfgfptu208q`
- `http://127.0.0.1:3099/actions/cmnsl9eew00qv9yfgqy7ohzqq`

## 最终结论
- `T1-template-experience` 本地 L1 验收通过，可签收。

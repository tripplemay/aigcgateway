# ui-redesign-templates-actions Local Acceptance 2026-04-06

## 测试目标
执行 F-UI-09：验证 7 个重构页面可访问性、CRUD 完整性、中英文切换与 Stitch 设计一致性。

## 测试环境
- 本地 L1：`http://localhost:3099`
- 启动方式：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- API E2E：`scripts/test/_archive_2026Q1Q2/ui-redesign-templates-actions-e2e-2026-04-06.ts`
- 浏览器：Chrome DevTools MCP（人工核验 + 截图）

## 执行步骤概述
1. 通过 API 创建测试用户、项目、Action/Template 数据。
2. 执行 API 链路断言（Actions/Templates/Admin Templates）。
3. 浏览器登录用户态与管理员态，访问 7 个目标页面并截图。
4. 在 Actions 页面执行 EN/CN 切换，核验文案联动。
5. 对照 Stitch 设计稿关键结构（标题、表格列、信息面板、流程区）进行核验。

## 通过项
- 页面可访问性：7/7 页面可访问，无白屏/崩溃。
  - `/actions`
  - `/actions/{id}`
  - `/actions/new?edit={id}`
  - `/templates`
  - `/templates/{id}`
  - `/templates/new?edit={id}`
  - `/admin/templates`
- API CRUD 主链路通过（5/5）：
  - Action 创建/列表/详情/更新
  - Template 创建/列表/详情/更新/删除
  - Admin templates API 可返回列表与 stats
- 中英文切换可用：Actions 页面 EN/CN 切换后，侧边栏和表格标题可正确切换。
- 大部分页面骨架与 Stitch 方向一致（列表页列结构、详情页信息面板、模板流程区等）。

## 失败项
1. Action 编辑页未加载编辑对象数据（FAIL）
- 现象：访问 `/actions/new?edit={actionId}` 后页面仍显示“创建动作”空表单，未回填 Action 名称、模型、messages、variables。
- 预期：编辑模式应回填现有 Action 数据，支持在既有内容上修改。
- 证据：`ui-redesign-action-editor-2026-04-06.png`

2. Template 编辑页未加载编辑对象数据（FAIL）
- 现象：访问 `/templates/new?edit={templateId}` 后页面仍显示“创建模板”空表单，未回填模板名称与步骤编排。
- 预期：编辑模式应回填现有 Template 数据，支持编辑步骤序列。
- 证据：`ui-redesign-template-editor-2026-04-06.png`

3. Admin 模板管理页缺少验收要求的关键列/能力（FAIL）
- 现象：页面当前显示列主要为“模板名称/项目/步骤/模式/创建时间”，未见验收要求中的 Public 开关、Quality Score、操作列（也未体现分页交互证据）。
- 预期：应满足 F-UI-07 验收定义（Public 开关、Quality Score、搜索+筛选+分页、操作列）。
- 证据：`ui-redesign-admin-templates-2026-04-06.png`

## 风险项
- 本轮失败点集中在“编辑可用性 + Admin 管理能力完整性”，会直接影响模板/动作维护效率与后台运营体验，建议优先修复后复验。

## 证据文件
- API E2E：`docs/test-reports/ui-redesign-templates-actions-local-e2e-2026-04-06.json`
- 页面截图：
  - `docs/test-reports/ui-redesign-actions-list-2026-04-06.png`
  - `docs/test-reports/ui-redesign-action-detail-2026-04-06.png`
  - `docs/test-reports/ui-redesign-action-editor-2026-04-06.png`
  - `docs/test-reports/ui-redesign-template-list-2026-04-06.png`
  - `docs/test-reports/ui-redesign-template-detail-2026-04-06.png`
  - `docs/test-reports/ui-redesign-template-editor-2026-04-06.png`
  - `docs/test-reports/ui-redesign-admin-templates-2026-04-06.png`
  - `docs/test-reports/ui-redesign-actions-list-en-2026-04-06.png`

## 最终结论
- 结论：**FAIL**
- 建议状态流转：`verifying -> fixing`

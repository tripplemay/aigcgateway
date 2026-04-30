# P5 Public Templates Verifying Report (2026-04-09)

## 测试目标

- 执行 `F-P5-07`（executor: codex）首轮验收。
- 覆盖 Public Templates 全链路：Admin 标记公共模板 → User 浏览/详情/fork → MCP tools 调用。
- 检查 UI 结构、DS token 一致性与 i18n 残留。

## 测试环境

- L1 Local：`http://localhost:3099`
- 启动：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- 测试脚本：`scripts/test/_archive_2026Q1Q2/p5-public-templates-verifying-e2e-2026-04-09.ts`
- 证据 JSON：`docs/test-reports/p5-public-templates-verifying-e2e-2026-04-09.json`

## 结果概览

- 结论：**FAIL（进入 fixing）**
- 自动化步骤：7
- 通过：5
- 失败：2

## 通过项

1. 公共模板全链路通过：公共列表、公共详情、fork 到用户项目。
2. fork 深拷贝完整性通过：`sourceTemplateId` 正确、步骤数量一致、fork 后 Action 属于目标项目且与源 Action ID 不同。
3. 非公共模板禁止 fork（404）通过。
4. MCP tools 通过：`initialize`、`tools/list`、`list_public_templates`、`fork_public_template`。
5. UI 结构抽检通过：My/Library tab、3 列卡片网格、详情抽屉、Fork 弹窗。

## 失败项

1. AC6 DS token 审计失败
   - 审计结果：`legacy=0, hardcodedColor=10`
   - 代表证据：
     - [page.tsx](/Users/yixingzhou/project/aigcgateway/src/app/(console)/templates/page.tsx:48) 使用 `bg-slate-100 text-slate-600`
     - [page.tsx](/Users/yixingzhou/project/aigcgateway/src/app/(console)/templates/page.tsx:159) 使用 `text-slate-400`
     - [page.tsx](/Users/yixingzhou/project/aigcgateway/src/app/(console)/templates/page.tsx:280) 使用 `to-indigo-800`

2. AC7 i18n 审计失败
   - 审计结果：`keys=true`，但存在硬编码残留：
     - `templates.page.indigo-palette-hardcoded`
     - `global-library.score-prefix`
     - `detail-drawer.score-prefix`
     - `detail-drawer.mode-suffix`
     - `detail-drawer.step-prefix`
   - 代表证据：
     - [global-library.tsx](/Users/yixingzhou/project/aigcgateway/src/app/(console)/templates/global-library.tsx:129) `Score: {score}`
     - [template-detail-drawer.tsx](/Users/yixingzhou/project/aigcgateway/src/app/(console)/templates/template-detail-drawer.tsx:33) `{labels[mode] ?? mode} Mode`
     - [template-detail-drawer.tsx](/Users/yixingzhou/project/aigcgateway/src/app/(console)/templates/template-detail-drawer.tsx:87) `Step {String(i + 1)...}`

## 状态机回写

- `progress.json.status`：`verifying` → `fixing`
- 回退 `pending`：
  - `F-P5-04`（User UI）
  - `F-P5-06`（i18n）
  - `F-P5-07`（全量验收）
- `docs.signoff` 保持 `null`

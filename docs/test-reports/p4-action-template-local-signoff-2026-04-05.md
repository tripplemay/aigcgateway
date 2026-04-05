# P4 Action+Template 统一重构 — 本地签收报告（2026-04-05）

## 测试目标

对 `P4 Action+Template 统一重构` 批次执行本地 `L1` 首轮验收，覆盖：

- Schema / migration 落地
- Action / Template 管理 API
- ActionRunner / Sequential / Fan-out 执行链路
- `/v1/actions/run` 与 `/v1/templates/run`
- MCP 新 Tool 注册与调用
- 控制台 Action / Template 页面基础可达性
- i18n key 完整性
- `/v1/chat/completions` 旧 `template_id` 清理

## 测试环境

- 环境：本地 `localhost:3099`
- 启动方式：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- 数据库：`aigc_gateway_test`
- 测试方式：L1 本地基础设施层
- 说明：本地 provider API Key 为 placeholder，无法直接验证真实上游调用；本轮采用测试域 mock OpenAI-compatible 服务，仅在本地测试库中临时切换 provider/channel 指向，用于验证执行链路、SSE、CallLog 和 MCP 行为

## 测试范围

- 源规格：`docs/specs/action-template-redesign-spec.md`
- 测试用例：`docs/test-cases/p4-action-template-local-test-cases-2026-04-05.md`
- 批次功能：`F-P4-01` ~ `F-P4-18`

## 执行步骤概述

1. 重读状态机、规格、Evaluator 指令和项目记忆。
2. 完整重建本地 `3099` 环境，确认 P4 新路由已进入构建产物。
3. 新增本轮测试用例文档与本地 E2E 脚本。
4. 在脚本中启动 mock OpenAI-compatible 服务。
5. 在本地测试库中临时将 `openai/gpt-4o-mini` 所在 provider/channel 切到 mock，跑通：
   - Action CRUD + 版本激活 + `/v1/actions/run`
   - Sequential Template + `previous_output`
   - Fan-out Template + `all_outputs`
   - MCP `run_action` / `run_template`
   - `/v1/chat/completions` 旧 `template_id`
6. 通过浏览器走查 `/actions`、`/actions/new`、`/actions/:id`、`/templates`、`/templates/new`、`/templates/:id`。
7. 校验 i18n key 对齐、旧模板文件删除、Schema 结构与索引。
8. 补充 Action / Template `PUT` / `DELETE` 接口窄验证。

## 通过项

- `F-P4-01` PASS
  - P4 migration 已在本地测试库成功执行。
  - `actions`、`action_versions`、`templates`、`template_steps`、`call_logs` 表存在，`template_versions` 表不存在。

- `F-P4-02` PASS
  - `template_steps` 含 `templateId`、`actionId`、`order`、`role` 字段。
  - `StepRole` 枚举存在 `SEQUENTIAL`、`SPLITTER`、`BRANCH`、`MERGE`。
  - `template_steps_templateId_order_key` 唯一索引存在。

- `F-P4-03` PASS
  - `call_logs` 已不存在旧 `templateId/templateVersionId/templateVariables`。
  - 已存在 `actionId/actionVersionId/templateRunId` 三个新字段。
  - 本地构建时 `tsc/lint` 通过，P4 构建成功。

- `F-P4-04` PASS
  - Action 创建、列表、详情、版本创建、激活版本、更新、删除均通过。
  - 运行态验证显示激活版本切换后，执行链路使用的是 `v2`。

- `F-P4-05` PASS
  - Template 创建、列表、详情、更新、删除均通过。
  - 详情返回 steps 与 Action 基本信息。

- `F-P4-06` PASS
  - `/v1/actions/run` `stream=true` 返回 SSE。
  - 事件顺序为 `action_start -> content -> action_end -> [DONE]`。
  - `CallLog.actionId` / `actionVersionId` 已写入。

- `F-P4-07` PASS
  - 2 步 Sequential Template 执行通过。
  - 第 2 步输出为 `OUT(SEQ2 OUT(SEQ1 beta))`，证明 `previous_output` 已自动注入。
  - 两条 `CallLog` 共享同一 `templateRunId`。

- `F-P4-08` PASS
  - Fan-out Template 执行通过。
  - SSE 中出现 `branch_start × 3`。
  - MERGE 输出为 `MERGE(["BRANCH(red)","BRANCH(blue)","BRANCH(green)"])`，证明 `all_outputs` 已注入。
  - 同一 `templateRunId` 下记录到 5 条 `CallLog`。

- `F-P4-09` PASS
  - `/v1/actions/run` 路由存在且可用。
  - API Key 鉴权、余额校验、SSE 和非流转后处理链路在本地 mock 条件下成立。

- `F-P4-10` PASS
  - `/v1/templates/run` 路由存在且可用。
  - Sequential 和 Fan-out 两种执行模式均能自动识别并成功运行。

- `F-P4-11` PASS
  - 旧 `src/lib/template/inject.ts`、旧 fork 路由、旧 Template active-version 路由均不存在。
  - `/v1/chat/completions` 传入旧 `template_id` 后仍正常按原始 `messages` 执行，未发生旧模板注入。

- `F-P4-12` PASS
  - 侧边栏已出现 `Actions` 入口。
  - `/actions` 页面可达，列表展示名称、模型、活跃版本、描述。
  - `/actions/new` 页面可达。

- `F-P4-13` PASS
  - `/actions/new` 页面具备名称、模型、描述、messages、variables 编辑器。
  - `/actions/:actionId` 页面展示活跃版本消息、变量和版本历史。
  - 页面存在编辑入口，运行态数据加载正常。

- `F-P4-14` PASS
  - `/templates` 页面可达，列表展示步骤数和执行模式标签。

- `F-P4-15` PASS
  - `/templates/new` 页面可达，含步骤编排器、Action 选择器、StepRole 选择器。
  - `/templates/:templateId` 页面展示步骤列表、role badge、保留变量提示。

- `F-P4-16` PASS
  - MCP 初始化成功。
  - `tools/list` 返回 `list_actions`、`run_action`、`list_templates`、`run_template`。
  - 旧 `create_template/update_template` 不再出现。
  - `run_action` 与 `run_template` 工具均返回正确输出。

- `F-P4-17` PASS
  - `actions.*`、`templates.*` 中英文 key 数量一致，均为 `65`，无缺失。
  - 页面切换 `CN/EN` 后，Action / Template 相关文案可正常切换。

- `F-P4-18` PASS
  - 本轮 Codex 自执行 E2E 已完整覆盖 Action CRUD、单步执行、串行 Template、Fan-out Template、MCP Tool、旧 `template_id`。

## 失败项

- 无

## 风险项

- 本轮是本地 `L1` 验收，不含真实第三方 provider 调用。
- 为了让本地执行链路可验证，本轮使用了测试域 mock 服务，并临时改写了本地测试库里的 provider/channel 指向；脚本执行结束后已回滚。
- 因此这轮结论是“本地结构与执行链路 PASS”，不等同于生产外部 provider 全链路验收。

## 证据

- 测试用例：`docs/test-cases/p4-action-template-local-test-cases-2026-04-05.md`
- 原始 E2E 输出：`docs/test-reports/p4-action-template-local-e2e-2026-04-05.json`
- 页面截图：
  - `docs/test-reports/p4-action-detail-local-2026-04-05.png`
  - `docs/test-reports/p4-template-detail-local-2026-04-05.png`
  - `docs/test-reports/p4-actions-list-local-2026-04-05.png`

## 最终结论

- 结论：PASS
- 范围：P4 `18/18 PASS`
- 判定：在本地 `L1` 条件下，P4 Action+Template 统一重构的 Schema、API、执行引擎、MCP、控制台页面和 i18n 已闭环通过验收，可进入 `done`

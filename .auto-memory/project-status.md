---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- N1-ui-navigation-polish：`fixing`
- `verifying` 首轮未通过，`reverifying` round 1~4 均未通过
- 阻断项未修复：Settings Project tab 点击保存未触发 PATCH，请求未发出
- T1-template-experience：`done`
- `verifying` 首轮签收通过，Admin 模板详情独立路由与用户侧步骤预览 Action 验收完成
- U1-admin-user-detail：`done`
- 第 1 轮 `reverifying` 已签收，U1 Admin 用户详情页验收完成
- L1-llm-inference-robustness：`done`
- `verifying` 首轮签收通过，LLM 推断链路健壮性升级验收完成
- MCP2-tools-enhancement：`done`
- `verifying` 首轮签收通过，MCP 工具增强验收完成
- A1-alias-data-quality：`done`
- `reverifying` 通过签收，生产存量 alias 数据已修正并完成复验

## T1 验收结论
- `/admin/templates/:id` 已改为独立详情页，点击列表详情不再空白
- Admin 详情页可展示项目、步骤、Action 活跃版本、公开状态、质量评分与资源统计
- `/templates/:id` 步骤卡片支持 accordion 展开，只读预览系统消息摘要和变量
- `open_in_new` 可跳转到 `/actions/:id`，Action 详情页正常展示活跃版本
- EN/CN 切换下新增文案可正常翻译，页面沿用现有 DS token

## N1 验收结论
- Sidebar 已按 Core / Develop / Data / Model Mgmt / Operations / Users 分组，Docs 入口迁入 Sidebar，Top Bar 不再保留旧文档导航
- Keys 页已移除旧统计卡与 FAB，创建按钮合并到表格 header
- Settings 页已新增 Account / Project tab，Project tab 可展示项目统计并执行删除
- 阻断问题：Project tab 点击保存后项目名称与描述未更新，round 4 在清理 `.next` + 重建后仍显示前端未发出 PATCH 请求

## U1 验收结论
- 详情 API 返回真实 balance、lastActive、projects、transactions 分页
- 项目卡片已展示调用数和 Key 数
- 充值、暂停/恢复、删除与列表过滤链路全部通过
- 暂停后登录/API 调用被阻断，恢复后重新正常

## L1 验收结论
- `classifyNewModels`、`inferMissingBrands`、`inferMissingCapabilities` 已验证分批 30 条策略
- 失败批次会跳过继续，已完成批次即时持久化不丢失
- 下次执行可补处理上次跳过数据；105 alias capabilities 场景无超时

## MCP2 验收结论
- MCP `chat` 已验证 `tools/tool_choice/top_p/frequency_penalty/presence_penalty/stop`
- `stream=true` 场景会正确累积 `tool_calls` 并返回 `ttftMs`
- `list_models(image)` 已返回聚合后的 `supportedSizes`
- `list_api_keys/create_api_key/revoke_api_key/get_project_info/create_project` 全链路通过

## A1 复验结论
- 本地 L1 与生产只读复验证据均已闭环，A1 全量签收通过
- `cogview-3/dall-e-2/seedream-3` 已修正为 `IMAGE`
- `claude-3.5-sonnet/deepseek-r1/deepseek-v3` 的 `contextWindow/maxTokens` 已补齐
- 品牌重复变体已清理，仅保留标准名 `Arcee`、`智谱AI`
- `fix-alias-modality` / `fix-brand-duplicates` / `fix-alias-context-window` 在生产 `--dry-run` 均为 `0` 待修正

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1

## Backlog
- 17 条（BL-065~096），含 2 条 high

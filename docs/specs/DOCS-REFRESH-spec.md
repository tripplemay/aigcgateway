# DOCS-REFRESH 批次规格文档

**批次代号：** DOCS-REFRESH
**目标：** 重新定位 /quickstart 和 /docs 两个页面，分工明确、内容更新到最新平台状态
**触发时机：** UI-UNIFY 签收部署后立即启动
**规模：** 3 个 generator + 1 个 codex 验收 = 4 条
**合并的 backlog：** BL-090（/docs 内容更新）+ BL-110（quickstart 重写）

## 背景

当前两个页面都不达标：

**/quickstart 问题：**
- SDK 包名 `@guangai/aigc-sdk` 不存在，照抄即失败
- 模型名是旧格式 `deepseek/v3` / `zhipu/cogview-3-flash`，平台早已切换到别名
- 全英文未走 i18n
- 缺少"获取 API Key"这个最关键的第 0 步

**/docs 问题：**
- 模型名也是旧格式
- 9 个 Section 散落，没有"我该从哪开始"的指引
- 28 个 MCP tools 列表对新手是噪音
- chat 参数已有 i18n key（top_p/frequency_penalty/tools/tool_choice）但内容仍需校对

## 重新定位

| 页面 | 定位 | 受众 |
|------|------|------|
| **/quickstart** | "5 分钟跑通第一个调用" | 完全新手，第一次接触平台 |
| **/docs** | "完整参考手册，按需查阅" | 已有基础，需要查具体参数/字段定义 |

**保留两个页面**，但重新定位、分工明确，互相交叉引用。

## Features

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-DR-01 | quickstart 整体重写 | high | 1) 增加 Step 0：获取 API Key（带链接到 /keys）；2) Step 1: curl 零依赖第一次调用；3) Step 2: OpenAI SDK 集成（npm install openai，因为 API 是 OpenAI 兼容的）；4) Step 3: 流式响应；5) Step 4: 进阶能力索引（链接到 /docs 各章节、/mcp-setup）；6) 模型名全部使用别名格式（如 gpt-4o-mini, claude-sonnet-4.6, deepseek-v3）；7) baseUrl 写死完整地址（https://aigc.guangai.ai/v1）；8) 全部文案走 i18n（zh-CN + en）；9) 设计系统对齐：使用 PageContainer + PageHeader 公共组件；10) tsc 通过 |
| F-DR-02 | docs 内容更新 | high | 1) 所有模型名从 provider 前缀格式改为别名格式；2) chat 参数 Section 补全 top_p/frequency_penalty/tools/tool_choice 的实际描述（i18n key 已存在）；3) MCP tools 列表更新为最新 28 个，按功能域分组；4) MCP Section 末尾保留链接到 /mcp-setup；5) 顶部增加"新用户先看 /quickstart"的提示；6) tsc 通过 |
| F-DR-03 | 两个页面交叉引用 | medium | 1) quickstart 末尾 Step 4 链接到 docs 各 Section（chat/images/models/errors/limits/MCP）；2) docs 顶部增加 banner："首次使用？先看 → /quickstart"；3) 链接走 next/Link 不是 a 标签；4) tsc 通过 |
| F-DR-04 | DOCS-REFRESH 全量验收 | high | codex 执行：1) /quickstart 4 步均可正常运行（curl 实测成功）；2) /docs 所有 curl 示例可执行；3) 模型名全部为别名格式，无 provider 前缀残留；4) i18n 中英文一致；5) 两页面交叉引用可点击；6) 签收报告生成 |

## 关键设计决策

1. **不用自研 SDK** — 平台 API 是 OpenAI 兼容的，直接展示 OpenAI SDK 用法即可，避免维护 SDK 文档
2. **第一步必须是获取 API Key** — 降低上手门槛，不让用户卡在第一步
3. **先 curl 再 SDK** — 零依赖最优先，让用户立刻验证连通性
4. **文案全部走 i18n** — quickstart 当前是英文硬编码，必须 i18n 化
5. **保留两个页面分工** — quickstart 是引导，docs 是参考；不合并

## 启动条件

- UI-UNIFY 签收完成（F-UU-13 codex 验收通过）
- UI-UNIFY 部署到生产
- 本规格转正为 features.json + progress.json (status: building)

## 合并的 backlog 条目

本批次完成后将关闭：
- BL-090 用户文档页(/docs)内容更新 → F-DR-02 + F-DR-03
- BL-110 快速开始页面整体重写 → F-DR-01

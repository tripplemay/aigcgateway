# TEMPLATE-TESTING 批次规格文档

**批次代号：** TEMPLATE-TESTING
**目标：** 为模板新增独立测试页面，支持变量预览（dry_run 免费）+ 真实执行 + 步骤级结果展示 + 测试历史
**触发时机：** TEMPLATE-LIBRARY-UPGRADE 签收后启动
**规模：** 7 个 generator + 1 个 codex 验收 = 8 条

## 背景

用户创建或 fork 模板后，缺乏一个可视化的测试环境来验证模板质量：
- `run_template` 只返回最终结果，无步骤级调试能力
- 没有 dry_run 预览（变量替换是否正确）
- 没有测试历史对比（改了 prompt 后效果是否提升）
- 没有成本预估（执行前不知道要花多少钱）

## 核心用户流程

```
用户进入 /templates/[id]/test
  │
  ├─ 左侧面板：模板信息 + 变量输入表单
  │   ├─ 展示模板名、步骤列表、每步使用的 Action 和 Model
  │   ├─ 变量输入框（从 template steps 的 Action variables 聚合）
  │   └─ 可选：变量预设下拉（从历史测试记录中加载）
  │
  ├─ 操作区：
  │   ├─ [预览] 按钮 → dry_run 免费渲染变量替换效果
  │   └─ [执行测试] 按钮 → 真实调用，消耗额度
  │
  └─ 右侧面板：执行结果
      ├─ 步骤级展示：Step 1 → Step 2 → Step 3
      │   每步：输入（渲染后 prompt）/ 输出 / token 用量 / 耗时 / cost
      ├─ 汇总：总 token / 总 cost / 总耗时
      └─ 底部：测试历史列表（最近 20 次，点击可回看）
```

## 设计

### Schema 新增

```prisma
model TemplateTestRun {
  id           String   @id @default(cuid())
  templateId   String
  userId       String
  variables    Json     // 用户输入的变量
  mode         String   // "dry_run" | "execute"
  status       String   // "success" | "error" | "partial"
  steps        Json     // 每步结果：[{order, actionName, model, input, output, tokens, cost, latencyMs, error?}]
  totalTokens  Int?
  totalCost    Decimal? @db.Decimal(12, 8)
  totalLatency Int?     // ms
  createdAt    DateTime @default(now())

  template     Template @relation(fields: [templateId], references: [id])
  user         User     @relation(fields: [userId], references: [id])

  @@index([templateId, createdAt(sort: Desc)])
  @@index([userId, createdAt(sort: Desc)])
  @@map("template_test_runs")
}
```

### 自动清理

每个 user + template 组合最多保留 20 条记录。新增时如果超过 20 条，删除最旧的。

### API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/templates/[id]/test` | 执行测试（body: `{variables, mode: "dry_run" \| "execute"}`） |
| GET | `/api/templates/[id]/test-runs` | 获取测试历史（limit=20） |
| GET | `/api/templates/[id]/test-runs/[runId]` | 获取单次测试详情 |

### dry_run 模式

- 对每个步骤调用 `run_action(dry_run=true)`
- 返回变量替换后的完整 prompt（不调模型）
- cost = $0，tokens = 0
- 用户确认变量正确后再执行真实调用

### execute 模式

- 调用 `run_template` 的内部逻辑
- 每步结果实时写入（支持 partial 状态——前 2 步成功第 3 步失败）
- 写入 TemplateTestRun 表
- 扣费正常走 post-process

### 前端页面布局

```
┌─ /templates/[id]/test ────────────────────────────────────────────┐
│                                                                    │
│  PageHeader: "测试模板：{模板名}"     [← 返回模板详情]              │
│                                                                    │
│  ┌─ 左侧 (40%) ──────────────┐  ┌─ 右侧 (60%) ──────────────┐   │
│  │                            │  │                            │   │
│  │  模板信息                   │  │  执行结果                   │   │
│  │  ├ 3 步 · sequential       │  │                            │   │
│  │  ├ Step 1: 翻译 (deepseek) │  │  ┌ Step 1 ─────────────┐  │   │
│  │  ├ Step 2: 校对 (gpt-4o)   │  │  │ 输入: "请翻译: ..."  │  │   │
│  │  └ Step 3: 润色 (claude)   │  │  │ 输出: "Translation.."│  │   │
│  │                            │  │  │ 158 tokens · $0.002  │  │   │
│  │  ── 变量输入 ──            │  │  │ 1.2s                 │  │   │
│  │                            │  │  └────────────────────┘  │   │
│  │  source_text:              │  │  ┌ Step 2 ─────────────┐  │   │
│  │  ┌──────────────────────┐  │  │  │ 输入: "{{previous}}" │  │   │
│  │  │ (多行输入框)          │  │  │  │ 输出: "Reviewed..."  │  │   │
│  │  └──────────────────────┘  │  │  │ 89 tokens · $0.001   │  │   │
│  │                            │  │  └────────────────────┘  │   │
│  │  target_language:          │  │                            │   │
│  │  ┌──────────────────────┐  │  │  ── 汇总 ──               │   │
│  │  │ 中文                  │  │  │  总计: 350 tokens $0.005  │   │
│  │  └──────────────────────┘  │  │  耗时: 3.4s               │   │
│  │                            │  │                            │   │
│  │  ── 变量预设 ──            │  │  ── 测试历史 ──            │   │
│  │  [从历史加载 ▾]            │  │  #1 04-17 10:30 ✅ $0.005  │   │
│  │                            │  │  #2 04-17 10:25 ❌ Step2   │   │
│  │  [预览（免费）] [执行测试]  │  │  #3 04-17 09:50 ✅ $0.004  │   │
│  │                            │  │                            │   │
│  └────────────────────────────┘  └────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

## Features

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-TT-01 | Schema：TemplateTestRun 表 + migration | high | 1) 新增 template_test_runs 表（id/templateId/userId/variables/mode/status/steps/totalTokens/totalCost/totalLatency/createdAt）；2) Template 和 User 增加 relation；3) 索引 templateId+createdAt DESC 和 userId+createdAt DESC；4) tsc 通过 |
| F-TT-02 | 测试执行 API：POST /api/templates/[id]/test | high | 1) body: {variables: Record\<string,string\>, mode: "dry_run" \| "execute"}；2) dry_run 模式：对每步 run_action(dry_run=true) 返回渲染后 prompt，cost=0；3) execute 模式：真实执行每步，收集 input/output/tokens/cost/latencyMs；4) 写入 TemplateTestRun 表；5) 自动清理：同 user+template 超过 20 条时删最旧的；6) 部分步骤失败时 status=partial，已执行步骤结果保留；7) 鉴权：只能测试自己项目的模板 + 已 fork 的公共模板；8) tsc 通过 |
| F-TT-03 | 测试历史 API：GET test-runs + GET test-runs/[runId] | medium | 1) GET /api/templates/[id]/test-runs 返回最近 20 条记录（id/mode/status/totalTokens/totalCost/createdAt 摘要）；2) GET /api/templates/[id]/test-runs/[runId] 返回完整 steps 详情；3) 鉴权：只能查看自己的测试记录；4) tsc 通过 |
| F-TT-04 | MCP 扩展：run_template 增加 test_mode 参数 | medium | 1) MCP run_template 新增可选参数 test_mode: "dry_run" \| "execute"（默认不传 = 正常执行不记录）；2) test_mode="dry_run" 等价于 API 的 dry_run 模式；3) test_mode="execute" 等价于 API 的 execute 模式（写 TemplateTestRun）；4) 正常 run_template（不传 test_mode）行为不变；5) tsc 通过 |
| F-TT-05 | 前端：测试页面左侧（模板信息 + 变量输入 + 操作按钮） | high | 1) 新增 /templates/[id]/test/page.tsx；2) 左侧面板展示模板名、步骤列表（每步 Action 名 + Model）；3) 变量输入表单从 steps 的 Action variables 聚合，每个变量一个输入框（短文本用 Input，长文本用 Textarea）；4) "从历史加载"下拉：读取 test-runs 的 variables 作为预设；5) "预览（免费）"按钮调 POST mode=dry_run；6) "执行测试"按钮调 POST mode=execute（执行中显示 loading）；7) 使用 PageContainer + PageHeader + SectionCard 公共组件；8) i18n；9) tsc 通过 |
| F-TT-06 | 前端：测试页面右侧（步骤结果 + 汇总 + 历史） | high | 1) 右侧面板按步骤展示结果：每步一个可折叠 SectionCard，显示输入（渲染后 prompt）/ 输出 / tokens / cost / 耗时；2) dry_run 模式只展示输入（渲染后 prompt），输出显示"预览模式，未调用模型"；3) 汇总区：总 tokens / 总 cost / 总耗时；4) 底部测试历史列表：最近 20 条，显示时间 + 状态（✅/❌）+ cost，点击加载该次结果到右侧；5) 失败步骤红色高亮 + 错误信息展示；6) i18n；7) tsc 通过 |
| F-TT-07 | 模板详情页 + 列表页增加"测试"入口 | medium | 1) /templates/[id] 详情页增加"测试"按钮（Button gradient-primary），跳转到 /templates/[id]/test；2) /templates 列表页每行增加"测试"图标按钮（material-symbols science）；3) 公共模板需要先 fork 才能测试（未 fork 时"测试"按钮提示"请先 Fork 到项目"）；4) i18n；5) tsc 通过 |
| F-TT-08 | TEMPLATE-TESTING 全量验收 | high | codex 执行：1) dry_run 模式返回渲染后变量且 cost=0；2) execute 模式真实调用每步并返回结果；3) 部分步骤失败时 status=partial，已执行步骤保留；4) 测试历史持久化且自动清理到 20 条；5) 历史预设可加载变量到输入表单；6) 前端页面左右分栏展示正确（模板信息+变量+结果+历史）；7) MCP test_mode 参数生效；8) 未 fork 的公共模板不能直接测试；9) 签收报告生成 |

## 推荐执行顺序

1. **F-TT-01**（schema 先行）
2. **F-TT-02**（核心执行 API）
3. **F-TT-03**（历史 API）
4. **F-TT-04**（MCP 扩展）
5. **F-TT-05**（前端左侧）
6. **F-TT-06**（前端右侧）
7. **F-TT-07**（入口按钮）
8. **F-TT-08**（验收）

## 关键约束

- dry_run 必须完全免费（不调模型、不扣费、不写 CallLog）
- execute 正常扣费（走 post-process，写 CallLog）
- 测试历史按 user+template 维度清理，不按全局
- 前端使用公共组件（PageContainer / PageHeader / SectionCard / Button gradient-primary）
- 步骤结果中的 input 是渲染后的完整 prompt（含 {{previous_output}} 替换结果），不是模板原文
- 变量预设从历史记录中提取（不额外建表）

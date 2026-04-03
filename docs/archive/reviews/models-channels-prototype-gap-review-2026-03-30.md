# 模型与通道页面原型差距审查报告

## 1. 检查范围

- 检查目标：`docs/mockups/models-channels-mockup.html` 对应的管理端 `/admin/models` 与开发者端 `/models`
- 平台/端：Web Console
- 分支/提交：`main` / `2e00564`
- 原型范围：`docs/mockups/models-channels-mockup.html`
- 实现范围：
  - `src/app/(console)/admin/models/page.tsx`
  - `src/app/(console)/models/page.tsx`
  - `src/app/api/admin/models-channels/route.ts`
  - `src/app/api/v1/models/route.ts`

## 2. 输入材料

- 原型：`docs/mockups/models-channels-mockup.html`
- PRD / 验收标准：`docs/AIGC-Gateway-P1.1-Documents/AIGC-Gateway-P1-Optimization-Prompt.md`
- 代码路径：
  - `src/app/(console)/admin/models/page.tsx`
  - `src/app/(console)/models/page.tsx`
  - `src/app/api/admin/models-channels/route.ts`
  - `src/app/api/v1/models/route.ts`
- 运行环境或预览地址：未使用

## 3. 审查方法与限制

- 审查方式：静态代码审阅
- 限制：
  - 本次未启动页面
  - 未基于真实数据做交互验证
  - 结论以代码结构与原型文本为准
- 假设：
  - 用户提到的 `docs/mockup` 目录在仓库中不存在，本次实际使用的是 `docs/mockups`
  - `docs/mockups/models-channels-mockup.html` 是本次审查主基线

## 4. 差距摘要

- 问题总数：3
- `P0`：0
- `P1`：2
- `P2`：1
- `P3`：0
- 核心结论：视觉骨架整体接近原型，但管理端最关键的“模型内多通道来源并排对比”未被当前数据结构正确支撑，属于结构性还原偏差，不是单纯样式问题。

## 5. 结构化问题清单

### GAP-001 管理端分组模型与原型不一致，无法在同一模型下比较跨通道来源

- 严重级别：`P1`
- 页面/模块：`/admin/models`
- 原型期望：
  - 原型示例要求在同一个 Provider 卡片下，某个模型展开后可同时看到多个通道来源的卡片
  - 示例中 `DeepSeek` 下的 `deepseek/v3` 同时展示 `DeepSeek direct` 和 `SiliconFlow` 两张通道卡
- 当前实际：
  - 接口先按 `provider.findMany()` 拉取 provider
  - 之后仅在单个 provider 内按 model 聚合
  - 结果会把同一模型在不同 provider 的通道拆到不同顶层卡片中
  - 页面直接按该接口结构渲染
- 差距类型：`交互` / `数据映射` / `信息架构`
- 影响：
  - 运营无法在一个模型节点下直接比较不同通道来源的成本、成功率和延迟
  - 原型最核心的“模型内多通道对比”场景无法成立
- 证据：
  - 原型：`docs/mockups/models-channels-mockup.html:112`
  - 原型：`docs/mockups/models-channels-mockup.html:135`
  - PRD：`docs/AIGC-Gateway-P1.1-Documents/AIGC-Gateway-P1-Optimization-Prompt.md:106`
  - 实现：`src/app/api/admin/models-channels/route.ts:15`
  - 实现：`src/app/api/admin/models-channels/route.ts:67`
  - 实现：`src/app/(console)/admin/models/page.tsx:224`
- 相关文件：
  - `docs/mockups/models-channels-mockup.html`
  - `src/app/api/admin/models-channels/route.ts`
  - `src/app/(console)/admin/models/page.tsx`
- 建议移交：前端 + API / 数据建模负责人

### GAP-002 管理端通道卡片标题映射错误，显示成 `realModelId` 而不是通道来源

- 严重级别：`P1`
- 页面/模块：`/admin/models`
- 原型期望：
  - 通道卡片顶部应显示“通道来源（Provider 名）+ Priority”
  - 原型示例为 `DeepSeek direct`、`SiliconFlow`
- 当前实际：
  - 页面标题位置渲染的是 `ch.realModelId`
  - 接口返回字段里也没有通道来源名称，只返回了 `realModelId`、`priority`、价格和状态
- 差距类型：`文案` / `数据映射`
- 影响：
  - 即使卡片正常展开，用户也无法识别当前卡片代表哪个通道来源
  - 在多来源模型场景下基本不可用
- 证据：
  - 原型：`docs/mockups/models-channels-mockup.html:138`
  - 原型：`docs/mockups/models-channels-mockup.html:156`
  - PRD：`docs/AIGC-Gateway-P1.1-Documents/AIGC-Gateway-P1-Optimization-Prompt.md:108`
  - 实现：`src/app/(console)/admin/models/page.tsx:315`
  - 实现：`src/app/api/admin/models-channels/route.ts:123`
- 相关文件：
  - `src/app/(console)/admin/models/page.tsx`
  - `src/app/api/admin/models-channels/route.ts`
- 建议移交：前端 + API 负责人

### GAP-003 开发者视图的服务商名称与原型不一致，使用了模型前缀推断值

- 严重级别：`P2`
- 页面/模块：`/models`
- 原型期望：
  - 开发者视图按服务商卡片展示
  - 服务商名称应与原型一致，例如 `OpenRouter`、`Zhipu AI`
- 当前实际：
  - 页面通过模型 ID 前缀截断后再 `capitalize` 生成服务商名
  - 会得到 `Openrouter`、`Zhipu` 等非原型文案
  - `/v1/models` 接口也未提供 provider display name
- 差距类型：`文案`
- 影响：
  - 页面标题与原型、品牌名称不一致
  - 在多词 provider 上会造成误导
- 证据：
  - 原型：`docs/mockups/models-channels-mockup.html:285`
  - 原型：`docs/mockups/models-channels-mockup.html:295`
  - 实现：`src/app/(console)/models/page.tsx:38`
  - 实现：`src/app/(console)/models/page.tsx:43`
  - 实现：`src/app/(console)/models/page.tsx:70`
  - 实现：`src/app/(console)/models/page.tsx:138`
  - 实现：`src/app/api/v1/models/route.ts:29`
- 相关文件：
  - `src/app/(console)/models/page.tsx`
  - `src/app/api/v1/models/route.ts`
- 建议移交：前端 + API 负责人

## 6. 待确认事项

- 原型要求开发者视图改为两层折叠：
  - `docs/mockups/models-channels-mockup.html:322`
- P1.1 文档又写“开发者看到的还是扁平列表”：
  - `docs/AIGC-Gateway-P1.1-Documents/AIGC-Gateway-P1-Optimization-Prompt.md:149`
- 这两份规格冲突，当前实现做成了两层分组；建议产品/设计先确认最终基线，再决定是否计为实现缺陷。

## 7. 不在本次范围内

- 未检查其他 mockup 或其他页面
- 未验证响应式表现、hover/focus、空态/错误态、真实同步结果展示
- 未对数据库实际数据做抽样验证

## 8. 结论

- 是否建议进入修复：建议
- 是否建议重新验收：建议在修复后重新验收 `/admin/models`
- 备注：本次仅输出审查结果，未做任何代码修改。

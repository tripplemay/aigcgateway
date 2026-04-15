# UI-UNIFY-FIX-2 批次规格文档

**批次代号：** UI-UNIFY-FIX-2
**目标：** 全面推广 UI-UNIFY 定义但未被采用的公共组件，消除用户端 12 页面的手写卡片
**触发时机：** AUDIT-FOLLOWUP 签收后启动
**规模：** 6 个 generator + 1 个 codex 验收 = 7 条

## 背景

UI-UNIFY 定义了 10 个公共组件，UI-UNIFY-FIX 只修了 PageContainer size / PageHeader badge / heading scale / gradient button，但**没有检查内容区组件（SectionCard/TableCard/KPICard/StatusChip/CTABanner）的实际采用率**。后续审查发现：

### SectionCard：0/12 页面采用（组件被遗忘）

手写 `bg-ds-surface-container-lowest rounded-xl|2xl ...` 的 section 共 ~47 处，分布：
- dashboard 7 处（rounded-2xl，唯一 radius 对的）
- settings 17 处（rounded-xl p-8）
- models 5 处（rounded-xl p-6 + 自定义 `shadow-[0px_20px_40px...]`）
- balance 5 处（同上）
- usage 3 处（rounded-xl p-8）
- mcp-setup 4 处（rounded-xl p-8 + 12 列 bento）
- quickstart 5 处（StepCard: rounded-xl p-6 + ring-1 ring-slate-100）
- templates 1 处（剩余一个手写 section）

### TableCard：3 个表格页面未采用

- **balance** — 交易流水表格
- **settings** — 模型日志表格
- **usage** — 按模型用量表格

### KPICard：2/12 页面采用，其余手写

dashboard / balance / usage 共 ~10 个指标卡全部手写 `text-xs uppercase tracking-widest + 大字号数字`。

### StatusChip：3 文件采用，5 处手写

- actions:195 `px-2 py-1 bg-indigo-50 text-indigo-600 rounded text-[10px] font-black`
- balance:280 `px-2 py-1 rounded text-[10px] font-bold uppercase`
- mcp-setup:400 `px-1.5 py-0.5 bg-ds-surface-container-low rounded text-[10px] font-bold uppercase`
- models:290/295 两处 modality/warning chip 手写

### CTABanner：视觉不统一

- actions 使用 `<CTABanner>`（深色 `#131b2e` + radial-gradient，设计系统标准）
- templates 手写 `from-ds-primary to-ds-primary-container` 渐变 CTA（另一种视觉）

两个页面切换时用户会明显感觉不同。

### Button gradient-primary：quickstart 剩余 1 处手写

`quickstart/page.tsx:143` 手写渐变按钮。

## Features

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-UF2-01 | SectionCard 替换全部手写内容卡片 | high | 1) dashboard/models/balance/usage/settings/mcp-setup/quickstart/templates 全部改用 `<SectionCard>` 作为内容卡壳；2) 保留每个页面的独特内部布局（mcp-setup bento / quickstart 编号圆圈 / dashboard 多 section）；3) 消除自定义 `shadow-[0px_20px_40px...]` 阴影，统一为 SectionCard 的 `shadow-sm`；4) 消除 `ring-1 ring-slate-100`，统一为 `border-slate-200/5`；5) grep 验证：`grep -rnE 'bg-ds-surface-container-lowest[^"]*rounded-(xl\|2xl)' src/app/(console)/*/page.tsx` 应返回 0 行；6) tsc 通过；7) 回归测试覆盖所有页面渲染 |
| F-UF2-02 | balance / settings / usage 3 页改用 TableCard | high | 1) balance 交易流水 / settings 模型日志 / usage 按模型用量 三个表格改用 `<TableCard>`；2) 保留现有 Table 列定义和数据源；3) 搜索、分页、header 操作区用 TableCard 的 slot；4) grep 验证：三个文件中 `<Table ` 父级必须是 `<TableCard>`；5) tsc 通过 |
| F-UF2-03 | KPICard 替换手写指标卡 | medium | 1) dashboard（5 个）/ balance（余额大卡 + 告警阈值）/ usage（4 个指标）全部改用 `<KPICard>`；2) 保留原有 label/value/trend 数据；3) 若 KPICard API 不足（如缺 trend 子组件），允许扩展组件 API；4) grep 验证：各页面不应再出现 `text-xs.*uppercase.*tracking-widest` 手写 label；5) tsc 通过 |
| F-UF2-04 | StatusChip 替换 5 处手写状态胶囊 | medium | 1) actions:195（v1 版本胶囊）/ balance:280（交易类型）/ mcp-setup:400（工具标签）/ models:290/295（modality + warning）全部改用 `<StatusChip>`；2) 如果 variant 不足（如 info 变体），扩展组件；3) grep 验证：`px-.*py-.*rounded.*text-\[10px\].*font-(bold|black).*uppercase` 手写模式应为 0 处；4) tsc 通过 |
| F-UF2-05 | templates CTA 改用 CTABanner | medium | 1) templates/page.tsx:304-316 手写的 `from-ds-primary to-ds-primary-container` 渐变 CTA 改用 `<CTABanner>`；2) 两个页面的 CTA 视觉统一为深色 `#131b2e` 设计系统标准；3) tsc 通过 |
| F-UF2-06 | quickstart 剩余手写按钮改 variant | low | 1) quickstart/page.tsx:143 手写的 `bg-gradient-to-r from-ds-primary to-ds-primary-container...` 按钮改为 `<Button variant="gradient-primary">`；2) tsc 通过 |
| F-UF2-07 | UI-UNIFY-FIX-2 全量验收 | high | codex 执行：1) SectionCard 在 8 个页面采用；2) TableCard 在 3 个新增页面采用；3) KPICard / StatusChip / CTABanner 全部替换完毕；4) grep 机械化验证（手写模式数量）；5) 12 个用户端页面视觉一致性人工复核；6) 签收报告生成 |

## 推荐执行顺序

1. **F-UF2-01 SectionCard**（最影响视觉，规模最大）
2. **F-UF2-02 TableCard**（3 个页面统一）
3. **F-UF2-03 KPICard**（集中在 dashboard/balance/usage）
4. **F-UF2-04 StatusChip**（5 处机械替换）
5. **F-UF2-05 CTABanner**（1 处）
6. **F-UF2-06 Button variant**（1 处）
7. **F-UF2-07** 验收

## 不在本批次范围

- **admin 端 9 个页面** → 独立 BL-129 ADMIN-UI-UNIFY 批次
- 新组件创建（本批次只用现有组件）

# UI-UNIFY-FIX 批次规格文档

**批次代号：** UI-UNIFY-FIX
**目标：** 收尾 UI-UNIFY 未彻底执行的部分，消除生产环境仍然存在的页面不一致
**触发时机：** DOCS-REFRESH 签收后立即启动
**规模：** 5 个 generator + 1 个 codex 验收 = 6 条

## 背景

生产验证发现 UI-UNIFY 完成签收后仍有视觉不一致：
- settings 用了 narrow，但同样有大量表格的 keys 用 default
- mcp-setup 用了 default，但内容是阅读型应该用 narrow
- keys/mcp-setup 单独带 PageHeader badge，其他 10 个页面都不带
- keys 的"创建 API Key"按钮埋在 TableCard，而非 PageHeader.actions
- F-UU-12 定义的 `.heading-1/2/3` 工具类几乎没人用，section h2 仍手写至少 3 种字号
- F-UU-06 的 `Button variant="gradient-primary"` 只有 2 个页面在用，其他 4 个页面手写 plain `bg-ds-primary`

根因：UI-UNIFY 阶段 Generator 完成了组件抽取，但页面改造时只搬了"外层 PageContainer + PageHeader"，内部细节没贯彻。

## Features

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-UF-01 | PageContainer size 选择修正 | high | 1) settings 从 size='narrow' 改为默认 default（max-w-7xl）；2) mcp-setup 从默认 default 改为 size='narrow'（max-w-5xl）；3) 其他页面 size 不变；4) tsc 通过 |
| F-UF-02 | 统一 PageHeader badge 规则 | medium | 1) 移除 keys 的 'infrastructureSecurity' badge；2) 移除 mcp-setup 的 badge；3) 所有 12 个 console 页面 PageHeader 不再使用 badge prop（保留组件 API 供未来按需用）；4) tsc 通过 |
| F-UF-03 | keys 的"创建 API Key"按钮提到 PageHeader.actions | medium | 1) keys/page.tsx 把当前埋在 TableCard 内的"创建 API Key"按钮移到 PageHeader 的 actions prop；2) 与 actions/templates/models 等使用 PageHeader.actions 的页面一致；3) 按钮样式统一使用 Button variant='gradient-primary'（关联 F-UF-05）；4) tsc 通过 |
| F-UF-04 | section h2/h3 改用 .heading-2/.heading-3 工具类 | high | 1) settings 8 处 text-xl font-bold 的 section h2 改为 .heading-2；2) templates/balance/quickstart 各 1 处 text-lg font-extrabold 的 h3 改为 .heading-3；3) mcp-setup 3 处 text-lg font-bold 改为 .heading-2 或 .heading-3；4) models 1 处 text-xl 改为 .heading-2；5) 全 console 不允许出现手写 text-xl/text-lg + font-bold/font-extrabold 在 section 标题上；6) tsc 通过 |
| F-UF-05 | 主按钮统一为 Button variant='gradient-primary' | medium | 1) keys 'create key' 按钮、balance 'recharge' 按钮、settings 3 处主按钮、mcp-setup 'copy config' 按钮全部改用 Button variant='gradient-primary'；2) 移除手写的 bg-ds-primary text-white rounded-lg 等内联样式；3) 不破坏现有交互（onClick/disabled/loading 状态）；4) tsc 通过 |
| F-UF-06 | UI-UNIFY-FIX 全量验收 | high | codex 执行：1) 12 个 console 页面 size 选择正确；2) PageHeader 无 badge；3) keys 主按钮在 PageHeader.actions；4) 所有 section h2/h3 使用 .heading-2/.heading-3 工具类（grep 验证）；5) 所有主按钮使用 gradient-primary variant（grep 验证）；6) 签收报告生成 |

## 推荐执行顺序

1. **F-UF-01**（最影响视觉）— size 修正
2. **F-UF-02**（视觉清理）— 移除多余 badge
3. **F-UF-04**（核心清理）— section h2/h3 统一
4. **F-UF-05**（按钮统一）— gradient variant 普及
5. **F-UF-03**（最后做）— keys 按钮移位（依赖 F-UF-05 完成）
6. **F-UF-06** — 验收

## 验证手段（Evaluator 必查）

```bash
# 1) 不应有任何 PageContainer 用错 size（人工眼检 settings 和 mcp-setup）
# 2) PageHeader badge 应为 0 处
grep -rn 'badge=' src/app/\(console\)/*/page.tsx | grep -v admin

# 3) section 标题不应再手写
grep -rnE '<h2[^>]*text-(xl|lg)[^>]*font-(bold|extrabold)' src/app/\(console\)/*/page.tsx

# 4) 主按钮不应再手写 bg-ds-primary text-white
grep -rn 'bg-ds-primary text-white' src/app/\(console\)/*/page.tsx
```

## 启动条件

- DOCS-REFRESH 签收完成（F-DR-04 codex 验收通过）
- 本规格转正为 features.json + progress.json

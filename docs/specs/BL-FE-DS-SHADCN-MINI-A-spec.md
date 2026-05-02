# BL-FE-DS-SHADCN-MINI-A Spec

**批次：** BL-FE-DS-SHADCN-MINI-A（admin 三页 raw HTML → shadcn 组件壳替换）
**负责人：** Planner / Generator = 默认映射 / Evaluator = 默认映射
**创建：** 2026-05-03
**工时：** 0.5–1 day
**优先级：** medium
**前置：** BL-SYNC-INTEGRITY-PHASE2 已 done（依赖解锁）
**关联：**
- 来源：`docs/code-review/frontend-ds-2-shadcn-adoption.md`（2026-04-17 audit）
- 来源 backlog：BL-FE-DS-SHADCN（low-deferred）的 Mini-A 拆分
- 工程纪律：CLAUDE.md "shadcn 渗透 — 触及即替换"（2026-05-02 立）

## 背景

2026-04-17 audit 发现 admin 多页大量 raw HTML 元素未使用 shadcn 组件。期间多个批次（FE-QUALITY、ADMIN-ALIAS-UX-PHASE1 等）顺手清掉了最高 a11y 价值的 9 个 hand-rolled dialogs，但下列 3 个高频 admin 页仍有大量残留 raw `<input>/<select>/<textarea>/<button>/<table>`：

| 文件 | input/textarea/select | button | table |
|---|---|---|---|
| `src/app/(console)/admin/reconciliation/page.tsx` | 9 | 8 | 1（明细表 line 487） |
| `src/app/(console)/admin/providers/page.tsx` | 13 | 12 | 1（明细表 line 273） |
| `src/app/(console)/admin/model-aliases/page.tsx` | 21 | 14 | 1（unlinkedModels 表 line 1090） |

完整 BL-FE-DS-SHADCN（2d，15+ 文件）边际收益低、UI 回归面广，仍 deferred。Mini-A 只动这 3 个最高价值文件，"触及即替换"范式逐文件独立 commit 便于回滚。

## 目标

1. 将 3 个 admin 页内**全部** raw `<input>/<textarea>/<select>` 替换为 shadcn `<Input>/<Textarea>/<Select>`
2. 将明细表 raw `<table>` 替换为 shadcn `<Table>` family（含 admin/model-aliases 的 unlinkedModels 表）
3. 将行内非主操作 raw `<button>` 替换为 shadcn `<Button>`（主 CTA 保留 raw 减少视觉跳动）
4. 完成后 admin 三页 raw `<input>/<textarea>/<select>` 计数清零，raw `<table>` 计数清零

## 非目标

- 不动其他页面（settings/actions-new/admin-operations 等留原 BL-FE-DS-SHADCN）
- 不重构布局结构（仅组件壳替换）
- 不改 a11y / i18n / 现有交互行为
- 不改业务逻辑、API、数据流
- 不替换主 CTA `<button>`（如"导出 CSV"、"添加 Provider"等顶部突出按钮，保留 raw 减少视觉跳动）
- 不动 ChannelTable 组件本体（model-aliases line 1000，PHASE1 已组件化）

## 关键设计决策

### D1：组件映射规则

| Raw 元素 | shadcn 替代 | 注意 |
|---|---|---|
| `<input type="text">` | `<Input>` | 保留所有 `className` ds-* token，组件继承 |
| `<input type="search">` | `<Input type="search">` | 同上 |
| `<input type="number">` | `<Input type="number">` | 同上 |
| `<input type="date">` | `<Input type="date">` | 同上 |
| `<textarea>` | `<Textarea>` | 同上 |
| `<select>` + `<option>` | `<Select>` + `<SelectTrigger>` + `<SelectContent>` + `<SelectItem>` | shadcn 是 Radix 受控组件，需调整 `value`/`onValueChange` API；保留 `disabled`/`name`/i18n 文案 |
| 行内非主 `<button>`（图标按钮、行操作、分页页码） | `<Button variant="ghost"\|"outline">` | 保留 onClick / disabled / aria-label |
| 主 CTA `<button>`（顶部按钮、表单提交） | **保留 raw** | 减少视觉跳动 |
| `<table>`（含 thead/tbody/tr/th/td） | `<Table><TableHeader><TableRow><TableHead>...<TableBody><TableRow><TableCell>` | 保留 className ds-* token |

### D2：Select 组件 API 迁移

shadcn `<Select>` 是 Radix 受控组件，与 native `<select>` 在 API 上有差异：

```tsx
// Before (native)
<select value={tier} onChange={(e) => setTier(e.target.value)}>
  <option value="all">{t("all")}</option>
  <option value="1">{t("tier1")}</option>
</select>

// After (shadcn)
<Select value={tier} onValueChange={setTier}>
  <SelectTrigger><SelectValue /></SelectTrigger>
  <SelectContent>
    <SelectItem value="all">{t("all")}</SelectItem>
    <SelectItem value="1">{t("tier1")}</SelectItem>
  </SelectContent>
</Select>
```

**注意：** shadcn `<Select>` 不支持 `value=""`（空字符串触发 placeholder），如有空 string 选项需改成 sentinel value（如 `"__all__"`）并在 onChange/读取处转换。

### D3："触及即替换"范式 + 行级原则

每个文件独立 commit + 独立 PR/push，便于回滚。Generator 必须：
- 改一个文件，跑 `npx tsc --noEmit` PASS，`npm run build` PASS，再独立 commit
- commit message 标注 `feat(BL-FE-DS-SHADCN-MINI-A F-MAS-XX): <file> raw → shadcn`
- 在 commit 描述附改造前后视觉对比说明（同一页面跑 dev server 截图前后对照，文字描述差异；如有像素跳动列出）

### D4：admin/model-aliases unlinkedModels 表（line 1090）替换确认

backlog decision 原文 "admin/model-aliases 表已 ChannelTable 不动"假定只有一张表。实际有第二张 raw `<table>`（unlinkedModels 行 1090，被 `<TableCard>` 包壳但内层是 raw）。**已与用户确认走 B：替换 unlinkedModels raw `<table>` 为 shadcn `<Table>`**，ChannelTable 仍不动。

### D5：测试与验证

无新单测要求（纯组件壳替换，行为不变）。验收依赖：
- `npx tsc --noEmit` PASS
- `npm run build` PASS（容忍既有非阻断 warning）
- Generator 自截 dev server 改造前后视觉对比，附 commit 说明
- Codex 验收：访问 dev server 三个页面，验证：
  - 3 个文件 grep 后 raw `<input>/<textarea>/<select>` 计数 = 0
  - admin/reconciliation 与 admin/providers 明细表 raw `<table>` 计数 = 0
  - admin/model-aliases unlinkedModels raw `<table>` 计数 = 0（ChannelTable 内部不计）
  - 中英双语 toggle 正常
  - 表单提交、过滤、排序、分页等交互行为与改造前一致

## Features 拆分

### F-MAS-01: admin/reconciliation/page.tsx 重构

**executor:** generator
**优先级：** medium
**工时：** S（~1.5h）

**范围：**
- 全部 9 处 raw `<input>` → `<Input>`（line 370/381/418/429/467/474/555 + 阈值配置区 2 处）
- 全部 2 处 raw `<select>` → `<Select>`（line 457/616）
- 行内非主 `<button>` → `<Button variant="ghost">`（分页页码 line 491、排序按钮、行操作；line 354/389/403/577/628/635 中主 CTA 保留 raw）
- raw `<table>` line 487 → shadcn `<Table>` + `<TableHeader>` + `<TableBody>` + `<TableRow>` + `<TableHead>` + `<TableCell>`，保留所有 className

**验收：**
1. 文件 raw `<input>/<textarea>/<select>` 计数 = 0
2. 文件明细 raw `<table>` 计数 = 0
3. `npx tsc --noEmit` PASS
4. `npm run build` PASS
5. dev server 跑 `/admin/reconciliation`：日期范围 picker / Tier 切换 / 模型搜索 / 分页大小切换 / CSV 导出 / 阈值保存 全部交互正常
6. 中英双语 toggle 文案正常
7. 视觉对比改造前后：附 commit 描述，列出像素差异（如有）
8. 独立 commit + push，commit message 标注 `feat(BL-FE-DS-SHADCN-MINI-A F-MAS-01): admin/reconciliation raw → shadcn`

### F-MAS-02: admin/providers/page.tsx 重构

**executor:** generator
**优先级：** medium
**工时：** M（~2h）

**范围：**
- 全部 9 处 raw `<input>` → `<Input>`
- 全部 3 处 raw `<select>` → `<Select>`
- 1 处 raw `<textarea>` → `<Textarea>`（line 658）
- 行内非主 `<button>`（toggle/edit/delete 行操作 line 319/327/333/347/526/532/551/737/746）→ `<Button variant="ghost"|"outline">`；主 CTA（"添加 Provider"等 line 372/668/674）保留
- raw `<table>` line 273 → shadcn `<Table>` family

**验收：** 同 F-MAS-01 验收 1-8，对应 `/admin/providers` 页面（toggle/编辑/删除/批量操作交互正常）。

### F-MAS-03: admin/model-aliases/page.tsx 残留 raw 表单 + unlinkedModels 表

**executor:** generator
**优先级：** medium
**工时：** M（~3h，文件最大）

**范围：**
- 全部 16 处 raw `<input>` → `<Input>`
- 全部 5 处 raw `<select>` → `<Select>`
- 行内非主 `<button>` → `<Button variant="ghost"|"outline">`（line 489/495/534/545/714/729/934/963/984/1030/1039/1045/1115/1242/1252 中行操作类）；主 CTA（顶部 "添加 alias" 等 line 1219）保留
- raw `<table>` line 1090（unlinkedModels）→ shadcn `<Table>` family
- **不动 ChannelTable 组件本体**（line 1000 引用）

**验收：** 同 F-MAS-01 验收 1-8，对应 `/admin/model-aliases` 页面：
- alias CRUD / 启用切换 / 售价编辑 / channel 关联 / 删除 alias 等交互正常
- ChannelTable 行为完全不变
- unlinkedModels 表渲染、关联操作正常

### F-MAS-04: Codex 验收 + 签收报告

**executor:** codex
**优先级：** high
**工时：** S（~1h）

**验收：**
1. `bash scripts/test/codex-setup.sh` + `codex-wait.sh` PASS
2. F-MAS-01/02/03 验证：
   - 三个文件 grep `<(input|textarea|select)\b` 计数 = 0（仅可能保留 shadcn 内部使用的 `<input>` 由组件实现内部，不在业务页面文件计入）
   - admin/reconciliation 与 admin/providers 明细表 + admin/model-aliases unlinkedModels 表 grep `<table\b` 计数 = 0
3. 视觉验收（dev server 三页面访问）：
   - `/admin/reconciliation`：日期 / Tier / 搜索 / 分页 / CSV / 阈值 全部交互正常
   - `/admin/providers`：CRUD / toggle / 删除 / 批量 全部交互正常
   - `/admin/model-aliases`：alias CRUD / 售价 / channel 关联 / unlinkedModels 关联 全部交互正常；ChannelTable 行为不变
4. i18n：三页 zh-CN / en 切换文案正常
5. a11y：tab 键导航 / Escape 关闭 / aria 属性保留（shadcn 默认含 ARIA）
6. `npx tsc --noEmit` PASS
7. `npm run test` PASS（前端无新单测要求，仅运行既有测试不退回归）
8. `npm run build` PASS（接受现有非阻断 warning）
9. 输出 `docs/test-reports/BL-FE-DS-SHADCN-MINI-A-signoff-YYYY-MM-DD.md` 含上述命令证据 + 视觉对比说明 + 结论 PASS/FAIL

## Risks

1. **Select API 不兼容空 string：** D2 已声明 sentinel value 方案，Generator 实施时严格执行
2. **明细表大量 className 迁移：** Generator 需逐 td/th 保留 className，避免遗漏 ds-* token，导致视觉跳动 → mitigations: dev server 截图对比强制
3. **行内 button 与主 CTA 边界主观：** 已在 spec 列出每行号是否替换；Generator 遇到边界模糊场景，**保留 raw**（更保守，回归风险小）
4. **shadcn `<Input>` 默认 className 与现有 ds 体系样式叠加可能冲突：** Generator 需在替换后跑 dev server 视觉对比，遇明显跳动则用 `cn()` 显式覆盖

## 退出条款

无。本批次范围已极小，不允许中途扩展（如发现额外文件需要替换，记入 `.auto-memory/proposed-learnings.md` 留待原 BL-FE-DS-SHADCN 启动时处理）。

## 上线流程

1. Generator F-MAS-01/02/03 各独立 commit + push 到 main
2. Codex F-MAS-04 验收，PASS 后写 signoff
3. Planner done 阶段更新记忆 / 处理 proposed-learnings / 询问下一批次
4. **不需要部署**（前端纯 build-time refactor，下次部署批次顺带上线）

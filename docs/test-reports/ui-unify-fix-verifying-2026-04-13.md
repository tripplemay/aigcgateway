# UI-UNIFY-FIX 首轮验收报告（verifying）

## 测试目标
按 `F-UF-06` 验收 UI-UNIFY-FIX 批次是否满足以下要求：
1. 12 个 console 页面 size 选择正确
2. PageHeader 无 badge 残留
3. keys 主按钮位于 PageHeader.actions
4. section 标题统一使用 `.heading-2/.heading-3`
5. 主按钮统一 `gradient-primary`
6. 12 页面运行态可访问（L1）

## 测试环境
- 层级：L1 本地
- 地址：`http://localhost:3099`
- 启动方式：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- 执行时间：2026-04-13

## 测试产物
- 验收脚本：`scripts/test/_archive_2026Q1Q2/ui-unify-fix-fuf06-verifying-e2e-2026-04-13.ts`
- 结果 JSON：`docs/test-reports/ui-unify-fix-fuf06-verifying-e2e-2026-04-13.json`

## 执行结果
- 总计：6 项
- 通过：5
- 失败：1
- 结论：`FAIL`

### 通过项
- AC1 通过：`settings` 使用默认 `PageContainer`，`mcp-setup` 使用 `size="narrow"`
- AC2 通过：12 页面无 `PageHeader badge` 残留
- AC3 通过：`keys` 创建按钮已在 `PageHeader.actions`，且使用 `gradient-primary`
- AC5 通过：主按钮 `gradient-primary` 统一项通过（允许 balance 类型筛选胶囊保留 `bg-ds-primary text-white`）
- AC6 通过：12 页面登录态运行时访问均为 `200`

### 失败项
- AC4 失败：`balance` 页面仍存在手写 section 标题样式，未统一为 `.heading-2/.heading-3`
  - 证据位置：
    - `src/app/(console)/balance/page.tsx:194` → `h3` 使用 `font-bold text-lg`
    - `src/app/(console)/balance/page.tsx:232` → `h3` 使用 `font-bold text-xl`
  - 预期：按 F-UF-04/F-UF-06，section 标题应使用 `.heading-2` 或 `.heading-3` 工具类

## 风险评估
- 当前失败属于 UI 规范一致性回归，不影响接口功能。
- 若不修复，将继续破坏 UI-UNIFY 统一标准，并导致本批次无法签收。

## 建议流转
- `verifying -> fixing`
- 请 generator 修复 `balance` 页面 section 标题类名后，进入 `reverifying`。

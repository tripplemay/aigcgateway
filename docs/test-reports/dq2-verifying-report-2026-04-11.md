# DQ2 首轮验收报告（verifying）

- 批次：DQ2-alias-quality-pricing
- 执行阶段：verifying
- 执行时间：2026-04-11
- 执行环境：L1 本地（http://localhost:3099）
- 执行人：Codex Reviewer

## 测试目标
验证 DQ2 的别名数据质量与定价体系改造是否满足 `docs/specs/DQ2-alias-quality-pricing-spec.md` 与 `features.json` 验收标准。

## 执行摘要
- 通过：6
- 失败：1
- 结论：未通过，流转至 `fixing`

## 通过项
- F-DQ2-01 capabilities 统一（去 `image_input`，含 `reasoning/search`）
- F-DQ2-05 参考定价接口与绑定回填流程
- F-DQ2-04 汇率配置读写生效（`/api/admin/config` + `/api/exchange-rate`）
- F-DQ2-06 充值 CNY 输入与后端 USD 存储换算
- F-DQ2-08 服务商 adapter 预填充完整性
- TypeScript 编译检查（`npx tsc --noEmit`）

## 失败项
- 功能：F-DQ2-07（全站人民币显示 — 日志+Models+Admin）
- 结果：FAIL
- 证据：
  - `src/app/(console)/models/page.tsx` 未使用统一 `formatCNY`
  - `src/app/(console)/admin/models/page.tsx` 未使用统一 `formatCNY`
  - 两处仍使用页面内 `fmtPriceSplit/fmtPrice` 本地格式化 + 汇率乘算，未达成“统一工具函数”验收约束

## 风险
- 同一系统存在多套金额格式化路径，后续汇率口径、千分位、精度和符号规则可能发生页面间不一致。

## 产物
- 自动化脚本：`scripts/test/_archive_2026Q1Q2/dq2-verifying-e2e-2026-04-11.ts`
- 结构化结果：`docs/test-reports/dq2-verifying-e2e-2026-04-11.json`

## 最终结论
DQ2 首轮验收未通过。请 generator 修复 F-DQ2-07 后进入 `reverifying`。

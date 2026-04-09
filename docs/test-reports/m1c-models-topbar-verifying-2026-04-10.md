# M1c 验收报告（verifying）

## 测试目标
验证 M1c 批次（Models 页面重做 + Topbar 清理 + 终端区英文固定）是否满足 `features.json` 中 F-M1c-01 ~ F-M1c-06 的验收标准。

## 测试环境
- 阶段：L1 本地验收
- 地址：`http://localhost:3099`
- 启动检查：`bash scripts/test/codex-wait.sh` Ready
- 执行脚本：`npx tsx scripts/test/m1c-models-topbar-verifying-e2e-2026-04-10.ts`
- 结果文件：`docs/test-reports/m1c-models-topbar-verifying-e2e-2026-04-10.json`

## 测试范围
- AC1 Models API + 页面结构关键点
- AC2 Topbar 清理与头像下拉可用性
- AC4 认证页终端英文固定
- AC5 设计系统（DS token）一致性
- AC6 i18n 残留检查

## 执行结果概览
- PASS：5
- FAIL：1
- 结论：本轮不签收，进入 `fixing`

## 通过项
- AC1：`/v1/models` 返回 200，未发现 `provider_name` 泄露字段
- AC1-design：Models 页按 brand 分组与表格骨架存在
- AC2：Topbar 已移除 Deploy/搜索/暗色切换入口；头像下拉包含 Settings + Sign Out
- AC4：login/register 终端模拟区保留英文文案
- AC6：未发现 topbar/models 相关中文硬编码残留

## 失败项
### F-M1c-06 / AC5 — DS token 一致性 FAIL
- 严重级别：Medium
- 稳定复现：是
- 现象：M1c 涉及页面存在硬编码色值与原始色阶 utility class，未统一使用 DS token。

复现证据（静态检查 + 文件定位）：
- `src/app/(console)/models/page.tsx`
  - 硬编码品牌色：第 29-37 行（如 `#000000`, `#D85A30`, `#4285F4`）
  - 硬编码兜底色：第 214 行（`#888780`）
  - 非 DS 色阶 class：第 54-58 行、297 行、336 行（`indigo/emerald/amber/pink/green`）
- `src/components/top-app-bar.tsx`
  - 硬编码色值：第 55/61/67 行（`hover:text-[#5443b9]`）
  - 非 DS 色阶 class：第 49/55/61/67/83/93/101/106 行（`slate-*`）

## 风险项
- 视觉规范漂移：后续主题切换与品牌一致性维护成本上升。
- 设计系统失真：同一页面出现 token 与 raw color 混用，验收不可预测。

## 最终结论
- 当前批次在 AC5 未通过，`verifying` 结论为 FAIL。
- 建议 Generator 修复 DS token 一致性后，由 Codex 进入 `reverifying` 复验。

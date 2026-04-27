# BL-RECON-UX-PHASE1 验收报告（verifying / FAILED）

- 批次：`BL-RECON-UX-PHASE1`
- 阶段：`verifying`
- 验收人：`Reviewer (Codex)`
- 结论：`15/16 通过，1 项阻断`（`F-RC-03` 未通过）

## 总览
- 静态 3 项：PASS
- API 行为 6 项：PASS
- 前端冒烟 5 项：`4 PASS + 1 FAIL`
- i18n 1 项：PASS
- 报告 1 项：本文件

## 详细结果（F-RC-03）
1. `npx tsc --noEmit`：PASS
2. `npm run build`：PASS
3. `npx vitest run`：PASS（`61 files / 441 tests`）
4. 列表默认 `sort=desc`：PASS
5. `sort=asc&page=1&pageSize=5` + `meta.total>5`：PASS
6. `tier=1` 仅 Tier1 provider：PASS
7. `modelSearch=GPT` 大小写不敏感：PASS
8. `export?status=BIG_DIFF` 返回 CSV+BOM+header：PASS
9. `export` 超 10000 行返回 400：PASS
10. 页面默认首行为最新日期：PASS
11. 改 date picker 后列表收窄：PASS（`meta.total 12054 -> 3458`，当前页因 pageSize=50 保持 50 行）
12. 切 Tier 1 后仅 Tier1 数据：PASS
13. 阈值改 `MATCH |Δ|<0.1` 后手动重跑触发状态变化：**FAIL（阻断）**
14. 导出 CSV 按钮触发下载：PASS
15. 切 zh-CN 后表头与阈值区块中文显示：PASS
16. 报告产出：PASS

## 阻断项（按严重度）
- `F-RC-03 / tc13`：手动重跑未写入新对账行，无法观察到 MATCH->MINOR_DIFF 变化。
  - 复现：
    1) 阈值保存 `RECONCILIATION_MATCH_DELTA_USD=0.1`（已落库）
    2) 调 `POST /api/admin/reconciliation/rerun { date: "2026-04-27" }`
    3) 返回 `200`，但 `rowsWritten=0`、`bigDiffs=0`
    4) `status=MATCH` 总量不变（`12022`）
  - 证据：本地日志显示 Tier1/Tier2 fetcher 因 billing/auth key 缺失被跳过，属于上游账单抓取前置条件不足。
  - 判定：当前本地 L1 环境无法完成该项闭环验证，需补齐可用 provider billing 凭证或在 staging（有真实 key）执行。

## 证据文件
- `docs/test-reports/artifacts/bl-recon-ux-phase1-2026-04-27-codex-verifying/tsc.log`
- `docs/test-reports/artifacts/bl-recon-ux-phase1-2026-04-27-codex-verifying/build.log`
- `docs/test-reports/artifacts/bl-recon-ux-phase1-2026-04-27-codex-verifying/vitest.log`
- `docs/test-reports/artifacts/bl-recon-ux-phase1-2026-04-27-codex-verifying/api-checks.json`
- `docs/test-reports/artifacts/bl-recon-ux-phase1-2026-04-27-codex-verifying/recheck-11-13.json`
- `docs/test-reports/artifacts/bl-recon-ux-phase1-2026-04-27-codex-verifying/codex-setup.log`
- `docs/test-reports/artifacts/bl-recon-ux-phase1-2026-04-27-codex-verifying/codex-wait.log`
- `docs/test-reports/artifacts/bl-recon-ux-phase1-2026-04-27-codex-verifying/ui-default-list.png`
- `docs/test-reports/artifacts/bl-recon-ux-phase1-2026-04-27-codex-verifying/ui-tier1-filter.png`
- `docs/test-reports/artifacts/bl-recon-ux-phase1-2026-04-27-codex-verifying/ui-export-filter-bigdiff.png`
- `docs/test-reports/artifacts/bl-recon-ux-phase1-2026-04-27-codex-verifying/ui-zh-cn.png`

## 结论
- F-RC-01 / F-RC-02 代码质量与功能实现在 L1 验收中总体通过。
- F-RC-03 尚有 1 项阻断（tc13），建议进入 `fixing`：明确 L2 验收路径（staging + 有效账单凭证）或调整本地可验证策略。

# AUDIT-SEC Signoff 2026-04-13

> 状态：**已通过 Evaluator 验收（reverifying）**
> 触发：fix round 1 后复验 `F-AS-05 free_only`，并执行全量回归确认无回归

---

## 变更背景

本批次聚焦安全与数据一致性修复：上游错误脱敏、不可用模型过滤、image `supportedSizes` 回填、image 计费、`free_only` 过滤、日志 XSS 转义、`size` 预校验。

---

## 复验范围与结果

- 复验脚本：`scripts/test/_archive_2026Q1Q2/audit-sec-verifying-e2e-2026-04-13.ts`
- 原始证据：`docs/test-reports/audit-sec-verifying-local-e2e-2026-04-13.json`
- 环境：`http://localhost:3099`（L1 本地）

### F-AS-05（目标复验项）

- 结果：**PASS**
- 证据：`restFreeCount=1 mcpFreeCount=1`
- 结论：`free_only=true` 已正确包含 `perCall=0` 的 image 模型，且 MCP 与 REST 行为一致。

### 全量回归（F-AS-01 ~ F-AS-07）

- 结果：**PASS（10/10）**
- 关键验证：
  - 错误脱敏无上游信息泄露（REST/MCP）
  - 不可用模型不出现在 `list_models`
  - image 模型 `supportedSizes` 完整
  - image 成功调用后 `cost>0` 且余额扣减
  - 日志详情中 prompt/response 已转义（无原始 `<script>`）
  - 无效尺寸返回 `invalid_size` 且包含支持尺寸列表（REST/MCP）

---

## 未变更范围

| 事项 | 说明 |
|---|---|
| 生产环境回填脚本执行 | `backfill-supported-sizes.ts --apply` 仍需在生产侧单独执行 |

---

## Harness 说明

本批次按 Harness 状态机完成至签收：`planning → building → verifying → fixing → reverifying → done`。
`progress.json` 已更新为 `status: "done"`，`docs.signoff` 已写入本报告路径。

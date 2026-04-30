# DX-POLISH Signoff 2026-04-13

> 状态：**已通过 Evaluator 验收（verifying）**
> 触发：F-DP-12 全量验收完成（L1 本地）

---

## 测试目标

验证 DX-POLISH 批次 11 个 generator 功能在本地测试环境可用，并确认 `list_models / chat / list_logs` 全链路无回归。

## 测试环境

- Base URL: `http://localhost:3099`
- 启动方式：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- 验收脚本：`scripts/test/_archive_2026Q1Q2/dx-polish-verifying-e2e-2026-04-13.ts`
- 原始报告：`docs/test-reports/dx-polish-verifying-local-e2e-2026-04-13.json`

## 验收结果

- 总计：13 项
- 通过：13
- 失败：0
- 结论：**PASS**

## 覆盖结论（对应 F-DP-01 ~ F-DP-11）

- F-DP-01：sellPrice 写入精度 round 到 6 位通过（Prisma + Admin PATCH）
- F-DP-02：deprecated 标记已同步到 `list_models`
- F-DP-03：`capability` 参数 enum 生效（非法值拒绝）
- F-DP-04：`list_logs.model` 示例已改为 canonical name（`gpt-4o-mini`）
- F-DP-05：not-found 语义统一为 `not found in this project`
- F-DP-06：`fix-dp-06-model-data.ts --apply` 可修正目标数据
- F-DP-07：`max_reasoning_tokens` 生效并映射上游 `reasoning.max_tokens`，usage 含 `reasoningTokens`
- F-DP-08：json_mode 返回已剥离 markdown code fence
- F-DP-09：image 模型调用 chat 被正确拒绝（`invalid_model_modality`）
- F-DP-10：非流式 `get_log_detail` 不返回 `ttftMs/ttft`
- F-DP-11：capability 过滤无 modality 时对 text-only capability 收敛到 TEXT 模型

## 全链路回归

- `list_models -> chat -> list_logs` 链路执行通过，trace 可在日志中查询。

## 未执行项

- L2 staging / 真实 provider 调用：本轮未执行（无授权需求，L1 验收已覆盖本批 acceptance）。

## Harness 说明

本批次按状态机完成：`planning → building → verifying → done`。
`progress.json` 已写入 `docs.signoff` 并置为 `done`。

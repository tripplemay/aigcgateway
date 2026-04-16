# DX-POLISH F-DP-12 验收用例（L1）

- 批次：DX-POLISH
- 执行者：Codex Evaluator
- 目标：覆盖 F-DP-01 ~ F-DP-11，并验证 list_models -> chat -> list_logs 链路
- 主脚本：`scripts/test/dx-polish-verifying-e2e-2026-04-13.ts`

## 用例清单

| Case ID | 对应功能 | 核心断言 |
|---|---|---|
| DP-00 | Smoke | MCP initialize 成功 |
| DP-01 | F-DP-01 | sellPrice 在 Prisma/Admin 写入路径均 round 到 6 位小数 |
| DP-02 | F-DP-02 | deprecated 模型在 list_models 返回 `deprecated:true` |
| DP-03 | F-DP-03 | capability 非法值被拒绝；合法 enum 值可用 |
| DP-04 | F-DP-04 | list_logs tool 的 model 参数示例为 canonical（如 gpt-4o-mini） |
| DP-05 | F-DP-05 | action/template not-found 文案统一为 `not found in this project` |
| DP-06 | F-DP-06 | `fix-dp-06-model-data.ts --apply` 修正 deepseek-r1/grok-4.1-fast/minimax-m2.5 |
| DP-07 | F-DP-07 | usage 返回 reasoningTokens；`max_reasoning_tokens` 映射到上游 reasoning.max_tokens |
| DP-08 | F-DP-08 | json_mode 响应自动剥离 markdown code fence，返回可 JSON.parse 裸 JSON |
| DP-09 | F-DP-09 | image 模型调用 chat 返回 `invalid_model_modality` 并提示 generate_image |
| DP-10 | F-DP-10 | 非 stream 的 get_log_detail 不返回 ttftMs/ttft |
| DP-11 | F-DP-11 | capability text-only 过滤不混入 image 模型 |
| DP-12 | F-DP-12 链路 | `list_models -> chat -> list_logs` 全链路可回查 trace |

## 执行命令

```bash
npx tsx scripts/test/dx-polish-verifying-e2e-2026-04-13.ts
```

## 报告输出

- 原始 JSON：`docs/test-reports/dx-polish-verifying-local-e2e-2026-04-13.json`
- 签收报告：`docs/test-reports/DX-POLISH-signoff-2026-04-13.md`

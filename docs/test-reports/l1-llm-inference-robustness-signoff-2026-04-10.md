# L1 LLM 推断链路健壮性升级 Signoff 2026-04-10

> 状态：**PASS**
> 触发：`verifying` 阶段首轮验收全通过，`F-L1-04` 动态验证与签收完成

---

## 测试目标

验证 `classifyNewModels`、`inferMissingBrands`、`inferMissingCapabilities` 在 L1 本地环境下满足本批次验收标准：
- 分批处理
- 每批成功后立即持久化
- LLM 失败后跳过继续
- 下一轮 sync/执行可补处理上次跳过项

---

## 测试环境

- 环境：本地 `localhost:3099`
- 启动方式：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- DeepSeek provider：切到本地 mock `http://127.0.0.1:3344`
- 证据：
  - [l1-llm-inference-robustness-verifying-2026-04-10.json](/Users/yixingzhou/project/aigcgateway/docs/test-reports/l1-llm-inference-robustness-verifying-2026-04-10.json)
  - [l1-llm-inference-robustness-verifying-e2e-2026-04-10.ts](/Users/yixingzhou/project/aigcgateway/scripts/test/_archive_2026Q1Q2/l1-llm-inference-robustness-verifying-e2e-2026-04-10.ts)
  - [l1-llm-inference-robustness-verifying-2026-04-10.md](/Users/yixingzhou/project/aigcgateway/docs/test-cases/l1-llm-inference-robustness-verifying-2026-04-10.md)

---

## 执行步骤概述

1. Smoke：验证 `GET /v1/models`、管理员登录、`/api/admin/providers` 可用。
2. Classification：造 65 个未挂载模型，模拟第 2 批连续 3 次 500 失败，验证第 1/3 批已落库，第 2 批跳过；二次执行补处理剩余 30 个。
3. Brand：造 65 个 `brand=null` alias，模拟第 2 批连续 3 次 500 失败，验证已完成批次不丢；二次执行补处理剩余 30 个。
4. Capabilities bulk：造 105 个 `capabilities=null` alias，验证按 `30/30/30/15` 四批完成且无超时。
5. Capabilities resume：造 65 个 `capabilities=null` alias，模拟第 2 批连续 3 次 500 失败，验证首轮仅持久化 35 个，二次执行补齐剩余 30 个。
6. 静态核对 [model-sync.ts](/Users/yixingzhou/project/aigcgateway/src/lib/sync/model-sync.ts#L505) 确认每轮 sync 后都会重新调用三条推断链路。

---

## 通过项

- `F-L1-01` `inferMissingCapabilities`：
  - 105 个 alias 在 `42ms` 内完成四批推断，批次尺寸为 `30/30/30/15`
  - 失败场景首轮 `updated=35, skipped=30`，二轮 `updated=30, skipped=0`
- `F-L1-02` `classifyNewModels`：
  - 失败场景首轮 `classified=35, skipped=30`
  - 二轮补处理后累计 `65/65` 全部完成
- `F-L1-03` `inferMissingBrands`：
  - 失败场景首轮 `updated=35, skipped=30`
  - 二轮补处理后累计 `65/65` 全部完成
- `F-L1-04` L1 全量验收：
  - smoke 通过
  - “失败跳过继续” 与 “下次补处理” 在三条链路上均有动态证据
  - `model-sync.ts` 调用侧已接入 `classified/updated/skipped` 结果并每轮重试补处理

---

## 失败项

无。

---

## 风险项

- 本轮仅覆盖 L1 本地 + mock LLM，不覆盖真实外部 provider、真实网络抖动或计费链路。
- “中途中断不丢失已完成批次” 以批次失败模拟验证，未执行进程级强杀。

---

## 最终结论

本批次本地验收结果为：

- `4 PASS`
- `0 PARTIAL`
- `0 FAIL`

`L1 — LLM 推断链路健壮性升级（分批+即时持久化+重试）` 通过签收，可将状态推进到 `done`。

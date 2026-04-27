# BL-RECON-FIX-PHASE2 — OpenRouter image-via-chat token capture 治本修复

**批次类型：** bugfix（来自 BL-RECON-FIX-PHASE1 F-RF-03 audit + 用户 2026-04-27 方案 B 决策）
**创建：** 2026-04-27
**预计工时：** ~2h（30m 调研 + 45m 修复 + 30m 测试 + 30m Codex 验收）

---

## 背景

BL-RECON-FIX-PHASE1 F-RF-03 audit 确认 7 个 ⚠️ token-priced image channel：6 个 OR image-via-chat（gemini-2.5-flash-image / gemini-3-pro-image-preview / gemini-3.1-flash-image-preview / gpt-5-image / gpt-5-image-mini / gpt-5.4-image-2）+ 1 个 zhipu cogview-3。

Planner 2026-04-27 深度复核（含 SSH 生产 + OR public API）发现：

**真根因**：channel.costPrice 配置（如 gemini-2.5-flash-image `{token, in:0.3, out:2.5}`）**与 OR 官方 token 单价完全一致**（OR API: `prompt=$0.3/M, completion=$2.5/M`），并非单价填错。问题在于 **gateway 适配层从 OR 响应里取的 `usage.completion_tokens` 不含图像生成的 image-output token**。

**实证（gemini-2.5-flash-image 单次调用）：**
- 上游 OR 实收：$0.0387/张（推断 ~15500 image-encoded completion tokens × $2.5/M）
- gateway CallLog：$0.0032/张（仅 1293 文本回执 token × $2.5/M）
- 比例：~12x undercount

**修复路径（用户选 B = 治本）：** 修适配层让 image-output token 也被计入 `usage.completion_tokens`（或读取 OR 直返的 `usage.cost` 字段直接用）。

修好后所有 7 个 ⚠️ channel 保持 token-priced 配置不动，公式拿到完整 token 数自动算对。

---

## F-RP-01（generator）：调研阶段 — 确认 OR image 模型 usage 字段形态

**前置：** 用 admin API key（`pk_aa6b13...`）通过 gateway 调一次 `google/gemini-2.5-flash-image` 真实图像生成。

**目标：** 拿到完整 raw OR 响应 JSON，确认以下任一假设：

- **H1**：OR 返回的 `usage.completion_tokens` 已含 image tokens（gateway 当前丢了，需检查 sse-parser / extractUsage 是否截断）
- **H2**：OR 返回独立字段（如 `usage.completion_tokens_details.image_tokens` 或 `usage.image_tokens`），gateway 当前的 `extractUsage` 仅读 `prompt_tokens` / `completion_tokens` / `reasoning_tokens` 未取
- **H3**：OR 直接在 usage 里返 `cost` 字段（实际美元），gateway 应优先读取此值绕过 token 公式

### 操作

```bash
# 用 raw HTTP 调 gateway（admin API key）
curl -s -X POST https://aigc.guangai.ai/v1/chat/completions \
  -H "Authorization: Bearer pk_aa6b13..." \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-flash-image",
    "messages": [{"role":"user","content":"a small red cube on white background"}]
  }' \
  -o /tmp/gemini-image-raw.json

# 同时 SSH 生产看 instrumentation/log，找此次 traceId 对应 raw upstream 响应
# 或直接旁路绕过 gateway，用 .env.production 里的 OR API key 直调 OR
curl -s -X POST https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer <OPENROUTER_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '<相同 body 但 model=google/gemini-2.5-flash-image>' \
  -o /tmp/gemini-image-or-direct.json

jq '.usage' /tmp/gemini-image-or-direct.json
```

### 预期结论之一

把 OR 直返 raw `usage` 形态写入：`docs/audits/openrouter-image-usage-shape-2026-04-27.md`（read-only 调研报告）+ 标注 H1/H2/H3 哪个成立。

### Acceptance（F-RP-01）

- [ ] 完成 1 次 gemini-2.5-flash-image 真实调用（gateway 路径 + 直连 OR 各一次）
- [ ] 拿到完整 raw OR 响应 JSON 入 `docs/audits/openrouter-image-usage-shape-2026-04-27.md`
- [ ] 标注 H1/H2/H3 结论 + 引用 OR API 文档（如有）
- [ ] 标注本次调用 OR 实收金额（用 `/api/v1/generation/{id}` 反查或 OR activity API） vs gateway CallLog `costPrice`，量化 gap

---

## F-RP-02（generator）：修适配层 — `extractUsage` 兼容 image tokens

**文件：** `src/lib/engine/openai-compat.ts`（`extractUsage` 函数 line 703-723）+ 可能的 `Usage` 类型定义（`src/lib/engine/types.ts`）

### 改动方向（按 F-RP-01 调研结果分支）

#### 分支 A — 若 H2 成立（image_tokens 单独字段，最常见）：

```ts
export function extractUsage(raw: Record<string, unknown>): Usage {
  const promptTokens = toNumber(raw.prompt_tokens) ?? 0;
  const completionTokens = toNumber(raw.completion_tokens) ?? 0;
  // ⬇️ 新增：image tokens（单独字段或 nested）
  const details = raw.completion_tokens_details as Record<string, unknown> | undefined;
  const imageTokens =
    toNumber(details?.image_tokens) ??
    toNumber(raw.image_tokens) ??
    0;
  const totalTokens = toNumber(raw.total_tokens) ?? (promptTokens + completionTokens + imageTokens);
  // 关键：把 image_tokens 加到 completion_tokens 让计费公式自动覆盖
  // 备选：单独 usage.image_tokens 字段，让 calculateTokenCost 按 image 单价计
  const usage: Usage = {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens + imageTokens,  // image 当作 completion 一并计
    total_tokens: totalTokens,
  };
  // ... reasoning_tokens 逻辑不变
  return usage;
}
```

#### 分支 B — 若 H3 成立（OR 直返 cost 字段）：

```ts
// 新增 Usage 字段：upstreamCostUsd?: number
// extractUsage 检查 raw.cost 字段，存在时塞入 upstreamCostUsd
// post-process.ts calculateTokenCost 检查 if (usage.upstreamCostUsd) return that
```

#### 分支 C — 若 H1 成立（completion_tokens 已含但 sse-parser 丢了）：

修 sse-parser，定位丢失点（多个 chunk usage 聚合？流末尾 usage 被覆盖为 prefix usage？）。

### 测试更新

`src/lib/engine/openai-compat.test.ts`（已存在则扩展）：
- mock raw `{prompt_tokens:35, completion_tokens:1293, completion_tokens_details:{image_tokens:14187}}` → extractUsage.completion_tokens=15480（A 分支）
- 或 mock raw `{prompt_tokens:35, completion_tokens:1293, cost:0.0387}` → upstreamCostUsd=0.0387（B 分支）
- 回归：纯文本模型 raw `{prompt_tokens:100, completion_tokens:200}` → 不变

### Acceptance（F-RP-02）

- [ ] 按 F-RP-01 结论选定 A/B/C 分支并实现
- [ ] `extractUsage` 单测扩展覆盖 image tokens 场景 + 文本回归
- [ ] tsc + build 通过
- [ ] 单 commit `feat(BL-RECON-FIX-PHASE2 F-RP-02): capture OR image-output tokens in extractUsage`

---

## F-RP-03（generator）：集成测试 — image-via-chat 端到端 cost 准确性

**文件：** `src/lib/engine/__tests__/image-via-chat-cost.test.ts`（新建）或扩展现有 `image-via-chat-e2e.test.ts`

### 测试场景

模拟 OR 完整图像生成响应（用 F-RP-01 调研到的真实 shape）：

```ts
const mockOrResponse = {
  // ... message.images / parts ...
  usage: {
    prompt_tokens: 35,
    completion_tokens: 1293,
    completion_tokens_details: { image_tokens: 14187 },
    // OR cost: 0.0387,
  }
};

// 跑完整 imageViaChat 路径 + post-process → 期望 callLog.costPrice ≈ $0.0387 (±5%)
```

### Acceptance（F-RP-03）

- [ ] 集成测覆盖：完整 imageViaChat 流程 → CallLog.costPrice ≈ 上游真实费用（±5% 容差）
- [ ] 文本模型回归测：纯文本 chat 响应（无 image_tokens）成本计算不变
- [ ] vitest 全过

---

## F-RP-04（codex）：验收 + 生产观察

### 静态（3）
1. tsc / build / vitest（≥ 452 + F-RP-02/03 新增）

### 单测验证（2）
2. F-RP-02 extractUsage 新单测 PASS
3. F-RP-03 集成测 PASS

### 生产实证（3）
4. 触发 1 次真实 `gemini-2.5-flash-image` 调用（用 admin API key 通过 https://aigc.guangai.ai 走 gateway）
5. 查 call_logs：本次调用 `costPrice` 应在 [$0.030, $0.045] 范围内（覆盖 OR 实收 $0.0387 ±15%）
6. 等 24h 后 cron / 立即触发手动 reconcile rerun → 该次调用所属日期对账 status 应为 MATCH（默认阈值 |Δ|<$0.5）

### 报告（1）
7. `docs/test-reports/BL-RECON-FIX-PHASE2-signoff-2026-04-2X.md`，含 F-RP-01 调研报告引用 + 实证调用 traceId + reconcile 验证证据

---

## Risks

| 风险 | 缓解 |
|---|---|
| F-RP-01 调研发现 OR 没有可用字段（H1/H2/H3 全部不成立） | 退回方案 C（per-call 配置兜底）；mid-impl 触发 Planner 裁决 |
| F-RP-02 改动 extractUsage 影响纯文本模型 | 单测覆盖 + 实测 1 次纯文本调用回归 |
| 修后 image cost 突然上升触发 gateway sellPrice 不够（亏损） | sellPrice 已配 `{token, in:0.36, out:3}` 比 costPrice 高 1.2x；image_tokens 计入后 sellPrice 也按比例上升，markup 不变；如需调整由 admin 手动调 sellPrice |
| 实证调用花真钱（~$0.04） | 单次成本可接受；调研 + 验收阶段共 ~2 次 = $0.08 |

## 非目标

- 不动 7 个 ⚠️ channel 的 costPrice 配置（修适配层后 token 公式自动算对，配置无需变）
- 不动 zhipu cogview-3（与 OR 适配层无关；如未来启用再单独看）
- 不动 reconcile-job 阈值粒度（image matchDelta=$0.05 留观察）
- 不回填历史 BIG_DIFF 行（reconcile 自然 cron 修未来数据，老行作 audit trail）

## 部署

- F-RP-02 改完后下次部署生效；新调用立即按完整 token 计费
- 已存在的 call_logs 不受影响（历史数据保留 audit trail）
- 不需 migration / SystemConfig 改动

## 验收标准

- [ ] F-RP-04 的 7 项全 PASS
- [ ] gemini-2.5-flash-image 单次调用 CallLog.costPrice 接近 OR 实收（±15%）
- [ ] reconcile MATCH 在阈值内
- [ ] signoff 报告归档
- [ ] F-RP-01 调研报告作为长期 audit reference 入 docs/audits/

# BL-HEALTH-PROBE-LEAN Spec

**批次：** BL-HEALTH-PROBE-LEAN（健康检查极简化 + provider edit 400 hotfix）
**负责人：** Planner = Kimi / Generator = 默认映射 / Evaluator = Reviewer
**创建：** 2026-04-20
**工时：** 0.8 day
**优先级：** **P0**（上游 probe 成本优化 + 生产 UI 不可用 hotfix，紧接 BL-HEALTH-PROBE-EMERGENCY）
**前置：** BL-HEALTH-PROBE-EMERGENCY 合入 + 生产稳定 24h

## 背景

### 主线：ACTIVE probe 成本优化

BL-HEALTH-PROBE-EMERGENCY 已止 DISABLED channel 每天 $10+ 流血。但 ACTIVE aliased text channel 每 10min 仍真实调用 `chat({max_tokens:200})`：

- 46 ACTIVE × 144 次/天 × 200 token ≈ **1.3M token/天浪费**
- 昂贵模型（如 `openai/gpt-4o-mini-search-preview`）每次 probe 约 $0.027，实测 04-16 单日 82 次 = **$2.25/天单点流血**

### 合入：Provider edit 400 hotfix

2026-04-20 用户报告：更新 chatanywhere channel 的 API key 时页面提示 `Request failed: 400`。

**根因定位：** commit `17f25e1`（BL-SEC-INFRA-GUARD F-IG-01）引入的 `providerUpdateSchema.strict()` 明确拒绝 `name` 字段（`admin-schemas.ts:137-139` 注释："name is intentionally excluded: canonical key used by adapters, renaming breaks routing"），但前端 `providers/page.tsx:167` 的 `openEdit` 仍然把 `name` prefill 进 form 并随 PATCH body 一起提交 → ZodError → 400。

**影响：** **任何 provider** 的 edit dialog 保存都会 400（不限于 chatanywhere），用户只能删库重建来改 apiKey，会丢全部 channel。

**hotfix 选择：前端方案 A** —— 编辑模式下不显示 / 不 prefill `name` 字段。保留 F-IG-01 的后端安全契约，前端与契约对齐。

## 核心理念

> **每 10min 向 ACTIVE aliased text channel 发一次 `max_tokens:1` 的 chat，返回非空 choices 即算健康。**

**不引入的复杂度：**
- 不新增 Level 1 / Level 2 / Level 3 分层概念
- 不新增真实流量信号聚合器
- 不新增状态机转换规则（ACTIVE/DEGRADED/DISABLED 语义 + FAIL_THRESHOLD=3 连续失败降级全部保留）
- 不改 Prisma schema
- 不动 routeByAlias / withFailover / cooldown

## 目标

1. ACTIVE text probe 每次 token 成本降至近零（max_tokens:200 → 1）
2. 昂贵模型跳过 probe，完全依赖真实流量 + failover
3. admin 面板性能指标（p50/p95）从真实 `call_logs` 聚合，不再用 probe latency 充数
4. **修复 provider edit dialog 400 bug（`name` 字段不应出现在编辑表单）**

## 非目标

- 不改 DISABLED probe 策略（BL-HEALTH-PROBE-EMERGENCY 已解决）
- 不改状态机 / 降级阈值 / 恢复机制
- 不改 CALL_PROBE 独立 30min 循环（本批次可视为与 full-check 路径统一，但代码层面保持两个函数不强行合并，降低 blast radius）
- 不引入 real-traffic-signal 聚合器
- 不做 provider-wide 级联保护
- 不做冷启动特殊处理

## 设计

### F-HPL-01：`runTextCheck` 降为单级 max_tokens:1

**文件：** `src/lib/health/checker.ts:209-306`

**当前：** `runTextCheck` 跑三级（CONNECTIVITY + FORMAT + QUALITY），每次 chat `max_tokens:200`，生成 3 条 healthChecks 行。

**改动：**

```ts
async function runTextCheck(route: RouteResult): Promise<CheckResult[]> {
  const adapter = getAdapterForRoute(route);
  const start = Date.now();

  try {
    const response = await adapter.chatCompletions(
      {
        model: route.model.name,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
        temperature: 0,
      },
      route,
    );

    const latencyMs = Date.now() - start;
    const ok = !!response?.choices?.length;

    return [
      {
        level: "CONNECTIVITY",
        result: ok ? "PASS" : "FAIL",
        latencyMs,
        errorMessage: ok ? null : "Empty response or no choices",
        responseBody: ok ? null : JSON.stringify(response).slice(0, 500),
      },
    ];
  } catch (err) {
    const latencyMs = Date.now() - start;
    const message =
      err instanceof EngineError ? `${err.code}: ${err.message}` : (err as Error).message;
    return [
      {
        level: "CONNECTIVITY",
        result: "FAIL",
        latencyMs,
        errorMessage: message,
        responseBody: null,
      },
    ];
  }
}
```

**保留的判定逻辑：**
- `scheduler.ts:handleFailure` 对 `runHealthCheck` 返回的 CheckResult[] 做"任一 FAIL"判定触发 DEGRADED/DISABLED，输入从 3 行变 1 行不影响判定（现有逻辑对单条 FAIL 就触发）
- `isTransientFailureReason(errorMessage)` 复用 —— max_tokens:1 失败时 errorMessage 格式保持 `<ErrorCode>: <message>`，与原先一致

**删除的逻辑：**
- Level 2 FORMAT：usage / finish_reason 完整性校验（max_tokens:1 下 provider 可能不返回 usage，L2 几乎必 FAIL）
- Level 3 QUALITY：`trimmed.length >= 1`（max_tokens:1 经常返回空串，L3 几乎必 FAIL）

### F-HPL-02：昂贵模型豁免 whitelist

**文件：**
- `src/lib/health/scheduler.ts:268-281`（planChannelCheck）
- 新增 `src/lib/health/expensive-models.ts`

**实现：**

```ts
// src/lib/health/expensive-models.ts
// 每次调用成本高的模型，不 probe，完全靠真实流量触发 failover
export const EXPENSIVE_MODEL_PATTERNS: RegExp[] = [
  /-search(-|$)/i,     // gpt-4o-mini-search-preview, perplexity/sonar-* 等
  /-reasoning(-|$)/i,  // reasoning 模型
  /^o1-/i,             // OpenAI o1 系列
  /^o3-/i,             // OpenAI o3 系列
  /-pro-(preview|image|video)/i,
];

export function isExpensiveModel(modelName: string): boolean {
  return EXPENSIVE_MODEL_PATTERNS.some((re) => re.test(modelName));
}
```

**planChannelCheck 改造：**

```ts
function planChannelCheck(channel, hasAlias) {
  const isImage = channel.model.modality === "IMAGE";
  const isAliased = hasAlias;

  // F-HPL-02: expensive models skip probe entirely
  if (isAliased && !isImage && isExpensiveModel(channel.model.name)) {
    return { checkMode: "skip", interval: ACTIVE_INTERVAL };
  }

  if (isAliased && !isImage) {
    if (channel.status === "DISABLED") {
      return { checkMode: "reachability", interval: DISABLED_INTERVAL };
    }
    return { checkMode: "full", interval: ACTIVE_INTERVAL };
  }
  return { checkMode: "reachability", interval: ACTIVE_INTERVAL };
}
```

**runScheduledChecks 消费：** checkMode === "skip" 的 channel 不入 dueChannels。

**runScheduledCallProbes 消费：** 在 `shouldCallProbeChannel` 中新增 `if (isExpensiveModel(ch.model.name)) return false`。

### F-HPL-03：admin 面板 p50/p95 改 call_logs 聚合

**文件：**
- `src/app/(console)/admin/health/page.tsx:552,584`（3 级 badge 简化为单级）
- `src/app/api/admin/health/*`（性能指标查询源切换，如有）
- 或新增 `src/app/api/admin/channel-metrics/route.ts` 返回近 1h / 24h p50/p95 from `call_logs`

**改动要点：**
1. **admin/health/page.tsx UI 简化：** L1/L2/L3 三栏合并为一栏"Health"，直接显示 CONNECTIVITY 结果。旧数据（FORMAT/QUALITY 行）保留不渲染，不需清理
2. **p50/p95/p99 数据源：** 新增（或改写现有）API 按 channelId 聚合近 1h / 24h `call_logs.latencyMs`（过滤 status=success）。零流量 channel 显示 "N/A (no traffic)"，不再拿 probe latency 充数
3. **channel 诊断页面（如存在）：** "最近健康检查"仍用 healthChecks 表的最近一条（source 是 probe），"实测 p50/p95" 从 call_logs 聚合

**非硬性要求：** 如 admin/health 旧 UI 改动复杂，可接受保留 L1/L2/L3 三栏但 L2/L3 永远显示 "N/A"（只要不 break 渲染）。核心是 checker.ts 改动落地。

### F-HPL-04：单测

**文件：**
- `src/lib/health/__tests__/checker.test.ts`（如无则新增）
- `src/lib/health/__tests__/scheduler.test.ts`（扩展）
- `src/lib/health/__tests__/expensive-models.test.ts`（新增）

**用例：**

1. **runTextCheck max_tokens:1 路径：**
   - mock adapter.chatCompletions 返回 `{ choices: [{ message: { content: "1" } }] }` → level=CONNECTIVITY, result=PASS, latencyMs > 0
   - mock 返回 `{ choices: [] }` → result=FAIL, errorMessage 含 "Empty response"
   - mock 抛 EngineError(RATE_LIMITED) → result=FAIL, errorMessage 以 "rate_limited:" 开头
   - 验证返回数组长度 === 1（不再生成 FORMAT/QUALITY 行）

2. **isExpensiveModel：**
   - "gpt-4o-mini-search-preview" → true
   - "o1-mini" → true
   - "o3" → true
   - "gpt-4o" → false
   - "claude-haiku-4.5" → false

3. **scheduler 跳过昂贵模型：**
   - mock ACTIVE aliased text channel with model.name="gpt-4o-mini-search-preview" → `planChannelCheck` 返回 checkMode="skip"，runScheduledChecks 不调用任何 check 函数
   - `shouldCallProbeChannel` 对昂贵模型返回 false

4. **回归：原有 scheduler.test.ts 全通过** —— FAIL_THRESHOLD=3 连续失败降级机制不破坏，DISABLED reachability 机制保持，fix round 1 自动复活保持。

### F-HPL-06：Provider edit dialog `name` 字段隐藏（400 hotfix）

**文件：** `src/app/(console)/admin/providers/page.tsx`

**改动 1 —— `openEdit` 不 prefill `name`（line 165-173）：**

```ts
const openEdit = (p: Provider) => {
  setForm({
    // name 字段由系统管理，编辑模式下不允许修改（后端 providerUpdateSchema 拒绝）
    displayName: p.displayName,
    baseUrl: p.baseUrl,
    adapterType: p.adapterType,
  });
  setEditId(p.id);
  setDialogOpen(true);
};
```

**改动 2 —— form fields 数组按 edit/create 分支（line 400-408）：**

```ts
const baseFields = [
  { key: "displayName", label: t("displayName"), placeholder: t("displayNamePlaceholder") },
  { key: "baseUrl", label: t("baseUrl"), placeholder: "https://api.openai.com/v1" },
  { key: "apiKey", label: t("apiKey"), placeholder: "sk-...", type: "password" },
];
const fields = editId
  ? baseFields  // 编辑：不显示 name
  : [{ key: "name", label: tc("name"), placeholder: t("namePlaceholder") }, ...baseFields];
// 随后 fields.map(...) 渲染
```

**验证：**
- 编辑任意 provider（含 chatanywhere） → 弹窗不再显示 name 输入框 → 保存成功
- 新建 provider → name 输入框仍在，adapter preset 会自动填入（line 383 行为不变）
- 后端 `providerUpdateSchema.strict()` 契约不动（F-IG-01 安全意图保留）

**不在 scope：** 不添加"name 不可改"的 tooltip 或 readonly 禁用态 UI（隐藏即足够）；不动 `/api/admin/providers/[id]/route.ts` 后端；不改 `providerUpdateSchema`。

### F-HPL-05：Codex 全量验收

**构建与单测（3 项）：**
1. `npm run build` 通过
2. `npx tsc --noEmit` 通过
3. `npx vitest run` 全过（新增单测 PASS + 旧单测 / fix round 1/2 / EMERGENCY 批次单测不破坏）

**单测功能验证（4 项）：**
4. `runTextCheck` 返回数组长度 === 1（只含 CONNECTIVITY，不含 FORMAT/QUALITY）
5. `runTextCheck` 真实调用参数包含 `max_tokens: 1`（snapshot adapter mock 调用记录）
6. `isExpensiveModel` 对 search/reasoning/o1/o3 模型返回 true
7. scheduler 对 expensive ACTIVE aliased text channel 不跑 probe 也不跑 call probe

**F-HPL-06 hotfix 验证（2 项）：**
8. Dev 服打开 `/admin/providers` → 点任一 provider 的 edit → 弹窗**不含** name 输入框；只显示 displayName / baseUrl / apiKey
9. 编辑 chatanywhere 只改 apiKey → 点 Save → 200 成功 + toast "saved"（不再 400）

**生产部署后观察（48h）：**
10. chatanywhere `day_usage_details` 查询：openai 上游日调用数（扣除本来就有的 DISABLED reachability）降幅 > 95%
11. OpenRouter activity API 查询：openrouter 日 token 成本 < $0.5（对比 04-16 的 $2.71）
12. gpt-4o-mini-search-preview 日调用数 = 0（来自 probe 的 0 次）
13. 用户手动在生产 `/admin/providers` 重试更新 chatanywhere api key → 成功

**14. 生成 signoff 报告 `docs/test-reports/BL-HEALTH-PROBE-LEAN-signoff-2026-04-2X.md`。**

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| max_tokens:1 某些 provider 拒绝或行为异常 | 单测覆盖主流 provider mock；生产观察 48h，个别 provider 异常可个案加豁免 |
| 昂贵模型 whitelist 正则过宽误伤普通模型 | 正则针对命名惯例（-search-preview / -reasoning / o1-/o3-），明确不匹配"claude-sonnet-4-reasoning"等误伤 → 单测覆盖；上线后观察 `health_checks` 表哪些模型被 skip |
| FORMAT/QUALITY 级移除后，某些从未被 probe 验过 usage 格式的 provider 会劣化但未被发现 | 真实流量 call_logs 失败率监控兜底；存在 callback 能在 1-2 次请求内触发降级 |
| admin/health 页面 L2/L3 永远 N/A 体验不佳 | F-HPL-03 UI 简化或接受 N/A 显示，二选一 |
| F-HPL-06 hotfix 误伤 create provider 流程（adapter preset 写 name 逻辑断裂）| fields 数组按 editId 分支，create 路径完全不变；单测 / 手动回归覆盖 |

## 部署

- 纯代码变更，无 migration
- 部署：git pull + npm ci + npm run build + pm2 restart
- 回滚：revert commit

## 验收标准

- [ ] F-HPL-05 的 11 项全 PASS（生产 48h 观察可在 signoff 时标注）
- [ ] build + tsc + vitest 全过
- [ ] signoff 报告归档

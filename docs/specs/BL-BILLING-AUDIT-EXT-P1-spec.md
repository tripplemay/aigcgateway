# BL-BILLING-AUDIT-EXT-P1 Spec

**批次：** BL-BILLING-AUDIT-EXT-P1（call_logs 盲区修复 + 原 BL-BILLING-AUDIT + Tier 1 账单 adapter）
**负责人：** Planner = Kimi / Generator = 默认映射 / Evaluator = Reviewer
**创建：** 2026-04-24
**工时：** 2.6 day
**优先级：** **P0**（Gateway 审计盲区 + OpenRouter/chatanywhere 外部调用泄漏发现后）
**前置：** BL-IMAGE-PARSER-FIX 已 done（生产 `e9e8963` 已部署）

## 背景

2026-04-23 追查 OpenRouter 4 月账单 $200.26 异常时系统性发现 Gateway 存在多重审计盲区：

### 已识别的 3 类黑洞（call_logs 不写）

1. **Category B — Health probe scheduler**：
   - `runTextCheck`（每 2h chat max_tokens:1）
   - `runCallProbe`（每 30min chat max_tokens:1 / image gen）
   - 只写 `health_checks` 表，不写 `call_logs`
   
2. **Category C — Admin 手动触发**：
   - `/api/admin/health/:channelId/check`（manual probe，复用 runHealthCheck 路径）
   - `/api/admin/health/:channelId/probe`（manual call probe）
   - 同样只写 `health_checks`
   
3. **Category D — 同步工具直接 fetch（严重）**：
   - `src/lib/sync/alias-classifier.ts`: 直接 `fetch(${baseUrl}/chat/completions)` 调 deepseek-chat（max_tokens:8192），无日志
   - `src/lib/sync/doc-enricher.ts`: 同样直接 fetch deepseek-chat，无日志
   - **完全不写 `call_logs` 也不写 `health_checks`**，账单和内部审计都看不到

### 决策收敛（2026-04-24 与用户确认）

- 方案 A（统一 audit 层）：所有 upstream 调用**必须**写 call_logs，通过 source 字段区分
- call_logs schema 扩展 `source` 枚举 + `projectId/userId` nullable
- Tier 1 上游账单可自动对账的 3 家（Volcengine / OpenRouter / ChatanyWhere）单独写 adapter
- chatanywhere 账单 fetcher 必须加 `User-Agent: Mozilla/5.0` header（否则 Cloudflare 1010 拦截），为"对账专用"而非改 engine 层

### P1 vs P2 拆分

本批次（P1）覆盖"修盲区 + 原 BL-BILLING-AUDIT + Tier 1 adapter"。下批次（P2）做 Tier 2 余额快照、对账 cron、admin 面板、call_logs TTL。

## 目标

1. Gateway 任何调用上游的路径都写 `call_logs`（统一 audit）
2. 原 BL-BILLING-AUDIT 的 channelId 错位 / image costPrice / auth_failed 告警 / 错误文本转译问题一次修完
3. Volcengine / OpenRouter / ChatanyWhere 3 家可自动拉账单（adapter 准备好，对账 job 在 P2）

## 非目标

- 不做 Tier 2 余额快照 adapter（P2）
- 不做对账 cron job（P2）
- 不做 admin 面板（P2）
- 不做 call_logs TTL（P2）
- 不做 Tier 3（Zhipu/MiniMax/Qwen/xiaomi-mimo）上游对账 —— 设计上直接跳过，依赖 Gateway call_logs 内部审计

## 设计

### F-BAX-01：CallLog schema 扩展

**文件：** `prisma/schema.prisma` + 新 migration

**改动：**
1. `CallLog.source` enum 保持 string（已是 String），运行时接受新值 `probe` / `sync` / `admin_health`
2. `CallLog.projectId` 从 `String` 改为 `String?`（nullable）
3. `CallLog.userId` 已是 `String?`（已 nullable），确认不变

**Migration：** `20260424_call_logs_source_extend`
```sql
ALTER TABLE call_logs ALTER COLUMN "projectId" DROP NOT NULL;
-- source 是 String 类型，无需改
```

**验证：**
- `npx prisma migrate dev --name call_logs_source_extend` 生产等价
- tsc + build 通过

### F-BAX-02：Health probe 路径补写 call_log

**文件：**
- `src/lib/health/checker.ts` `runTextCheck` + `runCallProbe`
- `src/lib/api/post-process.ts` 新增 `writeProbeCallLog()` helper

**改动：**

1. 新增 `src/lib/api/post-process.ts:writeProbeCallLog(params)`:
   ```ts
   export function writeProbeCallLog(params: {
     traceId: string;      // probe-generated, e.g. "probe_<channelId>_<timestamp>"
     route: RouteResult;
     source: 'probe' | 'admin_health';
     startTime: number;
     response?: ChatCompletionResponse | ImageGenerationResponse;
     error?: { code?: string; message: string };
     isImage: boolean;
   }): void
   ```
   - 调用 calculateTokenCost / calculateImageCost 算 cost（probe 也会占 token，要记真实 cost）
   - 写 call_log，userId=null，projectId=null
   - 不 deduct balance（probe 是系统开销，不扣任何用户）
   - 不 check balance alert

2. `runTextCheck(route)` 成功/失败分支调用 `writeProbeCallLog(source='probe')`
3. `runCallProbe(route)` 同样（文本 + 图片分支）
4. `checkChannel()` 路径（admin /api/admin/health/:id/check）source='admin_health'
5. `runCallProbeForChannel()` 路径（admin /api/admin/health/:id/probe）source='admin_health'

**保留：** health_checks 表的 PASS/FAIL 记录不动（状态机 `handleFailure` 依赖它）

**单测：**
- mock adapter chat → runTextCheck 写出 1 条 call_log with source='probe', projectId=null, userId=null
- mock adapter image → runCallProbe IMAGE 分支同样
- admin /api/admin/health/:id/check 集成测试写出 source='admin_health'

### F-BAX-03：同步工具改走 adapter + fallback

**文件：**
- `src/lib/sync/alias-classifier.ts`（classifyNewModels / inferMissingBrands / inferMissingCapabilities）
- `src/lib/sync/doc-enricher.ts`

**改动：**

1. 删除直接 `fetch(${baseUrl}/chat/completions)` 代码段
2. 改用 `resolveEngine(primaryModel)` + `withFailover` + `processChatResult(source='sync')`
3. **Fallback 链**（风险 1 缓解）：
   ```ts
   const SYNC_MODEL_FALLBACK_CHAIN = ['deepseek-chat', 'glm-4.7', 'doubao-pro'];
   async function callSyncLLM(prompt, maxTokens) {
     for (const model of SYNC_MODEL_FALLBACK_CHAIN) {
       try {
         const { route, adapter, candidates } = await resolveEngine(model);
         return await withFailover(candidates, (r, a) => a.chatCompletions({...}, r));
       } catch (err) {
         if (isTransient(err)) continue;
         throw err;
       }
     }
     throw new Error('All sync LLM fallbacks exhausted');
   }
   ```
4. `processChatResult({source:'sync', userId:null, projectId:null, traceId:'sync_<task>_<timestamp>'})`
5. 不 deduct balance（系统调用）

**验证：**
- 先保证 gateway 里 deepseek-chat / glm-4.7 / doubao-pro alias 都 enabled 且至少一个 ACTIVE channel
- 单测：mock resolveEngine 第一个抛 `MODEL_NOT_FOUND` → fallback 到第二个成功
- 单测：所有 3 个都抛 → throw 抛到调用方（不会 silent swallow）

### F-BAX-04：channelId 错位 fix + image costPrice regression fix

**channelId 错位 fix**

**文件：**
- `src/lib/engine/failover.ts` `withFailover`
- `src/app/api/v1/chat/completions/route.ts`（3 处 processChatResult）
- `src/app/api/v1/images/generations/route.ts`（2 处 processImageResult）
- MCP `src/lib/mcp/tools/chat.ts` + `generate-image.ts`

**改动：**
1. `withFailover` 返回值增加 `attemptChain: Array<{channelId: string; errorCode?: string; errorMessage?: string}>`：
   ```ts
   export async function withFailover<T>(
     candidates: RouteResult[],
     fn: (route: RouteResult, adapter: EngineAdapter) => Promise<T>,
   ): Promise<{ result: T; route: RouteResult; attempts: number; attemptChain: AttemptRecord[] }>
   ```
2. `processChatResult` / `processImageResult` 接收 `attemptChain` 写入 `responseSummary.attempt_chain`
3. `call_logs.channelId` = 最终成功路由的 channel（或全失败时最后一个 attempt 的 channel）—— 与 `errorMessage` 的 channel 一致（消除错位）
4. `call_logs.modelName` 不变（用户请求的 alias/model）

**image costPrice regression fix**

**文件：** `src/lib/api/post-process.ts:processImageResultAsync` + `calculateCallCost`

**问题：**
- 2026-04-20 2 次 seedream-3 成功调用 costPrice=$0 但 sellPrice=$0.00563
- image 路径 `calculateCallCost` 可能查错 costPrice 字段

**改动：**
1. 定位 `calculateCallCost` 对 image 分支的处理逻辑（应读 `channel.costPrice.perCall`）
2. 修 seedream-3 等 channel 的 `costPrice.perCall` 配置缺失（通过 migration 或 admin UI 填）
3. 增加 warning：成功调用但 costPrice=0 时写 system_log 警告
4. 单测：`processImageResult` 成功时 costPrice > 0（当 channel 配了 perCall）

**验证：**
- 单测：mock image 成功 → calculateCallCost 返回正数 cost
- 生产 smoke：manual 触发 1 次 seedream-3 → call_logs.costPrice > 0

### F-BAX-05：auth_failed 告警 + 错误文本转译

**文件：**
- `src/lib/health/scheduler.ts` `handleFailure`（auth_failed 累计计数）
- `src/lib/notifications/triggers.ts`（新增 AUTH_ALERT 类型）
- `src/lib/engine/types.ts` `sanitizeErrorMessage`（补规则）

**auth_failed 告警：**
1. channel 连续 3 次 auth_failed（`errorCode = ErrorCodes.AUTH_FAILED` 或 errorMessage 含 "account has an overdue balance" / "ApiKey错误"）→ 写 `notifications` 表 AUTH_ALERT
2. 告警展示在 admin 面板红色 banner（不发 email/webhook，按决策 E）
3. 24h 内同一 channel 只告警一次（dedup）

**错误文本转译（sanitizeErrorMessage 补规则）：**
1. 屏蔽"前往 URL 充值"（含全角/半角）→ 替换为"上游配额不足，已联系管理员"
2. 屏蔽"当前 ApiKey: ..." / "当前请求使用的 ApiKey: ..." → 已移除
3. 屏蔽"加 QQ 群 xxx / 加微信 xxx" → 已移除（当前已有，确认不误删）
4. 屏蔽"ApiKey错误" 暴露的 masked key → "认证失败，请联系管理员"

**单测：**
- `sanitizeErrorMessage("前往 https://example.com/recharge 充值")` → 不含 URL + 含"上游配额不足"
- `sanitizeErrorMessage("ApiKey错误(当前使用的 ApiKey: sk-xxx)")` → 不含 "sk-xxx" + 含"认证失败"
- integration：auth_failed 连续 3 次 → notifications 表多 1 行 AUTH_ALERT

### F-BAX-06：Tier 1 上游账单 adapter

**新目录：** `src/lib/billing-audit/fetchers/`

**文件：**
- `tier1-fetcher.ts`（接口 + shape）
- `volcengine.ts`
- `openrouter.ts`
- `chatanywhere.ts`

**接口：**
```ts
export interface TierOneBillFetcher {
  readonly providerName: string;
  fetchDailyBill(date: Date): Promise<BillRecord[]>;
}
export interface BillRecord {
  date: Date;              // 账单日期（UTC）
  modelName: string;       // provider 侧的 model 名（可能与 Gateway 不一致）
  requests: number;        // 请求次数（若 API 不返回则 null）
  amount: number;          // 金额
  currency: 'CNY' | 'USD';
  raw?: Record<string, unknown>;  // 原始 API 返回
}
```

**Volcengine fetcher：**
- POST `https://open.volcengineapi.com/?Action=ListBillDetail&Version=2022-01-01`
- V4 签名（HMAC-SHA256，service="billing", region="cn-beijing"）
- body: `{BillPeriod: "2026-04", Limit: 200, Offset: offset, NeedRecordNum: 1, GroupPeriod: 1}`
- 需要 `authConfig.billingAccessKeyId` + `authConfig.billingSecretAccessKey`（manual 配在 DB）
- 失败时 throw `BillFetchError(providerName, reason)` 让调用方捕获

**OpenRouter fetcher：**
- GET `https://openrouter.ai/api/v1/activity?date=YYYY-MM-DD`
- Auth: Bearer `authConfig.provisioningKey`（不是 apiKey）
- 需 provisioning key 的 is_management_key=true

**ChatanyWhere fetcher：**
- POST `https://api.chatanywhere.org/v1/query/day_usage_details`
- body: `{date: "YYYY-MM-DD"}`
- Headers: `Authorization: Bearer <apiKey>` + `User-Agent: Mozilla/5.0`（必需 UA 绕 Cloudflare）
- 限制：只返回当前 key 的数据；key 轮换后老数据丢失 —— spec 明示接受此局限

**providers.authConfig JSON 扩展（无需 migration）：**
```ts
authConfig: {
  apiKey: string;
  billingAccessKeyId?: string;     // Volcengine only
  billingSecretAccessKey?: string; // Volcengine only
  provisioningKey?: string;        // OpenRouter only
}
```

**admin UI `/admin/providers` 编辑弹窗扩展：**
- 原有 displayName/baseUrl/apiKey 字段保持
- 新增 3 个 optional 字段：
  - `billingAccessKeyId` (password type, 仅 volcengine 显示)
  - `billingSecretAccessKey` (password type, 仅 volcengine 显示)
  - `provisioningKey` (password type, 仅 openrouter 显示)
- 后端 `providerUpdateSchema` 扩展 optional fields

**单测：**
- 每个 fetcher mock HTTP → 验证 V4 签名正确 / 请求 shape / 解析 BillRecord
- Volcengine fetcher mock 400 InvalidAuthorization → 抛 BillFetchError
- ChatanyWhere fetcher 请求带 UA header

**本批次不做：** reconcile-job 不写 bill_reconciliation 表（P2 做）；admin 面板不显示（P2 做）

### F-BAX-07：Codex 全量验收（本批次）

**构建与单测（5 项）：**
1. `npm run build` 通过
2. `npx tsc --noEmit` 通过
3. `npx vitest run` 全过（新单测 PASS + 旧单测不破坏）
4. Prisma migration `20260424_call_logs_source_extend` 在生产 equiv dry-run 通过
5. 新增单测至少 15 条（schema + probe + sync + channelId + sanitize + 3 fetcher）

**数据正确性（7 项）：**
6. dev 服触发 `/api/admin/health/:id/check` → 写出 1 条 call_log source='admin_health'，projectId=null, userId=null
7. dev 服触发 `/api/admin/health/:id/probe` → 同上
8. scheduler 2h 后自动 probe → call_logs 新增 source='probe' 行
9. 手动 trigger model-sync → alias-classifier inferMissingCapabilities 调用（如有待推断 alias）写出 source='sync' call_log
10. 生产 manual 触发 failover 测试（调 /v1/chat/completions 用一个会 failover 的 alias）→ call_log.responseSummary 含 `attempt_chain` 数组 + channelId 与 errorMessage 对齐
11. 生产 manual seedream-3 图片调用 → call_log.costPrice > 0（修复 regression）
12. `sanitizeErrorMessage("前往 https://example.com 充值")` 不含 URL

**功能验证（3 项）：**
13. volcengine fetcher + DB 里 billingAccessKeyId/SecretAccessKey → 生产实测拉一个已知日（2026-04-22）账单 → 返回 BillRecord 数组（非空）
14. openrouter fetcher + DB 里 provisioningKey → 生产实测拉 2026-04-22 activity → 返回 BillRecord
15. chatanywhere fetcher → 生产实测拉 2026-04-22 day_usage_details（可能为 `[]`，需验证不抛错）

**生产观察（2 项，部署后 24h）：**
16. pm2 logs 无新增错误（auth_failed 告警 / sync fallback 异常）
17. call_logs 表按小时查询，新增 source='probe' / 'sync' / 'admin_health' 记录数合理（probe ~500/day / sync 零星）

**18. 生成 signoff 报告 `docs/test-reports/BL-BILLING-AUDIT-EXT-P1-signoff-2026-04-2X.md`。**

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| F-BAX-03 sync 工具改走 adapter，若 deepseek 全挂，fallback 到 glm-4.7 / doubao-pro（可能不同质量） | 加 `SYNC_MODEL_FALLBACK_CHAIN = ['deepseek-chat', 'glm-4.7', 'doubao-pro']` + unit test 覆盖 |
| F-BAX-04 withFailover 签名变更影响 5 个调用方 | 严格单测每个调用方的 attempt_chain 正确传递；流式路径特别小心 |
| F-BAX-06 Volcengine V4 签名复杂，容易签错 | POC Python 脚本已验证签名逻辑；TS 实现全单测覆盖 + mock HTTP 验证签名字符串 |
| F-BAX-02 probe 写 call_log 导致表膨胀（每天 2200+ 条） | P2 会加 TTL 30 天；本批次暂不处理，生产观察 1 周内应不超 30K 记录 |
| F-BAX-05 auth_failed 告警误报（transient overdue 瞬间扣款后恢复） | 要求**连续 3 次**才告警 + 24h dedup |

## 部署

- 需 Prisma migration 执行：`npx prisma migrate deploy`
- 部署：git pull + npm ci + npx prisma migrate deploy + npm run build + pm2 restart
- 回滚：revert commits + `npx prisma migrate reset`（小心：会删 call_logs！应用 migration rollback 而非 reset）

## 验收标准

- [ ] F-BAX-07 的 18 项全过（生产 smoke 可在部署后补，最长 24h）
- [ ] build + tsc + vitest 全过
- [ ] signoff 报告归档
- [ ] P2 batch 入 backlog（先占位，本批次 done 后启动）

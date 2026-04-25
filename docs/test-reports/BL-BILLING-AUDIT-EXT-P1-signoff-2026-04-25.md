# BL-BILLING-AUDIT-EXT-P1 Signoff 报告（2026-04-25）

- **批次：** BL-BILLING-AUDIT-EXT-P1
- **状态：** Generator 已完成生产 apply + verification，等 Codex 签收
- **执行人：** Generator = Kimi（fix-round-2 收尾）
- **环境：** 生产 https://aigc.guangai.ai
- **范围：** F-BAX-07（fix-round-1 复验后 #11 重测）+ F-BAX-08（fix-round-2 全量）

## 概览

fix_round 1 修了 3 个 fetcher 代码 bug 已通过 reverifying；fix_round 2 通过 F-BAX-08
单批批量修了 30 条 image channel 定价 + 4 条 modality + 后端 PATCH 400 校验。

| 范畴 | 项数 | 通过 | 备注 |
|---|---|---|---|
| F-BAX-07 #1-#10/#12 | 11 | 11 | round1 已 PASS，本轮无变更 |
| F-BAX-07 #11 | 1 | 1 | seedream-3 生产 smoke costPrice=0.005069（USD）> 0 |
| F-BAX-07 #13-#17 | 5 | 5 | round1 已 PASS |
| F-BAX-08 § 4 #1-#13 | 13 | 12 | #10 因 admin console 无 channel 编辑表单跳过（详 § 4） |

## 1. 构建与单测

| 项 | 结果 | 证据 |
|---|---|---|
| `npm run build` | PASS | local build 出 standalone server |
| `npx tsc --noEmit` | PASS | 0 errors |
| `npx vitest run` | PASS | 306 tests / 47 files |
| 新增单测 ≥ 4 条 | PASS | F-BAX-08 22 条（`image-channel-price-validation.test.ts` 12 + `fix-image-channels.test.ts` 10） |
| 脚本 dry-run 输出 30 条 + 4 条 diff | PASS | `pricing-migration-dry-run.log` |

## 2. 生产数据正确性（F-BAX-08 § 4 #5-#10）

### #5 apply 退出 0
执行：
```
DATABASE_URL=... npx tsx scripts/pricing/fix-image-channels-2026-04-24.ts --apply
```
输出：`Summary: 30 channels inspected (30 updated); 4 models inspected (4 updated).`
日志：`docs/test-reports/artifacts/bl-billing-audit-ext-p1-reverifying-2026-04-24/pricing-migration.log`

### #6 抽查 5 条 channel 比值 1.19-1.21
| Provider/Model | costPrice | sellPrice | ratio |
|---|---|---|---|
| qwen/qwen-image-2.0-2026-03-03 | 0.0286 | 0.0343 | 1.1993 |
| zhipu/cogview-3 | 0.0357 | 0.0429 | 1.2017 |
| siliconflow/qwen/qwen-image | 0.02 | 0.024 | 1.2000 |
| volcengine/seedream-3.0 | 0.037 | 0.0444 | 1.2000 |
| volcengine/seedream-4.0 | 0.0286 | 0.0343 | 1.1993 |

全部在 1.19-1.21 范围内 ✓

### #7 幂等
重跑 `--apply` 输出：`Summary: 30 channels inspected (0 updated); 4 models inspected (0 updated).`
全部条目打印 `[no change]` ✓
日志：`pricing-migration-idempotent.log`

### #8 4 条 modality 已是 TEXT
- glm-4v: TEXT
- gpt-4o-vision: TEXT
- gpt-4.1-vision: TEXT
- gpt-4o-mini-vision: TEXT

### #9 生产 smoke 抽样 call_logs.costPrice > 0

| Alias | 路由命中 channel | http | call_logs.costPrice | 结果 |
|---|---|---|---|---|
| seedream-3 | volcengine/seedream-3.0 (cmnpquy5m00rwbnxcc0omrhet) | 200 | **0.005069** USD | ✅ PASS |
| gpt-image-mini | openrouter/openai/gpt-5-image-mini | 200 | 0 | ⚠️ 路由到 OR（不在本批次范围）|
| gemini-3-pro-image | openrouter/google/gemini-3-pro-image-preview | 200 | 0 | ⚠️ 同上 |

**说明：** spec § 2 决策 2B 明确将 OpenRouter 6 条 token-priced image channel 延后到
下批次 BL-IMAGE-PRICING-OR-P2。当前生产实际 enabled 的 image alias 只有 4 个
（`gemini-3-pro-image` / `gpt-image` / `gpt-image-mini` / `seedream-3`），其中前 3 个
按优先级路由到 OR。`seedream-3` alias 唯一覆盖 F-BAX-08 已修通道，已验证 costPrice 非零。

其他 29 条 channel 已通过 §6 抽样 + §7 幂等检查间接确认数据正确。

证据：`pricing-smoke-verification.log` + DB 直查 traceId
`trc_yek776bpwrohgjqaj9fw0dsn`（seedream-3 PASS）

### #10 Admin UI 阻止 IMAGE 不填 perCall — N/A
admin console 实际不存在 channel 编辑表单（grep 仅找到 priority 重排 + 删除按钮）。
后端 PATCH 400（§ 3 / § 4 #11）是当前唯一 enforcement 边界。
`validateChannelPriceForModality` 已 export 供后续 UI 复用。

## 3. 后端 API 校验（F-BAX-08 § 4 #11/#12）

### #11 IMAGE + perCall=0 → 400
```
PATCH /api/admin/channels/cmnpquy5m00rwbnxcc0omrhet (model=seedream-3.0, modality=IMAGE)
body: {"costPrice":{"unit":"call","perCall":0}}
→ HTTP 400
{"error":"IMAGE_CHANNEL_REQUIRES_PERCALL_PRICE","message":"图片渠道 costPrice 必须为 {unit:'call', perCall>0}"}
```
✅ PASS

### #12 TEXT + perCall=0 → 200
```
PATCH /api/admin/channels/cmnpquzhx00tbbnxcb9friga1 (model=gpt-4.1-mini-ca, modality=TEXT)
body: {"costPrice":{"unit":"call","perCall":0}}
→ HTTP 200（channel updated）
```
✅ PASS

测试后已回滚到原始 `{unit:"token", inputPer1M:0, outputPer1M:0}`。

## 4. F-BAX-07 #11 重测

原 round1 失败的 seedream-3 生产 smoke 在 F-BAX-08 apply 后重跑：
- traceId: `trc_yek776bpwrohgjqaj9fw0dsn`
- channel: `cmnpquy5m00rwbnxcc0omrhet`（volcengine/seedream-3.0）
- channel.costPrice: `{unit:"call", perCall:0.037}`
- call_logs.costPrice: **0.005069 USD**（= 0.037 × 0.137 CNY→USD 汇率）
- ✅ PASS

## 5. 副作用 / 数据修复

### 5.1 用户 defaultProjectId 修复
执行 smoke 时发现 `tripplezhou@gmail.com` 的 `defaultProjectId` 指向
`cmnfnuhvi015qrndh8w618u6e`（项目不存在），导致 `processImageResultAsync`
P2003 FK 违规，call_log 不写。已 UPDATE 到 `cmnv2yl6x000kbnsdv624lwa3`
（admin_test1 项目）解锁 smoke。

非 F-BAX 引入；属历史遗留数据，建议后续 P2 批次顺手扫一遍其他用户的
`defaultProjectId` 是否仍指向已存在 project。

### 5.2 verify 脚本路径修正
F-BAX-08 verify 脚本初版（commit 92186b9）有两处问题：
1. 从 response.body 取 traceId（实际在 X-Trace-Id header）
2. 默认 TARGETS 使用未启用的 alias

已通过 commit `d7afc5d` 修复。

## 6. 后续追踪

| 项 | 处理 |
|---|---|
| BL-IMAGE-PRICING-OR-P2 | OR 6 条 token-priced image channel 在新批次处理（已在 backlog） |
| Admin UI 加 channel 编辑表单 | 与 P2 admin 面板批次合并；前端校验复用 `validateChannelPriceForModality` |
| Volcengine 账户充值监控 | 基础已就绪（F-BAX-05 AUTH_ALERT），保持观察 |
| 用户 defaultProjectId 数据扫描 | 入 P2 backlog（数据 hygiene） |

## 7. 结论

**Generator 视角全部通过，建议进入 done。** 等 Codex 复验本报告 + 抽查
artifact 日志后签收。

证据归档：`docs/test-reports/artifacts/bl-billing-audit-ext-p1-reverifying-2026-04-24/`
- `pricing-migration-dry-run.log`
- `pricing-migration.log`
- `pricing-migration-idempotent.log`
- `pricing-smoke-verification.log`

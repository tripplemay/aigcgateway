# F-BAX-08 — Image Channel Pricing 系统性修正

**批次：** BL-BILLING-AUDIT-EXT-P1（fix_round 2 scope 扩展）
**创建日期：** 2026-04-24
**优先级：** critical（阻塞 BL-BILLING-AUDIT-EXT-P1 签收）
**Executor：** generator

## 1. 背景

BL-BILLING-AUDIT-EXT-P1 reverifying round1 发现 #11 seedream-3 生产 `call_logs.costPrice=0` FAIL。Planner 扫描定位根因：**40 个 image channel 中 40 个 `costPrice.perCall=0`**（全体未配置，非代码 bug）。

证据：`docs/test-reports/artifacts/bl-billing-audit-ext-p1-reverifying-2026-04-24/seedream-prod-check.log`（channel `cmnpquy5m00rwbnxcc0omrhet` costPrice.perCall=0）。

## 2. 决策纪要

| 项 | 决策 | 说明 |
|---|---|---|
| 口径 | A | 官方原价落 costPrice；sellPrice = costPrice × 1.2 |
| 货币 | USD | 全库统一，CNY 按 1 USD = 7 CNY 换算 |
| OpenRouter 6 条 | 延后 | token-priced，放 backlog → BL-IMAGE-PRICING-OR-P2 |
| gpt-image-2 / -ca / gemini-\* CAW alias | 保守填 | 按 `gpt-image-1` 中档 $0.0420 |
| 4 条 modality 错标 | 本批次修 | `IMAGE → TEXT` |

## 3. 目标

本批次处理 **34 条**：30 条定价修正 + 4 条 modality 修正。

### 3.1 定价批量修正（30 条 channel UPDATE）

| # | channelId | provider | model | costPrice.perCall (USD) | sellPrice.perCall (USD) |
|---|---|---|---|---|---|
| 1 | cmnpquy5m00rwbnxcc0omrhet | volcengine | seedream-3.0 | 0.0370 | 0.0444 |
| 2 | cmnpquy5y00rzbnxcxuixo8q8 | volcengine | seedream-4.0 | 0.0286 | 0.0343 |
| 3 | cmnpquy6c00s2bnxciwqef9po | volcengine | seedream-4.5 | 0.0357 | 0.0429 |
| 4 | cmnukegio0039bnsef0msh0bb | qwen | qwen-image-2.0 | 0.0286 | 0.0343 |
| 5 | cmnukegh8002wbnsedae7k05n | qwen | qwen-image-2.0-2026-03-03 | 0.0286 | 0.0343 |
| 6 | cmnukeghk0031bnsevhekxg4x | qwen | qwen-image-2.0-pro | 0.0714 | 0.0857 |
| 7 | cmnukegi40035bnsegwbx3ueq | qwen | qwen-image-2.0-pro-2026-03-03 | 0.0714 | 0.0857 |
| 8 | cmoca6bxz0001bnsmjykljq2k | qwen | qwen-image-2.0-pro-2026-04-22 | 0.0714 | 0.0857 |
| 9 | cmnukegrj006pbnse7j3gtb0d | qwen | qwen-image-edit-max | 0.0714 | 0.0857 |
| 10 | cmnukegr8006kbnsen8lptjys | qwen | qwen-image-edit-max-2026-01-16 | 0.0714 | 0.0857 |
| 11 | cmnukegya0099bnsefir3brxy | qwen | qwen-image-edit-plus | 0.0286 | 0.0343 |
| 12 | cmnukegxz0095bnsexkx0poni | qwen | qwen-image-edit-plus-2025-10-30 | 0.0286 | 0.0343 |
| 13 | cmnukegu2007nbnses5kt4rbd | qwen | qwen-image-edit-plus-2025-12-15 | 0.0286 | 0.0343 |
| 14 | cmnukegss0076bnse64juomn7 | qwen | qwen-image-max | 0.0714 | 0.0857 |
| 15 | cmnukegsj0072bnsecdbcdwgj | qwen | qwen-image-max-2025-12-30 | 0.0714 | 0.0857 |
| 16 | cmnukegrt006tbnse1dnwjede | qwen | qwen-image-plus-2026-01-09 | 0.0286 | 0.0343 |
| 17 | cmnukegfk002gbnsewzxcheko | qwen | wan2.7-image | 0.0286 | 0.0343 |
| 18 | cmnukegez0029bnse0d9akksv | qwen | wan2.7-image-pro | 0.0714 | 0.0857 |
| 19 | cmnukegtg007ebnse2ikscfku | qwen | z-image-turbo | 0.0286 | 0.0343 |
| 20 | cmnujtxfs00jmbnrzj2c9t6tp | siliconflow | qwen/qwen-image | 0.0200 | 0.0240 |
| 21 | cmnujtxfg00jjbnrz0slsyj1j | siliconflow | qwen/qwen-image-edit | 0.0400 | 0.0480 |
| 22 | cmnujtxf300jgbnrzuj14zlnp | siliconflow | qwen/qwen-image-edit-2509 | 0.0400 | 0.0480 |
| 23 | cmnpqv0mq013sbnxc9vjqcoyz | openai | gemini-3-pro-image-preview | 0.0420 | 0.0504 |
| 24 | cmnpqv0m5013mbnxc1qhphm0a | openai | gemini-3.1-flash-image-preview | 0.0420 | 0.0504 |
| 25 | cmnpqv0mf013pbnxcysr06pxa | openai | gpt-image-1 | 0.0420 | 0.0504 |
| 26 | cmnpqv0nd013ybnxcex3iuglj | openai | gpt-image-1-mini | 0.0110 | 0.0132 |
| 27 | cmnpqv0n2013vbnxcui7y73rp | openai | gpt-image-1.5 | 0.0090 | 0.0108 |
| 28 | cmoayey2y0mi7bnvxr667x1z6 | openai | gpt-image-2 | 0.0420 | 0.0504 |
| 29 | cmoayey2x0mi6bnvxmydm6jat | openai | gpt-image-2-ca | 0.0420 | 0.0504 |
| 30 | cmnujsns900fhbnrzmnf793q2 | zhipu | cogview-3 | 0.0357 | 0.0429 |

**格式约定（JSON 写入 `Channel.costPrice` / `Channel.sellPrice`）：**
```json
{ "unit": "call", "perCall": 0.0370 }
```

### 3.2 Modality 修正（4 条 model UPDATE）

| model.name | 原 modality | 新 modality | 原因 |
|---|---|---|---|
| gpt-4.1-vision | IMAGE | TEXT | vision 输入 → 文本输出 |
| gpt-4o-vision | IMAGE | TEXT | 同上 |
| gpt-4o-mini-vision | IMAGE | TEXT | 同上 |
| glm-4v | IMAGE | TEXT | 同上 |

`UPDATE models SET modality='TEXT' WHERE name IN (...)`。修改后这 4 个 model 的 channel 自动从 image channel 列表消失，不再参与 image 定价校验。

### 3.3 定价脚本

新建 `scripts/pricing/fix-image-channels-2026-04-24.ts`：

- 硬编码上述 30 条定价表 + 4 条 modality 修正。
- 默认 **dry-run 模式**：打印每条 channel 变更前后 diff（`current costPrice → new costPrice`），不写库。
- `--apply` 开关：实际执行 UPDATE。
- 变更前：`SELECT id, costPrice, sellPrice FROM channels WHERE id IN (...)`；变更后：重新查询 + diff 打印。
- 输出文件：`docs/test-reports/artifacts/bl-billing-audit-ext-p1-reverifying-2026-04-24/pricing-migration.log`。
- 脚本必须可重放（幂等）：重跑已 apply 的数据输出 "no change"。

### 3.4 Admin UI 校验加固

修改 `src/app/(console)/admin/channels/page.tsx`（若路径不同，请 grep 找到 channel 编辑弹窗）：

- 当 `channel.model.modality === 'IMAGE'` 时：
  - `costPrice.perCall` 必须 > 0（输入框加 `min=0.0001` + 必填）
  - `sellPrice.perCall` 必须 > 0
  - 表单提交前 client-side Zod 校验，不满足则阻止提交 + 红框提示「图片渠道必须配置 perCall > 0 的价格」
- 对应 Zod schema 在 `src/lib/api/admin-schemas.ts` 追加 `superRefine`：
  ```ts
  channelUpdateSchema.superRefine((data, ctx) => {
    if (data.modelModality === 'IMAGE') {
      if (data.costPrice?.unit !== 'call' || !data.costPrice?.perCall || data.costPrice.perCall <= 0) {
        ctx.addIssue({ path: ['costPrice'], code: 'custom', message: '图片渠道 costPrice.perCall 必须 > 0' });
      }
      // sellPrice 同理
    }
  });
  ```

### 3.5 后端 API 校验

修改 `src/app/api/admin/channels/[channelId]/route.ts` PUT handler：

- 读取关联 `model.modality`。
- 若 `modality === 'IMAGE'` 且 `costPrice.perCall <= 0`：返回 `400 { error: 'IMAGE_CHANNEL_REQUIRES_PERCALL_PRICE', message: '图片渠道 costPrice.perCall 必须 > 0' }`。
- 同样校验 sellPrice（如传入）。

### 3.6 抽样验证 call_logs

脚本 `scripts/pricing/verify-image-channels-2026-04-24.ts`：

- 对下列 3 个 provider 各触发一次真实 image 调用：
  - volcengine: `seedream-3.0`
  - qwen: `qwen-image-2.0`
  - openai(CAW): `gpt-image-1-mini`（最便宜减少消耗）
- 每次调用后 `SELECT costPrice FROM call_logs WHERE traceId=...`，**断言 costPrice > 0**。
- 输出验证日志 `pricing-smoke-verification.log`。

### 3.7 单测（新增 ≥ 4 条）

- `imageChannelPriceSchema` 正负例：
  - IMAGE + perCall=0 → 拒绝
  - IMAGE + perCall=0.01 → 通过
  - TEXT + perCall=0 → 通过（仅 IMAGE 校验）
- `scripts/pricing/fix-image-channels-2026-04-24.test.ts`：
  - dry-run 模式输出 30 行 diff + 4 行 modality
  - apply 后重跑输出「no change」

## 4. F-BAX-08 验收清单（Codex 复验）

### 构建与测试（4 项）
1. `npm run build` 通过
2. `npx tsc --noEmit` 通过
3. `npx vitest run` 全过（新增 ≥ 4 条单测 + 旧测试不破坏）
4. 脚本本地 dry-run 输出 30 条 channel diff + 4 条 modality diff，格式清晰可读

### 数据正确性（6 项）
5. 生产执行 `npx tsx scripts/pricing/fix-image-channels-2026-04-24.ts --apply` → 退出码 0
6. 生产 DB 抽查 5 条 channel：costPrice 非零 + sellPrice / costPrice 比值在 1.19-1.21 区间（浮点容差）
7. 生产执行 `UPDATE` 后，重跑 `fix-image-channels-2026-04-24.ts` → 输出 "no change"（幂等）
8. `SELECT modality FROM models WHERE name IN ('gpt-4.1-vision', 'gpt-4o-vision', 'gpt-4o-mini-vision', 'glm-4v')` → 全部 TEXT
9. 生产抽样 smoke（seedream-3 / qwen-image-2.0 / gpt-image-1-mini）→ 对应 call_logs.costPrice > 0
10. Admin UI 新建 / 编辑 IMAGE channel 不填 perCall → 前端阻止提交（截图存证）

### 后端校验（2 项）
11. curl `PUT /api/admin/channels/<imageChannelId>` 带 `costPrice={perCall:0}` → 400 响应
12. curl `PUT /api/admin/channels/<textChannelId>` 带 `costPrice={perCall:0}` → 200 响应（仅 IMAGE 约束）

### 报告
13. 生成 signoff 报告 `docs/test-reports/BL-BILLING-AUDIT-EXT-P1-signoff-2026-04-2X.md`（合并 F-BAX-07 #11 复验）

## 5. 依赖与 Non-Goals

**依赖：**
- DB 中 30 条 channel id 均存在（已于 2026-04-24 09:00 Planner 扫描确认）。

**Non-Goals（不在本批次）：**
- OpenRouter 6 条 token-priced image channel（延后到 BL-IMAGE-PRICING-OR-P2）
- DB CHECK 约束 migration（本批次依赖应用层 Zod + API 校验，CHECK 约束作为结构性加固放下一批次）
- 历史 call_logs 回填 costPrice（往期记录保持 0，不追溯）

## 6. 风险与应对

| 风险 | 应对 |
|---|---|
| 定价 2 条 alias (gpt-image-2 / gpt-image-2-ca) 可能高于实际成本 | 保守高估好过 0；后续 BL-IMAGE-PRICING-OR-P2 再精确化 |
| cogview-3 ¥0.25 未 live 复核 | Generator 在 apply 前 curl 一次 https://bigmodel.cn/pricing 或查官方定价截图存证；若 > ±20% 偏差，先 push hold 让 Planner 重核 |
| UPDATE 误伤生产 | 脚本 default dry-run + 要求 `--apply` 显式开关；输出完整 diff 日志 |
| 浮点精度（0.0286 × 1.2 ≠ 0.03432 精确）| sellPrice 允许 ±1% 容差；入库直接用硬编码 0.0343 避免 JS 浮点误差 |

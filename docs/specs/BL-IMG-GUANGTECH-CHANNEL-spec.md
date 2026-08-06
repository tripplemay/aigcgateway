# BL-IMG-GUANGTECH-CHANNEL — 打通 guangtech 图片通道 + 修复 sync 静默跳过 IMAGE 的可见性

**类型：** Bug 修复 + 配置接入（普通批次，全部 executor:generator）
**创建：** 2026-08-06
**触发：** 用户报障「生产 guangtech 服务商端点可提供 gpt-image2 文生图，但网关无法通过该服务商生图」

---

## 1. 根因（已用生产库 + 上游端点实测确认）

### 1.1 直接原因：guangtech 的 image 模型从来没有 channel

生产库实况（`providers.id=cmr4n7yb401cebnqhwps4vd7r`）：

| 对象 | 状态 |
|---|---|
| `models` 行 `guangtech/gpt-image-1` / `-1.5` / `-2` | ✅ 存在，`modality=IMAGE`，`enabled=false`，`createdAt=2026-07-03 09:44:33`（同一次 sync） |
| 对应 `channels` 行 | ❌ **零行** |
| 对应 alias / `alias_model_links` | ❌ 无 |
| 同 provider 的 6 个 TEXT 模型 | ✅ 均有 ACTIVE channel |

无 channel ⇒ `routeByAlias` 的 `candidateChannels` 为空 ⇒ 任何走 guangtech 生图的请求都不可能被路由到。

上游侧已实测可用：`GET https://co.ghgame.cn:18065/v1/models` → HTTP 200，8 个模型中含 `gpt-image-1` / `gpt-image-1.5` / `gpt-image-2`。**即上游确实提供该能力，缺口 100% 在网关配置侧。**

### 1.2 为什么会缺：sync 按设计跳过 IMAGE channel，且跳过记录不可见

`src/lib/sync/model-sync.ts:372-380`（F-SI-01）：

```ts
// F-SI-01: skip IMAGE channel creation. CHECK 23514 (F-BAX-08) rejects
// any IMAGE channel with all-zero costPrice ...
if (remote.modality === "IMAGE") { skippedImageChannels.push(...); continue; }
```

DB 触发器 `trg_validate_image_channel_pricing` 要求 IMAGE channel 的 `costPrice` 必须 `perCall>0` 或 token 项 >0；sync 拿不到真实图片单价，只能填 0 占位 → 整批 `createMany` 会被拒 → 为不连累同批 TEXT channel，sync 主动跳过 IMAGE，**留待人工在 Admin UI 补 channel + 真实定价**。

该设计本身合理（是 2026-04-24「40 条 image channel costPrice.perCall=0 全体不计费」事故的修复产物），**但跳过记录只走 `console.log`**（`model-sync.ts:766` 的 `skippedImageChannels.length` 拼进控制台字符串）。全仓 grep `skippedImageChannels` 只命中 `model-sync.ts` 自身——没有任何 admin UI / 通知 / SystemLog 消费它。结果：2026-07-03 sync 之后这 3 个模型静默躺了一个月，无人知晓它们在等人工补通道。

### 1.3 用户实际打到的报错并非本问题，但同源

生产 `call_logs` 2026-08-06：

```
09:53:25  gpt-image-mini  ERROR  provider_error  "Insufficient credits. Add more using [URL removed]"
09:53:19  gpt-image       ERROR  provider_error  "Insufficient credits. Add more using [URL removed]"
09:52:33  gpt-image       ERROR  provider_error  "Insufficient credits. Add more using [URL removed]"
```

这是 **OpenRouter 欠费**报错。唯一启用的 IMAGE 别名 `gpt-image` 只链到 `openai/gpt-5-image` @ openrouter 一条通道，guangtech 不在候选池，无 failover 可言。若直接打 `model:"gpt-image-2"`：当前生产代码（hotfix 未部署，`resolveEngine` 仍有 `routeByModelName` 回退）→ 找不到 channel → `CHANNEL_UNAVAILABLE 503`；hotfix 部署后 → `MODEL_NOT_FOUND 404`。两条路都不通。

---

## 2. 设计决策（D）

- **D1 别名策略（用户裁决）：新建独立别名 `gpt-image-1` / `gpt-image-1.5` / `gpt-image-2`**，**不并入现有 `gpt-image`**。理由：现有 `gpt-image` 别名实指 openrouter 的 `openai/gpt-5-image`，与 OpenAI 的 `gpt-image-*` 系列是不同模型；混挂会导致同一别名下静默 failover 到另一个模型，返回图的实际生成模型不确定。已核验三个别名名在生产 `model_aliases` 中**无冲突**（0 行）。

- **D2 计价单位：必须 `{unit:'call', perCall>0}`**。`src/lib/api/admin-schemas.ts:80-87` 的 `imageChannelPriceValid` 对 IMAGE modality channel 强制该 shape，token 计价过不了 admin 校验与 PATCH 路由二次校验。guangtech `provider_configs.imageViaChat=false` + `imageEndpoint=/images/generations` ⇒ 走 `openai-compat.imageGenerations()` 标准路径，响应无 token usage，per-call 也是唯一算得出钱的口径（`post-process.ts:726 calculateCallCost`）。

- **D3 定价（用户裁决「参照 openrouter」）：**
  - `costPrice = {unit:'call', perCall: 0.068836}`
  - `sellPrice = {unit:'call', perCall: 0.082603}`

  推导：openrouter 线上 `gpt-image` 别名的用户实付价为 `{call, perCall: 0.082603}`；全项目 image 通道统一口径 `sellPrice = costPrice × 1.2`（`scripts/pricing/fix-image-channels-2026-04-24.ts:8` 明文决策，qwen / siliconflow / volcengine / openrouter 无一例外）。反推 `0.082603 ÷ 1.2 = 0.0688358333` → 按 `src/lib/prisma.ts:46 roundTo6` 取 6 位 = `0.068836`。
  guangtech `provider_configs.currency=USD` ⇒ `calculateCallCost` 的 `exchangeRate=1`，perCall 即 USD，无需换算。

  > **⚠️ 假设声明（必须随批次交付给用户）：** `0.068836` 是「对齐 openrouter 口径」的**名义成本**，不是 guangtech 的真实进价（真实费率未知，上游未提供计价 API）。它只影响毛利报表与对账，**不影响用户扣费金额**。拿到真实费率后改 `channel.costPrice` 一处即可，无需改代码。
  >
  > **⚠️ 三个模型同价：** `gpt-image-1` / `-1.5` 沿用与 `-2` 相同的 perCall。openrouter 无这两者的对照价，无从"参照"。sellPrice 与用户今天付的 `gpt-image` 完全一致（不涨不跌，收入中性）；成本侧同上为名义值。若后续确认 gpt-image-1 明显更便宜，在 `/admin/model-aliases` + channel 调整即可。

- **D4 `supportedSizes` 置 null**：三个 model 现为 null，`capabilities={}`。置 null 可跳过 `image-generation-core` 的 size 预校验，避免误拒（与现有 `gpt-image` 一致，其 model `openai/gpt-5-image` 的 `supportedSizes` 亦为 null）。**Generator 须在 L2 探测中实测确认 `1024x1024` 可用**；实测到的尺寸集写入 alias `capabilities.supported_sizes` 供 `list_models` 展示，但不写 model.supportedSizes（不加硬拒）。

- **D5 model.enabled 置 true**：`routeByAlias` 的 `candidateChannels` 会 `filter(link => link.model.enabled === true)`（`router.ts:87`），model 不启用则即便建了 channel 也路由不到。

- **D6 幂等 + 可回滚**：provisioning 用幂等脚本（默认 dry-run / `--apply` 落库），重复跑不产生重复 channel / alias / link。回滚 = alias `enabled=false`（即时下线，沿用 seedream-3 下线手法）。

- **D7 上游可用性前置验证（沿用 seedream-3 翻车沉淀的 L1 规则）**：`BL-IMG-SEEDREAM45-spec.md` D2 已立规——外部模型必须**实测返回真实图片后才入验收**，不得凭模型列表存在就判定可用。本批次严格执行：`--apply` 之前先打一次真实生图请求验证端点契约。
  **该探测属 L2（真实 AI 调用 + 花钱），按 `.auto-memory/role-context/evaluator.md`「L2 测试需用户明确授权再执行」，Generator 须在执行前取得用户明示授权。**

---

## 3. Features

### F-GTI-01 — guangtech 图片通道幂等 provisioning 脚本 + 上游实测（executor: generator）

新增 `scripts/add-guangtech-image-channels.ts`（默认 dry-run，`--apply` 落库），对 `gpt-image-1` / `gpt-image-1.5` / `gpt-image-2` 三者各自幂等 upsert：

- **Model**（已存在，仅更新）：`enabled=true`，`supportedSizes=null`，补 `displayName` / `description`。**不改 name**（保持 `guangtech/` canonical 前缀，见 `scripts/fix-guangtech-canonical-naming.ts` 的既有约定）。
- **Channel**（新建）：`providerId=cmr4n7yb401cebnqhwps4vd7r`，`realModelId=gpt-image-{1|1.5|2}`（**裸名，不带 `guangtech/` 前缀** —— 上游 `/v1/models` 返回的就是裸名），`costPrice={unit:'call',perCall:0.068836}`，`sellPrice={unit:'call',perCall:0.082603}`，`status=ACTIVE`，`priority=10`。
- **ModelAlias**（新建）：`alias=gpt-image-{1|1.5|2}`，`modality=IMAGE`，`brand='OpenAI'`，`enabled=true`，`sellPrice={unit:'call',perCall:0.082603}`，`capabilities` 参照现有 `gpt-image` alias 的 shape（`image_input` / `image_to_image` 等按 L2 实测结果填，未实测的一律不声明 true）。
- **AliasModelLink**：alias ↔ 对应 model。

**Acceptance：**
1. 脚本存在，默认 dry-run 打印将创建/更新的 model / channel / alias / link 摘要，不写库。
2. **上游实测（L2，须先取得用户授权）**：对 `gpt-image-2` 打一次真实 `POST {baseUrl}/images/generations`，确认返回合法图片（`b64_json` 或 `url`），记录响应形态、实际 size、耗时；`gpt-image-1` / `-1.5` 同样各打一次。任一模型探测失败 → 该模型**不得** `--apply`，在报告中标注并说明原因（不阻断其余模型）。
3. `--apply` 后生产库满足：三条 channel 存在且 `status=ACTIVE`；三个 model `enabled=true`；三个 alias `enabled=true` 且 `sellPrice` 非空；link 齐全。
4. 幂等：`--apply` 连跑两次，channel / alias / link 行数不变，无重复行。
5. `costPrice` / `sellPrice` 通过 `imageChannelPriceValid`（`{unit:'call', perCall>0}`）。
6. CLI 退出前 `prisma.$disconnect()` +（若用到 redis）`disconnectRedis()`（铁律）。
7. 交付 `docs/specs/BL-IMG-GUANGTECH-CHANNEL-ops.md`：生产执行步骤（SSH 隧道 + dry-run + 探测 + apply + 复核 SQL）+ 回滚步骤 + 定价来源与假设说明（D3 的两条 ⚠️ 原文抄入）。
8. `npx tsc --noEmit` + `npm run lint` + `npm run build` PASS。
9. 独立 commit `feat(BL-IMG-GUANGTECH-CHANNEL F-GTI-01)`。

### F-GTI-02 — sync 跳过 IMAGE channel 的可见性修复（executor: generator）

让「sync 发现了 IMAGE 模型但按设计没建 channel」这件事对管理员可见，堵住本次问题潜伏一个月的通路。

- `runModelSync` 汇总所有 provider 的 `skippedImageChannels` 后，**在总数 > 0 时**：
  - 写一条 `SystemLog`（`type='SYNC'`, `level='WARN'`）—— 复用现有 `writeSystemLog`（`model-sync.ts:476` 已有同款用法）。
  - 发 admin 通知 —— 复用现有 `sendSyncReconcileSkippedToAdmins` 的同层通道（`model-sync.ts:479`），文案说明「N 个 IMAGE 模型已入库但缺 channel，需在 Admin 手工补 channel + 真实 costPrice 后才能调用」，并列出模型名。
  - 通知/日志须**幂等或可抑制**：同一批模型持续跳过时不得每次 sync 都轰炸（例如仅在跳过集合发生变化时发，或复用现有通知去重机制；具体手法由 Generator 按现有通知层惯例定，须在 commit message 说明）。
- `skippedImageChannels` 已随 `providerResults` 落进 SystemConfig 的 sync 结果，**同步结果页需展示它**（当前 UI 完全不读该字段）。位置：admin 同步结果展示处，按现有该页的 i18n + design system 惯例加一块「已跳过的 IMAGE 通道」。
- **CLAUDE.md 前端工程纪律**：本 feature 触及 admin 页面，触及到的代码块内 raw `<input>`/`<select>`/`<button>`/`<table>` 顺手替换为 `src/components/ui/` 的 shadcn 组件；不扩 scope 改未涉及区域。

**Acceptance：**
1. 单测覆盖：`skippedImageChannels` 非空 → 写 SystemLog(WARN) + 触发 admin 通知；为空 → 不写不发。
2. 单测覆盖抑制逻辑：同一跳过集合连续两次 sync 不重复轰炸。
3. admin 同步结果页可见「已跳过的 IMAGE 通道」及模型名列表；中英文文案齐全（`next-intl`，无硬编码字面量）。
4. 触及代码块内无残留 raw 表单/表格元素（或在 commit message 说明为何该处不适用）。
5. `npx tsc --noEmit` + `npm run lint` + `npm run build` + 全量 `vitest` PASS。
6. 独立 commit `fix(BL-IMG-GUANGTECH-CHANNEL F-GTI-02)`。

---

## 4. 影响 / 复用（反向消费点）

- **复用：** guangtech provider + `provider_configs`（已存在，**本批不动**）；`src/lib/engine/openai-compat.ts` `imageGenerations()` 标准 `/images/generations` 路径（无需新 adapter）；`scripts/add-seedream-45.ts` 的幂等 upsert 范式；`writeSystemLog` / admin 通知层。
- **新增：** `scripts/add-guangtech-image-channels.ts`、`docs/specs/BL-IMG-GUANGTECH-CHANNEL-ops.md`。
- **修改：** `src/lib/sync/model-sync.ts`（仅加可见性，**不动 F-SI-01 的跳过逻辑本身**）+ admin 同步结果页。
- **生产数据变更：** 3 条 channel（新建）、3 个 model 的 `enabled`（false→true）、3 个 alias + 3 条 link（新建）。均经幂等脚本，附 dry-run 与回滚。
- **不需改：** 引擎 / 路由 / 计费 / 图片持久化代码（纯配置接入 + 可见性修复）。

## 5. 风险与回滚

| 风险 | 处置 |
|---|---|
| 上游 `/images/generations` 契约与 openai-compat 不符（如只支持 chat 形态、或参数名不同） | D7 前置实测拦截。失败则该模型不 apply，改由后续批次评估是否需 provider quirks。**这是本批次唯一可能整体落空的风险。** |
| 名义 costPrice 与真实进价偏差 → 毛利报表失真 | 已在 D3 显式声明为假设并写入 ops 文档；不影响用户扣费；拿到真实费率改一个字段即可 |
| 别名启用后无 sellPrice 导致零计费（BL-BILLING-ALIAS-SELLPRICE-GUARD 同款病根） | 脚本建 alias 时**同时**写 `sellPrice`，acceptance 第 3 条强制校验非空 |
| 三个模型同价可能与实际成本结构不符 | 同 D3 ⚠️；收入中性，可随时在 admin 调整 |
| 回滚 | alias `enabled=false` 即时下线；channel 可置 DISABLED；model `enabled` 回 false。脚本幂等，无破坏性删除 |

## 6. 关联

- 本批次**不覆盖** OpenRouter 欠费（`gpt-image` / `gpt-image-mini` / `gemini-3-pro-image` 仍不可用，需用户充值）。打通 guangtech 后，用户改用 `gpt-image-2` 可绕开该阻塞。
- `BL-BILLING-ALIAS-SELLPRICE-GUARD`（backlog, high）与本批 D3 同属「别名定价必须非空」议题，护栏仍留在该条目。
- 未纳入本批（用户未选）：「IMAGE 模型有 model 行但无 channel = 僵尸模型」的定期巡检告警。

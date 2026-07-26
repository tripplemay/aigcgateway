# BL-DEEPSEEK-V4-HOTFIX — DeepSeek 直连模型下线故障止血 + 自动兜底修复

- **批次类型：** 混合批次（5 generator + 1 codex）
- **触发：** 2026-07-25 用户报告生产调用 DeepSeek 报错
- **优先级：** 插队（BL-IMG-I2I-VISION reverifying 挂起，见 §7）
- **Planner：** Kimi（CLI）

---

## 1. 故障事实（全部经生产实查/实测证据）

### 1.1 上游变更

用生产 provider key 实测 `api.deepseek.com`（2026-07-25）：

```
GET /models
→ {"data":[{"id":"deepseek-v4-flash"},{"id":"deepseek-v4-pro"}]}

POST /chat/completions {"model":"deepseek-chat"}
→ 400 "The supported API model names are deepseek-v4-pro or deepseek-v4-flash, but you passed deepseek-chat."

POST /chat/completions {"model":"deepseek-reasoner"}
→ 400 同样报错
```

DeepSeek 直连 API 已下线 `deepseek-chat` / `deepseek-reasoner` 两个历史模型名，只保留 `deepseek-v4-pro` / `deepseek-v4-flash`。

### 1.2 生产残留（deploysvr / aigc-gateway-postgres-1 实查）

provider `deepseek` 下 3 条 ACTIVE 通道仍用已下线的 realModelId：

| # | models.name | channels.realModelId | priority | 所属别名 | 别名 enabled | 影响 |
|---|---|---|---|---|---|---|
| 1 | `deepseek-v3` | `deepseek-chat` | **1** | `deepseek-v3` | ✅ | 🔴 生产正在报错 |
| 2 | `deepseek-reasoner` | `deepseek-reasoner` | **1** | `deepseek-r1` | ✅ | 🔴 同样已坏（暂无调用） |
| 3 | `deepseek-chat` | `deepseek-chat` | 10 | `deepseek-chat` | ❌ | 不可达脏数据 |

`router.ts:60/105/127` 按 **priority ASC** 取优 → #1/#2 是各自别名的**第一选择**。

call_logs 证据（5 条 ERROR，最近 2026-07-26 02:04）：
```
modelName=deepseek-v3  errorCode=invalid_request  source=api
err="The supported API model names are deepseek-v4-pro or deepseek-v4-flash, but you passed deepseek-chat."
```

### 1.3 为什么没有 failover

`failover.ts:38` 的 `NEVER_RETRY` 含 `ErrorCodes.INVALID_REQUEST`（注释："400 — bad params, switching providers won't help"）。上游 400 经 `openai-compat.ts:707-710` 的 `mapProviderError` 无条件映射为 `INVALID_REQUEST` → 不重试。

结果：`deepseek-v3` 别名下另有 7 条健康通道（qwen ×3 / volcengine / siliconflow ×2 / openrouter），`deepseek-r1` 别名下另有 9 条，**一条都没被尝试**，400 直接抛给用户。

这条 400 的实质是**网关侧配置错误（realModelId 陈旧）**，不是用户参数错误，却被当作用户错误处理。

### 1.4 两层自动兜底同时失效

**(a) model-sync 缩水护栏挡住了自动下架**

`model-sync.ts:400` 的 toDisable 逻辑本可自动 DISABLE 掉远端已不返回的通道，但被 `model-sync.ts:489` 的防误杀护栏拦在前面：

```
if (existingChannelCount > 0 && models.length < existingChannelCount * 0.5) → SKIPPED reconcile
```

DeepSeek 从 5 个模型缩到 2 个，`2 < 5 × 0.5` 命中护栏。生产日志：

```
2026-07-21T04:00:18Z [model-sync] deepseek: SKIPPED reconcile — model count 2 < 50% of existing 5
2026-07-22T04:00:31Z  同上
2026-07-23T04:00:36Z  同上
2026-07-24T04:00:58Z  同上
2026-07-25T04:00:06Z  同上
```

护栏本身是正确的（防上游 API 抖动导致批量误下架），**问题是它只 console.log，没有 SystemLog、没有告警、没有通知** —— 连续 5 天在喊"我拦下了一件需要人看的事"，没有任何人看得到。

**(b) 健康检查调度器已停摆 2 天**

```
2026-07-23T05:15:31Z [health-scheduler:1] lost scheduler leadership — stopping
```

- `instrumentation.ts:47` 只在**进程启动时**抢一次 leader lock
- `health/scheduler.ts:110-115` 每 tick heartbeat，失败即 `stopScheduler()`，**没有任何重抢锁路径**
- 生产单副本、容器已 Up 13 天未重启 → **全站健康检查从 2026-07-23 05:15 起至今零执行**（health_checks 表 max(createdAt) = 2026-07-23 05:12 佐证）
- billing / model-sync / maintenance 三个调度器不检查 leadership，所以仍在跑（这解释了为什么 sync 日志有、健康检查没有）

即使健康检查活着，`deepseek-chat` 通道最近几次也只跑到 CONNECTIVITY 级（PASS —— 连通性探测不带模型名，抓不到模型下线）。

### 1.5 现状确认：v4 别名已就绪

`deepseek-v4-flash` / `deepseek-v4-pro` 两个别名 enabled=true，各挂 4 条通道（deepseek 直连 + qwen + siliconflow + openrouter），`deepseek-v4-pro` 直连通道 2026-07-23 CALL_PROBE PASS。**本批次不需要新接模型**，只需下架旧通道 + 修兜底。

---

## 2. 根因总结

| 层 | 问题 | 性质 |
|---|---|---|
| 数据 | 3 条 deepseek 直连通道 realModelId 陈旧且占据 priority=1 | 直接故障源 |
| 兜底 1 | 上游 400「模型名不受支持」被归类为 INVALID_REQUEST → 禁止 failover | 让配置错误变成用户可见硬失败 |
| 兜底 2 | model-sync 缩水护栏静默生效，无告警 | 故障潜伏 5 天无人知 |
| 兜底 3 | 健康检查调度器丢锁后永久停摆，无重抢 | 全站健康检查停摆 2 天 |
| 代码 | `internal-llm.ts:24` 硬编码 `deepseek-chat` 为 sync LLM 首选别名（生产该别名 disabled） | 每次 sync LLM 调用空转一跳 |

---

## 3. 功能列表

### F-DSV4-01 [critical / generator] 生产止血 — 下架 deepseek 直连陈旧通道

**交付：** `scripts/hotfix-deepseek-v4-retire-legacy.ts`

- 默认 dry-run 盘点，`--apply` 才写入；重跑幂等
- 处理对象：provider=`deepseek` 且 `realModelId NOT IN (deepseek-v4-pro, deepseek-v4-flash)` 的全部通道 → `status='DISABLED'`
  - 不硬编码 3 条 ID，按"不在上游 /models 返回集合内"判定，执行前先实拉一次 `GET /models` 作为真值来源
  - 拉取失败 / 返回模型数为 0 → 中止，不做任何写入
- **不改 realModelId、不把 v3/r1 别名重指到 v4**：DeepSeek 直连已彻底没有 V3/R1，别名 `deepseek-v3` / `deepseek-r1` 继续由 qwen / volcengine / siliconflow / openrouter 通道提供；用户要 V4 走 `deepseek-v4-pro` / `deepseek-v4-flash` 别名（已上线）。静默把 v3 别名指向 v4 会让用户拿到与请求不符的模型，不做。
- 执行后清 `models:list*` 相关缓存
- 生产执行（ssh deploysvr → `docker exec aigc-gateway-app-1`），前后各 dump 一次通道状态存证

**验收：**
- dry-run 输出准确列出待下架通道；`--apply` 后 3 条通道 status=DISABLED；重跑输出 0 变更
- 生产真实调用 `deepseek-v3`、`deepseek-r1` 别名成功返回（落到非 deepseek 直连通道），call_logs status=SUCCESS 且计费正常
- 生产真实调用 `deepseek-v4-pro`、`deepseek-v4-flash` 成功
- 证据（命令 + 输出）落 `docs/test-reports/`

### F-DSV4-02 [critical / generator] 健康检查调度器丢锁后自动恢复

**问题：** `scheduler.ts` 丢 leadership → `stopScheduler()` 终局，只有重启容器才能恢复。

**方案：**
- 丢锁后不再终局停止，改为进入"待命重抢"状态：按固定间隔（复用 60s tick 或独立 retry timer）调用 `acquireLeaderLock`，抢到即恢复正常 tick 并打日志
- 保留原有语义：抢不到锁时**不得**执行任何 probe（多副本安全性不能退化）
- 重抢成功/失败的状态迁移写 SystemLog（category=HEALTH_CHECK），便于事后追溯
- 评估 billing / model-sync / maintenance 三个调度器同样只在启动时抢锁、丢锁不停的不一致性，在 spec 决策 D3 中记录结论（本批次是否统一由 Generator 按实际改动成本判断，不得扩到重构调度器架构）

**验收：**
- 单测覆盖：丢锁 → 不再 probe → 重抢成功 → 恢复 probe；重抢失败 → 保持待命不 probe
- 多副本安全性回归：同一时刻只有一个持锁者会 probe
- 生产部署后确认 health_checks 表恢复写入（createdAt 更新到当前）
- tsc + build + 全量 vitest PASS

### F-DSV4-03 [high / generator] model-sync 缩水护栏告警可见化

**方案：**
- 护栏命中（`< 50%` 或 `0 models` 两种 SKIPPED reconcile 分支）时，除 console.log 外写 SystemLog（category=SYNC，level=WARN），含 provider 名、远端模型数、现存通道数
- 生成管理员通知（复用现有 Notification 机制，与余额告警同路径），避免每日重复刷屏（同 provider 同问题做去重/节流）
- 不改护栏阈值和拦截行为本身

**验收：**
- 单测：护栏命中 → SystemLog + Notification 各写一条；连续命中 → 按节流策略不重复轰炸；未命中 → 不写
- 生产部署后可在控制台看到 deepseek 的护栏告警（若届时仍命中）
- tsc + build + 全量 vitest PASS

### F-DSV4-04 [medium / generator] 清理指向已下线模型的硬编码

**方案：**
- `src/lib/sync/internal-llm.ts:24` `SYNC_MODEL_FALLBACK_CHAIN` 首项 `deepseek-chat` 改为生产可用别名（建议 `deepseek-v4-flash`：便宜、enabled、4 条通道），后两项 `glm-4.7` / `doubao-pro` 保持；同步更新 `internal-llm.test.ts:95` 的链断言与相关用例
- `src/lib/sync/adapters/deepseek.ts` NAME_MAP 的 `deepseek-chat` / `deepseek-reasoner` 两条映射已成死代码，评估清理。⚠️ 注意副作用：NAME_MAP 未命中时走 `deepseek/${id}` 命名，而生产 v4 两个 model 记录是无前缀的 `deepseek-v4-flash` / `deepseek-v4-pro`（2026-04 人工脚本建的）。改动前必须核实不会让下次 sync 建出重复 model；有风险则只删死映射不加新映射，并在 spec 记录。
- 启动前先核对目标别名在生产的 enabled/健康状态，别再把链首指到一个不可用别名

**验收：**
- 单测更新且 PASS；本地跑一次 sync LLM 调用链首即命中（不再空转一跳）
- 确认无重复 model 生成风险（给出核实依据）
- tsc + build + 全量 vitest PASS

### F-DSV4-05 [high / generator] 上游「模型名不受支持」400 重分类为可 failover

**问题：** 本次事故里，网关侧 realModelId 陈旧导致的上游 400 被当作用户参数错误，禁掉了 failover，7~9 条健康通道全部未被尝试。这是"一条通道坏 → 整个别名不可用"的放大器。

**方案：**
- `openai-compat.ts` `mapProviderError` 的 `case 400`：当上游错误信息命中"模型名不受支持/未知模型"特征时，映射为 `ErrorCodes.MODEL_NOT_FOUND`（`failover.ts` 中该 code 走默认可重试路径）而非 `INVALID_REQUEST`
- 匹配范围**严格收窄**到模型名类错误，不得放宽其他 400 的语义（参数非法、内容违规等必须仍是 INVALID_REQUEST 且不 failover）
- 匹配特征以真实上游文案为准（DeepSeek 本次文案已知；OpenAI/Anthropic 等同类文案由 Generator 核实后一并纳入，无把握的不纳入）
- 全部候选通道都失败时，最终返回给用户的错误码/文案需保持可定位（不能变成含糊的 model_not_found 而丢失上游原文）

**验收：**
- 单测：模型名类 400 → MODEL_NOT_FOUND 且触发 failover 到下一通道成功；参数类 400 → 仍 INVALID_REQUEST 且不 failover
- 回归：现有 failover / 错误映射相关测试全部 PASS
- 反向验证：临时构造一条 realModelId 错误的通道，别名整体仍可用（自动降级到健康通道）
- tsc + build + 全量 vitest PASS

### F-DSV4-07 [medium / generator] 既有 E2E 脚本漂移修复 + scripts/ 纳入类型检查

**来源：** 首轮验收 TC-DSV4-010/011 BLOCKED（用户 2026-07-26 裁决"本批次顺手修"）。

**修复内容：**
- `test-mcp.ts`：`selectedTextModel` 被引用 4 处却从未声明（必然 ReferenceError）。补声明 + 在 step 3 `list_models` 里按实际可用模型赋值，与既有 `selectedImageModel` 同构
- **硬编码模型名 `deepseek/v3` 共 19 处**（比验收报告列的更广，散在 4 个脚本）。它是本批次 F-DSV4-04 删掉的旧 `NAME_MAP` 产物，DeepSeek 直连下线 `deepseek-chat` 后该名已不存在 → 全部改为运行时从 `/v1/models` 选型
- `e2e-test.ts`：`balance !== 0` 断言改为按 welcome bonus 基线做增量断言（注册会发 `SystemConfig.WELCOME_BONUS_USD`）；`/api/projects/:id/keys` 改为已迁移的用户级 `/api/keys`
- `test-mcp-errors.ts`：burst 用例（5s 滑动窗口）触发后加冷却等待，避免后续 context/size 校验被 429 短路成假 FAIL
- `e2e-test.ts` / `e2e-errors.ts`：环境无可用模型时，真实调用类用例记 **SKIP** 而非 FAIL —— 环境受阻不是回归
- **堵盲区**：新增 `tsconfig.scripts.json` + `npm run typecheck:scripts`，并接入 CI typecheck job。`tsconfig.json` 的 `exclude` 含 `scripts/`，正是这个盲区让 `selectedTextModel` 烂了很久没人发现

**范围收敛：** 类型检查只覆盖 4 个活跃回归脚本 + 本批次新增的 2 个脚本。全量纳入会带出 46 个历史一次性脚本的错误，属独立治理工作，不在本批次。

**验收：** `npm run typecheck:scripts` 通过并在 CI 中执行；4 个脚本无残留 `deepseek/v3`；全量 vitest + tsc + lint + build 通过。

### F-DSV4-06 [high / codex] Evaluator 验收 + 签收报告

**范围：**
1. 生产 `deepseek-v3` / `deepseek-r1` / `deepseek-v4-pro` / `deepseek-v4-flash` 四个别名真实调用成功 + 扣费正确（sell>0 + Transaction）
2. 生产 deepseek provider 下已无 ACTIVE 的陈旧 realModelId 通道；止血脚本重跑幂等
3. 健康检查恢复：health_checks 表持续写入；构造丢锁场景验证自动重抢（可在本地/可控环境验证）
4. 缩水护栏告警可见：SystemLog + 通知按预期产生，且不重复轰炸
5. sync LLM 链首命中新别名，无重复 model 生成
6. 模型名类 400 触发跨通道 failover；参数类 400 不 failover（不得放宽）
7. 全量回归：tsc + build + vitest 全绿；既有 E2E 脚本（e2e-test / e2e-errors / test-mcp）不回归

**交付：** `docs/test-reports/BL-DEEPSEEK-V4-HOTFIX-signoff-YYYY-MM-DD.md`（含命令证据 + PASS/FAIL 结论）

---

## 4. 决策记录

- **D1：不把 `deepseek-v3` / `deepseek-r1` 别名重指到 v4。** DeepSeek 直连已无 V3/R1，但其他四家服务商仍在供，别名语义应保持"用户点的是 V3 就给 V3"。要 V4 走已上线的 v4 别名。
- **D2：止血用"下架"而非"改 realModelId"。** 改 realModelId 等于偷换模型（见 D1）；下架后 router 自动落到同别名健康通道，语义正确且可逆。
- **D3：F-DSV4-02 只修复"丢锁永久停摆"，不重构调度器架构。**

  **Generator 核实结论（2026-07-25）：** `grep -n "LeaderLock\|heartbeatLock" src/lib/{billing,sync,maintenance}/scheduler.ts` **零命中** —— billing / model-sync / maintenance 三个调度器完全不感知 leadership，启动后无条件常驻。当前 leadership 语义只存在于两处：`instrumentation.ts` 启动时抢一次锁决定"本节点是否启动全部调度器"，以及 health scheduler 的每 tick 心跳。

  由此得出两条事实：
  1. 这解释了本次事故的现象差异 —— 07-23 丢锁后 health 停摆，而 model-sync 每天 04:00 照常运行（日志可证）。
  2. 多副本下若 leader 丢锁、另一副本抢到，两边的 billing / sync / maintenance 会**同时运行**。这是既有缺陷，与本次改动无关；F-DSV4-02 只让 health scheduler 从"永久停摆"变为"待命重抢"，不改变其他三者的行为，**不引入新的并发风险**。

  统一改造方向（建议另开批次）：把四个调度器收敛到一个共享的 leadership gate，丢锁时统一转待命、重抢后统一恢复。
- **D4：F-DSV4-05 的匹配特征宁窄勿宽。** 宁可漏掉某家服务商的文案（退化为现状），不可把用户参数错误误判为可 failover（会把确定性失败变成 N 次无效重试 + N 倍延迟）。
- **D5：不动 model-sync 护栏阈值。** 50% 阈值在"上游 API 抖动"场景是对的；本次问题是静默，不是阈值。
- **D6：不追补历史失败调用。** 失败调用未扣费，无需补偿；5 条 ERROR 记录保留作故障存证。

## 5. 不做（明确排除）

- 不新增服务商 / 不接新模型（v4 别名已存在且健康）
- 不重构 leader-lock / 调度器架构
- 不改 model-sync 护栏阈值或 reconcile 语义
- 不清理其他服务商的陈旧通道（本次只处理 deepseek；若 F-DSV4-03 告警上线后暴露其他 provider 同类问题，另开批次）
- 不动 BL-IMG-I2I-VISION 的任何代码

## 6. 风险

| 风险 | 缓解 |
|---|---|
| 止血脚本误下架健康通道 | 以实拉上游 /models 为真值；拉取失败或返回空则中止；dry-run 先行；前后 dump 存证 |
| F-DSV4-05 放宽 400 语义导致无效重试 | 匹配特征严格收窄 + 正反双向单测（参数类 400 必须不 failover） |
| F-DSV4-04 改 NAME_MAP 造成重复 model | 改动前核实 sync 匹配逻辑（按 realModelId 匹配现存 channel）；无把握则只删死映射 |
| 调度器改动引入多副本并发 probe | 保留"抢不到锁绝不 probe"不变式 + 单测覆盖 |
| 部署窗口 | 止血（F-DSV4-01）是纯数据操作，可先落地；代码类需等 Evaluator 验收后由用户手动触发 Deploy |

## 6.5 部署与运维步骤（Generator 记录，供 Evaluator / 用户执行）

| # | 步骤 | 时机 | 说明 |
|---|---|---|---|
| 1 | ~~生产止血脚本~~ | ✅ 已于 2026-07-25 执行 | `hotfix-deepseek-v4-retire-legacy.ts --apply`，纯数据操作，不依赖部署 |
| 2 | 触发 Deploy workflow | Evaluator 验收通过后，用户手动 | migrate 容器会带上 `20260725_sync_reconcile_skipped_notification`（`ALTER TYPE ADD VALUE`，向后兼容、可先于代码生效） |
| 3 | 回填通知偏好 | **部署之后** | `npx tsx scripts/backfill-notification-preferences.ts --apply`（dry-run 显示待新增 **174 行**）。**必须等 migration 落地**，否则 `SYNC_RECONCILE_SKIPPED` 枚举值不存在会写入失败 |
| 4 | 确认健康检查恢复 | 部署后 | 容器重启即重新抢锁；`SELECT max("createdAt") FROM health_checks` 应持续推进 |

**F-DSV4-03 执行中发现的既有缺陷（已一并修复）：**

`dispatcher.sendNotification` 对「用户无该 eventType 偏好行」是**静默丢弃**，而偏好行只在建号时 seed、从无回填路径。生产实查：

- 5 个 ADMIN 账号（建号早于通知功能）**一条偏好行都没有** → `CHANNEL_DOWN` / `CHANNEL_RECOVERED` / `PENDING_CLASSIFICATION` 从上线起没送达过任何管理员（`notifications` 表 **0 行**可证）
- `AUTH_ALERT`（BL-BILLING-AUDIT-EXT-P1 F-BAX-05）进了 Prisma enum 和 trigger，却没进 seed 名单、没进 API zod、没进 Settings UI → 对所有人都是死信

若不一并修复，本次新增的 `SYNC_RECONCILE_SKIPPED` 会掉进同一个坑，F-DSV4-03 等于白做。因此本 feature 额外交付：seed 名单补全（含 AUTH_ALERT）、API/Settings/通知中心接线、i18n 双语、回填脚本，以及一条把「enum 全集 ⊆ seed 名单」钉成结构性约束的测试。

**另记：** `tsconfig.json` 的 `exclude` 含 `scripts`，因此 `npx tsc --noEmit` **不覆盖 `scripts/` 下的脚本**（本次一个 Prisma 关系名笔误就是靠实跑才暴露的）。脚本类交付必须实跑 dry-run 验证，不能只靠 tsc。

## 6.8 fix_round 1（2026-07-26）— DSV4-DEF-01

**缺陷（Evaluator 首轮验收发现，High）：** 去重窗口对"根本没送出去"的通知也生效。

原实现每个 trigger 都是「先 `SET NX EX` 占键 → 再查管理员 → 再投递」。投递落空时（用户无该事件偏好行 → dispatcher 静默丢弃）键照样被占满一个 TTL，于是：

```
容器启动 → initial sync 命中护栏 → 占 24h 键 → 通知因缺偏好被丢弃
→ 运维回填偏好 → 再次触发被 NX 键拦住 → 首个有效告警被吞最多 24 小时
```

而"可见化"正是 F-DSV4-03 的全部目的。Evaluator 在 L1 fresh DB 上稳定复现（键 TTL 85498s、通知 0 条）。

**修复（用户裁决"修共用模式"）：** 去重窗口改为**从第一次成功投递开始计时**。

- `dispatcher.sendNotification` 返回 `boolean` —— 是否真的进入投递路径
- 新增 `notifyDeduped` 公共助手：仍用 `SET NX` 抢占（并发风暴防护不能丢），但**投递数为 0 时删键**，让下次触发还能告警
- 同形态的键原本 4 处各写一遍（`BALANCE_LOW` / `CHANNEL_DOWN` / `AUTH_ALERT` / `SYNC_RECONCILE_SKIPPED`），全部收敛到该助手，避免下次新增事件类型再踩

**为什么修全部 4 处而不只修 FAIL 项：** 本次部署与回填之间的窗口会同样吞掉 `CHANNEL_DOWN` 和 `AUTH_ALERT` 的首条告警 —— 只修一处等于明知故留。

**回归：** `dedup-delivery.test.ts` 7 例，含"回填前 0 投递不留键 → 回填后再触发必须投递"的缺陷核心场景。红/绿已验证（旧实现 5 红）。

## 7. 与 BL-IMG-I2I-VISION 的关系

BL-IMG-I2I-VISION 处于 `reverifying`（F-IIV-08 待 Codex 复验），本批次插队。挂起状态已归档：

- `docs/archive/features-BL-IMG-I2I-VISION-suspended.json`
- `docs/archive/progress-BL-IMG-I2I-VISION-suspended.json`

本批次 `done` 后由 Planner 还原该批次到 `reverifying`，Codex 继续 F-IIV-08。本批次不得触碰 i2i / vision 相关代码。

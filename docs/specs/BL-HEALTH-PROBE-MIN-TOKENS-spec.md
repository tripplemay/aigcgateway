# BL-HEALTH-PROBE-MIN-TOKENS Spec

**批次：** BL-HEALTH-PROBE-MIN-TOKENS（health probe 最小 token 兼容修复 + OR 已下线 channel 清理）
**负责人：** Planner / Generator = 默认映射 / Evaluator = Reviewer
**创建：** 2026-05-01
**工时：** 0.5 day
**优先级：** medium
**前置：** BL-HEALTH-PROBE-LEAN（F-HPL-01 把 max_tokens 从 200 降到 1，本批次回到 16）
**关联：** BL-ALIAS-MODEL-CASCADE-ENABLE Bug-D（alias 在 health 全 FAIL 时 /v1/models 静默隐藏）

## 背景

### 主因

`src/lib/health/checker.ts` 在 BL-HEALTH-PROBE-LEAN F-HPL-01 中将 probe 的 `chat({max_tokens})` 从 200 压到 1，目的是降低 ACTIVE aliased text channel 每 10 min probe 的上游 token 成本。

但 OpenRouter 上 Azure-backed 的 `openai/gpt-5` 系列模型要求 `max_output_tokens >= 16`，否则上游返回：

```
400 invalid_request_error: Invalid max_output_tokens: integer below minimum value.
Expected >= 16, got 1
```

直接 `curl POST openrouter/v1/chat/completions {model: openai/gpt-5, max_tokens: 1}` 即可复现。

### 链路放大效应

probe 持续 FAIL → channel `lastHealthResult='FAIL'` → `/v1/models` 后处理过滤 `lastCheck.result !== 'FAIL'`（参见 `src/app/api/v1/models/route.ts`）→ alias gpt-5 静默从用户面消失（即 BL-ALIAS-MODEL-CASCADE-ENABLE Bug-D）。Bug-D 的 admin 可见性已在上一批次 F-ACE-02/03 解决（`channels[].lastHealthResult` 暴露 + 全 FAIL 红色徽章），本批次只修根因。

### 两处硬编码（重要）

`grep "max_tokens: 1" src/lib/health/checker.ts` 命中 **两处**：

| 行号 | 函数 | 检查级别 | 描述 |
|---|---|---|---|
| `:148` | `runCallProbe` chat 默认分支 | `CALL_PROBE` | modality≠IMAGE/EMBEDDING 时走真实 chat |
| `:394` | `runTextCheck` | `CONNECTIVITY` | full health-check 文本路径 |

backlog 仅引用 `:394`。但 `:148` 是相同硬编码、相同 Azure-strict 风险，**必须同步改**（应用 Planner 铁律 1.5：枚举/字段扩展前置 grep 反向消费点 — 同款字面量分散两处，单点修补留隐患）。

### 附带运维清理

OpenRouter 已下线 `~openai/gpt-latest` model（curl `https://openrouter.ai/api/v1/models` 已无该条目）。本项目 `models` 表中若仍有该记录及关联 `channels`，应同步停用，否则继续产生无意义 probe + 计费日志。

## 目标

1. probe `chat()` 调用使用 `max_tokens=16`，兼容 Azure-strict provider（OpenRouter / Azure 直连等）的最小 `max_output_tokens` 限制
2. 单测 + 集成断言固化：probe 入参 `max_tokens` 为 16
3. 清理 OpenRouter 已下线 `~openai/gpt-latest` model + 其 channels（软停，保留审计记录）

## 非目标

- 不引入 per-channel/per-provider `probe_min_tokens` 配置（backlog 方案 C，0.5 day 干不完，留作后续按需）
- 不在 checker 中识别 `invalid_request_error` 做 PASS-but-warn 降级（backlog 方案 B，扩大 PASS 范围有误判风险，后续按需）
- 不改 BL-ALIAS-MODEL-CASCADE-ENABLE Bug-D 的 admin 可见性（已在上批次 F-ACE-02/03 解决）
- 不修改 `runApiReachabilityCheck`（它走 GET /models，不传 `max_tokens`）
- 不删除任何 health_checks / call_logs / channel 记录（保留审计）

## 关键设计决策

### D1：选方案 A（max_tokens 1 → 16），不选 B / C

| 方案 | 改动 | 风险 | 决议 |
|---|---|---|---|
| **A** probe min=16 | checker.ts 两处硬编码 1→16 | 月增 ≈ 16×46×144×30 ≈ 3.18M token ≈ **$0.45/月** | **选** |
| B 错误识别降级 | 加 `invalid_request_error → PASS-but-warn` 分支 | 把"参数不合法"误判为通道健康；未来上游返回类似码（如 token 超限）会一并放过 | 不选 |
| C per-channel 配置 | schema + admin UI + 字段验证 | 0.5 day 干不完；增加运维心智成本 | 不选 |

### D2：两处硬编码（`:148` + `:394`）必须同步改

仅改 `:394` 留 `runCallProbe` 隐患。两处统一改 16 + 同一 named const 提取（`PROBE_MAX_TOKENS = 16`）作为单一来源。

### D3：`~openai/gpt-latest` 走"软停"而非 DELETE

| 处理 | 优点 | 缺点 |
|---|---|---|
| **软停**（model.enabled=false + channel.status=DISABLED） | 保留 health_checks / call_logs 历史；OR 若复上线可一键启用 | 需脚本判定 model 名 |
| 硬删（DELETE channels/model） | 表更干净 | 历史 callLogs FK 断 / 不可恢复 |

选**软停**。与上批次"旁路修复"模式（`UPDATE models SET enabled=true ...`）一致。

### D4：清理脚本走 `scripts/maintenance/` + DRY_RUN

参考已有 `scripts/maintenance/strip-image-base64-2026-04-26.ts` 的范式。脚本必须：

- 幂等（重跑 0 affected 不报错）
- 支持 `DRY_RUN=1` 仅打印不写库
- 通过 model `name` 字段精确匹配（`~openai/gpt-latest`），避免误伤其他 model
- 不删除任何审计记录

## 设计

### F-HPMT-01：probe `max_tokens` 提升至 16（两处硬编码同步）

**文件：**

- `src/lib/health/checker.ts:148`（`runCallProbe` chat 分支）
- `src/lib/health/checker.ts:394`（`runTextCheck`）

**改动：**

```ts
// 文件顶部 import 区下、export 函数前加常量
/**
 * Probe chat() 的最小 max_tokens。
 *
 * BL-HEALTH-PROBE-LEAN F-HPL-01 曾将其降为 1（节省 token 成本）。
 * BL-HEALTH-PROBE-MIN-TOKENS 回到 16，因 OpenRouter Azure-backed
 * model（如 openai/gpt-5）要求 max_output_tokens >= 16，否则上游
 * 返回 invalid_request_error 导致 probe 永远 FAIL。
 *
 * 月成本影响：16 × 46 ACTIVE × 144 次/天 × 30 天 ≈ 3.18M token / 月，
 * 约 $0.45/月（按 $0.15/1M 计），可接受。
 */
const PROBE_MAX_TOKENS = 16;
```

`:148` 与 `:394` 两处 `max_tokens: 1` 全部替换为 `max_tokens: PROBE_MAX_TOKENS`。

**单测：**

- 更新 `src/lib/health/__tests__/checker-lean.test.ts:87`：`expect(request.max_tokens).toBe(16)`（含注释引用本批次 ID）
- 新增一条 `runCallProbe` chat 分支测试（mock `chatCompletions`，断言 `max_tokens=16`），覆盖 `:148` 路径

### F-HPMT-02：清理 OpenRouter `~openai/gpt-latest` 已下线 channel

**新文件：** `scripts/maintenance/disable-or-deprecated-models.ts`

（命名通用化，未来其他 OR 下线 model 可复用同一脚本）

**逻辑：**

```ts
const DEPRECATED_MODEL_NAMES = ["~openai/gpt-latest"];
const DRY_RUN = process.env.DRY_RUN === "1";

for (const name of DEPRECATED_MODEL_NAMES) {
  const model = await prisma.model.findUnique({
    where: { name },
    include: { channels: true },
  });

  if (!model) {
    console.log(`[skip] model "${name}" not found, nothing to do`);
    continue;
  }

  console.log(`[target] model="${name}" id=${model.id} enabled=${model.enabled}`);
  console.log(`[target]   ${model.channels.length} channel(s):`);
  for (const ch of model.channels) {
    console.log(`           - channel id=${ch.id} status=${ch.status}`);
  }

  if (DRY_RUN) {
    console.log(`[dry-run] no DB writes`);
    continue;
  }

  await prisma.$transaction([
    prisma.model.update({
      where: { id: model.id },
      data: { enabled: false },
    }),
    prisma.channel.updateMany({
      where: { modelId: model.id },
      data: { status: "DISABLED" },
    }),
  ]);
  console.log(`[done] disabled model + ${model.channels.length} channel(s)`);
}

await prisma.$disconnect();
```

**幂等：** 脚本可重跑；二次跑时 model.enabled 已为 false / channel.status 已为 DISABLED，仍执行同样 UPDATE（Prisma 不报错）+ 日志区分初次 vs 复跑（可选优化，当前实现的 0 affected 也接受）。

**审计：** `health_checks` / `call_logs` 不动；`channels` / `models` 软停而非 DELETE。

### F-HPMT-03：Codex 验收 + 报告

按 BL-ALIAS-MODEL-CASCADE-ENABLE 范式（Reviewer 上次签收路径），交 Codex 跑：

1. `bash scripts/test/codex-setup.sh` + `codex-wait.sh`
2. 代码层验收：
   - grep `checker.ts` 确认 `:148` + `:394` 两处都引用 `PROBE_MAX_TOKENS`
   - `checker-lean.test.ts` 期望 `max_tokens=16` 单测 PASS
   - 新增 `runCallProbe` chat 分支单测 PASS
   - `npx tsc --noEmit` / `npm run test` / `npm run build` 全 PASS
3. 数据脚本验收：
   - `DRY_RUN=1 npx tsx scripts/maintenance/disable-or-deprecated-models.ts` 列出受影响 model + channels（dev/seed DB 上）
   - 非 dry-run 跑后：(a) `prisma.model.findUnique({where:{name:'~openai/gpt-latest'}})` 的 `enabled` 为 false；(b) 对应 channels `status` 为 DISABLED；(c) `health_checks` + `call_logs` 行数前后一致（保留审计）
   - 二次跑脚本 idempotent（不报错）
4. 输出 `docs/test-reports/BL-HEALTH-PROBE-MIN-TOKENS-signoff-YYYY-MM-DD.md`

## 数据模型 / 接口

无 schema / API 改动。仅常量值变更 + 新增一个 maintenance 脚本。

## 风险与回滚

| 风险 | 缓解 |
|---|---|
| `max_tokens=16` 让某严苛 provider 返 4xx（理论上不会，16 通常是 floor） | 实测 4 PASS 验收 + 现网 24h soak 监控 health_check 整体 PASS 率 |
| 维护脚本误伤其他 model | 用 `findUnique({where:{name}})` 精确匹配 + DRY_RUN 默认走过 |
| 月成本上涨 | 已估算 ≈ $0.45/月，远低于一次误判隐藏 alias 的业务损失 |

**回滚：**

- F-HPMT-01：单 commit `git revert`，回到 `PROBE_MAX_TOKENS=1`（即等价 BL-HEALTH-PROBE-LEAN 状态）
- F-HPMT-02：脚本是软停操作；如需复活 `~openai/gpt-latest` 直接 `UPDATE models SET enabled=true; UPDATE channels SET status='ACTIVE' WHERE modelId=...`

## 验收摘要

见 `features.json` 中三条 feature 的 `acceptance`。

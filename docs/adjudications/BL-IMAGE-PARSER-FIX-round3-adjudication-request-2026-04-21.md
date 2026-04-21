# 裁决申请 — BL-IMAGE-PARSER-FIX Round 3 Fixing

**申请方：** Generator (Kimi)
**裁决方：** Planner
**申请时间：** 2026-04-21
**批次：** BL-IMAGE-PARSER-FIX
**阶段：** fixing（fix_rounds=1，round 3 reverifying FAIL）
**状态：** `awaiting-planner-adjudication`

---

## 背景

Codex round 3 reverifying 结果：**8 PASS / 1 PARTIAL / 2 FAIL**。

- **#7 FAIL** — data URI 直返（代码问题，Generator 直接修 — **不需裁决**）
- **#10 BLOCKED** — pm2 logs 无时间戳，无法完成 "部署前后 1h extraction failed 降幅 > 80%" 同口径量化 —— **需 Planner 裁决**

---

## 裁决点 #10 — pm2 log 时间戳量化 acceptance

### 冲突描述

| 来源 | 原文（摘录） |
|---|---|
| `docs/specs/BL-IMAGE-PARSER-FIX-spec.md` F-IPF-03 acceptance 第 10 条 | "部署后 1h 内 pm2 logs [imageViaChat] extraction failed 出现次数显著下降（对比 fix round 1 部署前，降幅 > 80%）" |
| Codex 证据 | `pm2 logs aigc-gateway --nostream --lines 20000` 输出 **无时间戳**（见 artifacts/pm2-logs-20000.txt），无法按 1h 窗口分桶 |
| Generator 现状 | repo 无 `ecosystem.config.cjs`（gitignore 或从未 commit），生产 `/opt/aigc-gateway/ecosystem.config.cjs` 内容 Generator 不知晓；擅写 repo 版本 → `git reset --hard` 后覆盖生产本地配置，**可能破坏 pm2 启动**（env/script/cwd 与生产差异） |

### 矛盾本质

- acceptance 要求 "pm2 logs 1h 降幅量化" 隐含要求 pm2 log 行带时间戳
- pm2 默认 **不带时间戳**（需 `log_date_format` 配置）
- 配置文件在生产服务器本地（非 repo），Generator 职责边界外

### 三个方案

| 方案 | 实现 | 风险 | 职责边界 |
|---|---|---|---|
| **A. 修订 acceptance #10 为基于 call_logs / database 降幅** | 用 DB 查询 `call_logs WHERE channelId=X AND status='ERROR' AND errorMessage LIKE '%extraction failed%' AND createdAt >= <deploy-ts>` 对比前后 1h 失败数 | ✅ 无运维风险；数据库已有完整证据（artifacts 里 `prod-image-calllogs-3h.json` 已含） | Planner 修订 spec（Generator 不自动改） |
| **B. Generator 在 repo 新建 `ecosystem.config.cjs` 加 `log_date_format`** | 写 repo 版本覆盖生产本地版本 | ⚠️ 生产如有本地 env/script/cwd 差异配置，下次 deploy 会破坏 pm2 启动 | 应由运维/SRE 做，不是 Generator 代码变更 |
| **C. Codex 用 shell 工具（如 `ts`/`awk`）在 pm2 logs 外部加时间戳** | Codex 测试侧处理，代码不改 | ✅ 无代码变更；⚠️ pm2 log 行没有内生时间戳，外部打时间戳只能标记"读到的时刻"而非"日志产生时刻"，不满足 1h 降幅量化精度 | Codex 测试工具问题 |

### Generator 意见

**方案 A**（修订 acceptance 为 DB 基数据）。

理由：
1. call_logs 表 `status='ERROR' + errorMessage LIKE '%extraction failed%'` 比 pm2 log 行更精准（有精确 createdAt 时间戳，可精确分钟级分桶）
2. Codex round 3 已采集 artifacts/prod-image-calllogs-3h.json，数据可用
3. 避免 Generator 擅动生产 PM2 配置的风险
4. pm2 log 是运维观测通道，不应作为 acceptance 唯一证据源

方案 B 需 Planner 确认生产 ecosystem.config.cjs 内容后再做，否则推部署风险大于收益。

### 需要 Planner 决定

- [ ] 方案 A（修订 #10 为基于 call_logs DB 查询降幅）
- [ ] 方案 B（指示 Generator 按生产实际内容新建 ecosystem.config.cjs）— **需先补全生产配置信息**
- [ ] 方案 C（指示 Codex 用测试侧工具量化）
- [ ] 其他（请说明）

---

## 其他 (#7 不需裁决)

Generator 已修 `src/app/api/v1/images/generations/route.ts:140-143`：对 `data:` scheme URL 跳过 proxy 重写，尊重 F-ACF-07 原意（隐藏上游 hostname），data URI 透传给客户端。

修复内容：
```ts
url:
  d?.url && !d.url.startsWith("data:")
    ? buildProxyUrl(traceId, i, origin)
    : d?.url,
```

待裁决后补单测 + 推 reverifying。

---

## 裁决栏（Planner 填写）

**裁决时间：** 2026-04-21
**裁决人：** Planner (Kimi)
**裁决点 #10：** [x] **A — 修订 acceptance #10 为基于 call_logs DB 查询降幅**

**理由：**
1. Generator 分析完整、论据充分。call_logs 有精确 `createdAt`（毫秒级），比 pm2 log 更精准；同一 bug 在 call_logs 里留下持久、可查、可分桶的证据
2. 方案 B 要求 Generator 修改 pm2 运行时配置 → 非代码变更，越界且可能破坏生产启动
3. 方案 C 的外挂时间戳只能标记"读入时刻"而非"产生时刻"，不满足 1h 精度
4. pm2 log 是运维观测通道而非 acceptance 唯一证据源 —— 原 spec #10 写法实际隐含了运维侧预设，不该入 acceptance
5. artifacts/prod-image-calllogs-3h.json 已采集，数据立即可用，无需再等部署观察窗口

**spec 修订说明（#10 改写）：**

将 F-IPF-03 验收项 #10 从：
> "部署后 1h 内 pm2 logs [imageViaChat] extraction failed 出现次数显著下降（对比 fix round 1 部署前，降幅 > 80%）"

改为：

> **10. 查询 call_logs 部署前后 1h 的图片 parser 失败数降幅 > 80%。**
> 
> 执行 SQL（或等价管理 API 查询），以 fix round 1 部署时间戳 `T_deploy`（commit 5acfa2b 部署至 pm2 实际重启时刻，可从 pm2 jlist pm_uptime 精准获取）为界：
> 
> ```sql
> SELECT
>   CASE WHEN "createdAt" < $T_deploy THEN 'before' ELSE 'after' END AS window,
>   COUNT(*) AS parser_failure_count
> FROM call_logs
> WHERE "createdAt" >= $T_deploy - INTERVAL '1 hour'
>   AND "createdAt" <= $T_deploy + INTERVAL '1 hour'
>   AND status = 'ERROR'
>   AND "errorMessage" ILIKE '%text instead of an image%'
>   AND "modelName" IN ('gpt-image', 'gpt-image-mini', 'gemini-3-pro-image')
> GROUP BY window;
> ```
> 
> **断言：** `(before - after) / before > 0.80`；或若 before > 0、after == 0 则视为满足。
> 
> **证据落盘：** 查询结果 JSON 归档到 `docs/test-reports/artifacts/bl-image-parser-fix-prod-reverify-2026-04-21/calllogs-hour-window.json`，含两桶的 count + 明示 T_deploy 时间戳。

**其他指示：**

- **裁决点 #7**：Generator 已在 `src/app/api/v1/images/generations/route.ts:138-150` 做了正确修改（data URI 跳过 proxy 重写，保留 F-ACF-07 对真实上游 URL 的 hostname 隐藏意图）。无需 Planner 干预，**确认采纳**。补单测（e.g. `images/generations` route 单测加 2 条：data URI 输入 → 直返；http URL 输入 → 包装 proxy）。
- **features.json F-IPF-03 acceptance 同步修订**（Generator 提单测 + 代码时，features.json 由 Planner 本次裁决后同步改）。
- **spec 文档同步修订**（Planner 本次改）。
- **harness learning 沉淀**：本次裁决第二次命中"acceptance 混入运维侧预设"问题（对比 BL-SEC-POLISH 的 HTTP 429 协议层断言）。追加到 proposed-learnings.md：**Planner 写 acceptance 时，"证据来源"必须限定在 Generator 代码 + Evaluator 测试可控范围内，不得依赖运维侧配置（pm2 log_date_format / logrotate / env 注入等）**。

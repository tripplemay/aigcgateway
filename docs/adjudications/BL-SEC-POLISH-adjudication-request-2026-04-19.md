# 裁决申请 — BL-SEC-POLISH Round 1 Fixing

**申请方：** Generator (Kimi)
**裁决方：** Planner
**申请时间：** 2026-04-19
**批次：** BL-SEC-POLISH
**阶段：** fixing（fix_rounds=0）
**状态：** `awaiting-planner-adjudication`

---

## 背景

Round 1 verifying 结果：**15 PASS / 2 PARTIAL / 1 FAIL**。

- 15 项通过：login cost=12 / rehash / IP+account 双桶 rate limit / SSRF 三种私网 / image-proxy CT / e2e-errors fatal / stress-test 日期 / setup-zero-balance bcrypt 格式 / build+tsc+vitest。
- **3 个阻断项**中：
  - **#13** setup-zero-balance 脚本 `project.balance` / `apiKey.projectId` 遗留字段错误 —— 纯 bug，Generator 直接修，**不需裁决**。
  - **#1 / #14** 存在 *spec acceptance 字面口径* 与 *spec 背景 / 设计决策 / 协议规范* 的结构性冲突，需 Planner 裁决。

Generator 不自主决定是否修订 spec，不自主回退实现。按裁决结果执行。

---

## 裁决点 #1 — login 不存在用户响应时延

### 冲突描述

| 来源 | 原文（摘录） |
|---|---|
| `docs/specs/BL-SEC-POLISH-spec.md` acceptance 第 1 条 | "login 不存在用户 + 错密码响应 **< 50ms**" |
| `docs/code-review/batch-06-security.md` H-7 背景 | "bcrypt.compare 在 deletedAt/suspended 检查之前（**时序 oracle 属实**），攻击者可通过响应时长枚举账号" |
| Planner session_notes（批次启动时） | "F-SP-01 suspended 账号也返 401 + 内部日志（防账号枚举），**dummy bcrypt 或 100ms 固定延迟抗时序**" |
| F-SP-01 acceptance 条 1 尾部 | "单测：**dummy bcrypt vs 真 bcrypt 响应时长差 < 20ms**；rate limit 并发超限生效" |

### 矛盾本质

- 同一个 spec 同时要求"不存在用户快速返回 <50ms"**和**"dummy vs real bcrypt 差 <20ms"。
- 前者=快速路径（user 不存在无需 bcrypt），后者=恒定路径（user 不存在也走 dummy bcrypt）。
- 二者不可同时成立：若 <50ms 则必然跳过 bcrypt（user 不存在路径），时序 oracle 复现。
- Codex verifying report 第 69 行：*"建议确认验收口径是否应改为'与存在用户错误密码时延接近'，而非 <50ms。"*

### Generator 当前实现

- `src/app/api/auth/login/route.ts` login 总走 bcrypt.compare（真 hash 或 module-load 时生成的 `DUMMY_BCRYPT_HASH` cost=12）
- 所有 unusable 路径（user 缺失 / bad pw / suspended / deleted）合并 401 invalid_credentials + console.warn 内部日志
- 实测：存在+错密 ~220ms；不存在+错密 ~218ms；差值 <20ms → 满足 acceptance "dummy vs real <20ms" 口径，但不满足 "<50ms" 口径

### 两个方案

| 方案 | 实现 | 安全 | 口径后续 |
|---|---|---|---|
| **A. 保持恒定时延**（当前实现） | 当前代码不变 | ✅ 抗时序枚举；符合 spec 背景 H-7 / 设计决策 / "dummy vs real <20ms" 口径 | **修订 spec acceptance #1** 为 "nonexistent+wrong-pw 与 existing+wrong-pw 时延差 < 20ms"（等价于 dummy 路径生效） |
| **B. 回退为 <50ms** | login 改回 user 不存在快速返回 401，不走 bcrypt | ❌ 恢复时序 oracle（spec 背景 H-7 原漏洞）；与 Planner session_notes"防账号枚举"决策冲突 | #1 字面满足，但 #2（存在+错密 >150ms）和 #3（rehash）要求 bcrypt 路径保留；实现复杂度增加 |

### Generator 意见

方案 A。**方案 B 会重新引入 spec 明确列举的 H-7 漏洞**。

### 需要 Planner 决定

- [ ] 方案 A（修订 acceptance，保留实现）
- [ ] 方案 B（回退实现，满足字面 <50ms）
- [ ] 其他（请说明）

---

## 裁决点 #14 — run_template rate limit 协议层

### 冲突描述

| 来源 | 原文（摘录） |
|---|---|
| `docs/specs/BL-SEC-POLISH-spec.md` F-SP-04 acceptance 第 14 条 | "run-template test_mode=execute 超过 rate limit → **429**" |
| MCP SDK 协议标准 | 工具（tool）的错误用 `CallToolResult.isError: true` + `content` 文本，**HTTP 层始终返 200**（错误语义在 body 不在 status code） |
| `src/lib/mcp/tools/run-template.ts` 现实现 | `return { content: [{ type: "text", text: "Rate limit exceeded. Retry after 60s." }], isError: true }` |
| Codex verifying report 第 54 行 | "口径差异：若按'语义限流'判定则 PASS；若按'HTTP 429'严格判定则不满足" |

### 矛盾本质

- MCP 工具无 HTTP 429 返回能力（协议层由 @modelcontextprotocol/sdk 封装，tool handler 只能返 `CallToolResult`）
- 强行改 HTTP 429 需要绕过 SDK，破坏 MCP 协议，MCP client 无法正确解析错误

### Generator 当前实现

- `isError: true` + 文本 "Rate limit exceeded. Retry after 60s." — 符合 MCP 协议
- 语义上已表达"限流"；Codex probe 已确认第二次调用被阻断（语义层生效）

### 两个方案

| 方案 | 实现 | 协议正确性 | 口径后续 |
|---|---|---|---|
| **A. 保持 MCP 标准**（当前实现） | `isError: true` + 文本含 rate limit exceeded | ✅ 符合 MCP | **修订 spec acceptance #14** 为 "返 CallToolResult.isError=true 且 content 文本含 'Rate limit exceeded'" |
| **B. 改 HTTP 429** | 需要在 `@modelcontextprotocol/sdk` 的 transport 层注入非标准 HTTP 状态码 | ❌ 违反 MCP 协议；MCP client 不解析；实现上在 SDK 封装外基本不可行 | 字面满足但协议坏 |

### Generator 意见

方案 A。**方案 B 技术上不可行**（MCP SDK 不暴露 HTTP 状态控制）且违反协议。

### 需要 Planner 决定

- [ ] 方案 A（修订 acceptance 为 MCP 协议标准表达）
- [ ] 方案 B（强制 HTTP 429，需 Planner 提供 SDK-side 实现指导）
- [ ] 其他（请说明）

---

## 附带 Framework 提案

本次暴露流程空白：**Generator 发现 spec acceptance 与 spec 背景 / 设计决策 / 协议规范冲突时，harness 无明确裁决流程**。

建议 `harness-rules.md` 新增：

> **Generator 裁决申请规则**：Generator 在 fixing 阶段若发现 spec acceptance 条款与以下任一项冲突：(a) 同一 spec 背景 / 风险分析 / 设计决策；(b) 协议规范 / 语言标准；(c) Planner session_notes 的设计目标 —— 应在 `docs/adjudications/` 下落盘裁决申请（本文件即模板），由 Planner 读取并裁决。Generator 不自主回退或坚持实现。

done 阶段由 Generator 追加到 `.auto-memory/proposed-learnings.md`。

---

## 裁决栏（Planner 填写）

**裁决时间：** 2026-04-19
**裁决人：** Kimi（Planner）
**裁决点 #1：** ✅ A（保留恒定时延实现）
**裁决点 #14：** ✅ A（保留 MCP isError 实现）

**spec 修订说明：**

### #1 根因分析

Planner 初稿 spec 的 acceptance #1 "< 50ms" 数值未核实，与**同一 spec 内** H-7 背景 + 设计决策 + acceptance 第 1 条尾部 "dummy vs real < 20ms" 四处自相矛盾。方案 B 会重新引入 H-7 时序 oracle 漏洞。违反了 framework 铁律 1.1（acceptance 的"实现形式"与"语义意图"必须分离）。

**修订：**
- `features.json` F-SP-04 acceptance 第 1 项：`"login 不存在用户 + 错密码响应 < 50ms"` → `"login 不存在用户+错密码 与 存在用户+错密码 响应时长差 < 20ms（抗时序枚举，两种路径均走 bcrypt cost=12）；两者绝对时长约 150-250ms 均可接受"`
- `docs/specs/BL-SEC-POLISH-spec.md` 同步更新 F-SP-04 AUTH 组第 1/2 项描述

### #14 根因分析

Planner 在 2026-04-18 采纳**铁律 2.1**（协议返回形式断言必须标明协议层，来源 F-IG-04 MCP 403 事件），但本次 SEC-POLISH spec 写作时未自觉应用铁律 2.1，F-SP-04 #14 又犯了同类错误要求 "→ 429"。MCP 协议 tool 错误按 SDK 标准即 `{isError: true, content}` + HTTP 200，强制 HTTP 429 技术不可行且违反 MCP 协议规范。

**修订：**
- `features.json` F-SP-04 acceptance 第 14 项：`"run-template test_mode=execute 超过 rate limit → 429"` → `"run-template test_mode=execute 超过 rate limit → CallToolResult.isError=true + content[0].text 含 'Rate limit exceeded'（MCP 协议标准，外层 HTTP 200）"`
- `docs/specs/BL-SEC-POLISH-spec.md` 同步更新 F-SP-03 run-template 条款 + 附注铁律 2.1 来源

**其他指示：**

1. Generator 只需修 #13（setup-zero-balance `project.balance` 纯 bug），#1/#14 按裁决**不动代码**
2. Evaluator 按修订后的 acceptance 重判 → 预期 18/18 PASS
3. done 阶段将 Generator 附带 framework 提案（Generator 裁决申请规则）追加到 `.auto-memory/proposed-learnings.md`
4. **Planner 本次再踩铁律 2.1 反例** — 本事件本身也值得沉淀，提案池同步追加"Planner 自觉应用已采纳铁律"的自我提醒机制

---

## Planner 自省

本次我两次犯同类错误（SEC-POLISH spec #1 + #14）：
- #1：acceptance 具体数值（< 50ms）未与同文语义意图交叉验证 → 违反铁律 1.1
- #14：MCP 协议 acceptance 要求 HTTP 429 → 违反自己已采纳的铁律 2.1

**教训：** 写 acceptance 时不仅要 Read 源码核实，还要**回看自己立的铁律清单逐条自检**。铁律是给自己看的，不是给别人看的。

本次裁决流程本身（Generator 主动落盘 adjudication → Planner 裁决）是宝贵沉淀，应纳入 framework。

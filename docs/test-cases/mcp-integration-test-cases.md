# MCP 集成测试用例

> P2-6 | 2026-04-03（分层策略更新：2026-04-03）
> 执行方式：自动化脚本 + 手动验证

---

## 分层测试说明

本文件采用两层测试策略（详见 `AGENTS.md §17`）：

| 层级 | 标注 | 执行环境 | 说明 |
|------|------|---------|------|
| **L1** | `[L1]` | `localhost:3099` | 基础设施层：协议、认证、路由、读类 Tools、错误处理。种子数据使用占位符 provider key，不发起真实 AI 调用。 |
| **L2** | `[L2]` | Staging（含真实 provider key） | 全链路层：chat / generate_image 真实调用、CallLog 写入、source 字段、计费扣减。需用户授权并提供 Staging 地址和 Key。 |

**L1 FAIL 不等于 L2 FAIL**，报告中必须区分失败层级。

---

## 测试范围

验证 MCP 服务器的 7 个 Tools 全链路正确性，覆盖：认证、Tool 调用、审计日志来源、计费一致性、错误场景。

**不在本次测试范围：**
- 真实 AI 编辑器（Claude Code / Cursor）接入体验（人工验收，本次跳过）
- Server Instructions 在编辑器中的行为验证（同上）

---

## 自动化脚本

| 脚本 | 用途 |
|------|------|
| `scripts/test-mcp.ts` | 全链路正向测试（8 步） |
| `scripts/test-mcp-errors.ts` | 错误场景测试 |

执行命令：
```bash
BASE_URL=http://localhost:3099 API_KEY=pk_xxx npx tsx scripts/test-mcp.ts
BASE_URL=http://localhost:3099 API_KEY=pk_xxx npx tsx scripts/test-mcp-errors.ts
```

---

## TC-01：认证

| # | 用例 | 步骤 | 预期结果 | 执行方式 |
|---|------|------|---------|---------|
| 01-1 | 有效 Key 初始化成功 | POST /mcp，Bearer pk_xxx，method=initialize | HTTP 200，返回 serverInfo.name | 脚本 |
| 01-2 | 无效 Key 返回 401 | Bearer pk_invalid_xxx | HTTP 401 | 脚本 |
| 01-3 | 无 Authorization Header | 不传 Authorization | HTTP 401 | 脚本 |
| 01-4 | Key 放在 URL 参数 | ?key=pk_xxx | HTTP 400，error 含 "URL" | 脚本 |

---

## TC-02：Tools 列举

| # | 用例 | 步骤 | 预期结果 | 执行方式 |
|---|------|------|---------|---------|
| 02-1 | 返回 7 个 Tools | method=tools/list | tools 数组长度 >= 7 | 脚本 |
| 02-2 | 每个 Tool 字段完整 | 同上 | 每个 Tool 含 name / description / inputSchema | 脚本 |
| 02-3 | 7 个 Tool 名称正确 | 同上 | list_models / chat / generate_image / list_logs / get_log_detail / get_balance / get_usage_summary 全部存在 | 脚本 |

---

## TC-03：list_models Tool

| # | 用例 | 步骤 | 预期结果 | 执行方式 |
|---|------|------|---------|---------|
| 03-1 | 无参数返回全部模型 | tools/call list_models，无参数 | 返回数组，长度 > 0 | 脚本 |
| 03-2 | modality=text 只返回文本模型 | 参数 modality="text" | 所有结果的 modality 为 text | 脚本 |
| 03-3 | modality=image 只返回图片模型 | 参数 modality="image" | 所有结果的 modality 为 image | 脚本 |
| 03-4 | 返回字段完整 | 无参数 | 每个模型含 name / modality / contextWindow / price | 脚本 |

---

## TC-04：chat Tool

| # | 层级 | 用例 | 步骤 | 预期结果 | 执行方式 |
|---|------|------|------|---------|---------|
| 04-1 | **[L2]** | 正常调用返回文本 | model=deepseek/v3，messages=[{role:user,content:"Say OK"}]，max_tokens=10 | content 非空，含 traceId 和 usage | 脚本 |
| 04-2 | **[L2]** | traceId 格式正确 | 同上 | traceId 以 "trc_" 开头 | 脚本 |
| 04-3 | **[L2]** | **CallLog source='mcp'** | chat 调用后，通过 get_log_detail 查 traceId 对应日志 | CallLog.source === 'mcp' | 脚本 |
| 04-4 | **[L2]** | **计费一致性** | 用相同模型相同 messages 分别通过 MCP chat 和 POST /v1/chat/completions 各调用一次，比较 cost | 两次 cost 相差不超过 5%（token 数相近时） | 脚本 |
| 04-5 | **[L1]** | 无效模型返回 isError | model="nonexistent/model" | isError=true，错误信息含 "not found" 或 "list_models" 提示 | 脚本 |
| 04-6 | **[L1]** | **余额不足返回 isError** | 使用余额为 0 的测试项目 API Key 调用 | isError=true，错误信息含余额信息 | 脚本 |
| 04-7 | **[L2]** | 调用后余额扣减 | chat 调用前后各查一次 get_balance | 调用后余额 < 调用前余额 | 脚本 |

---

## TC-05：generate_image Tool

| # | 层级 | 用例 | 步骤 | 预期结果 | 执行方式 |
|---|------|------|------|---------|---------|
| 05-1 | **[L2]** | **正常调用返回图片 URL** | model=（有效图片模型），prompt="a red circle"，size="1024x1024" | 返回 imageUrls 数组，含 traceId 和 cost | 脚本 |
| 05-2 | **[L2]** | **CallLog source='mcp'** | generate_image 后通过 get_log_detail 查审计日志 | CallLog.source === 'mcp' | 脚本 |
| 05-3 | **[L1]** | 无效图片模型返回 isError | model="nonexistent/image-model" | isError=true | 脚本 |

---

## TC-06：list_logs Tool

| # | 层级 | 用例 | 步骤 | 预期结果 | 执行方式 |
|---|------|------|------|---------|---------|
| 06-1 | **[L1]** | 默认返回最近记录 | 无参数 | 返回数组，每条含 traceId / model / status / cost / latency | 脚本 |
| 06-2 | **[L1]** | limit 参数有效 | limit=3 | 返回数组长度 <= 3 | 脚本 |
| 06-3 | **[L1]** | **model 筛选有效** | model="deepseek/v3" | 所有返回记录的 model === "deepseek/v3" | 脚本 |
| 06-4 | **[L1]** | **status 筛选有效** | status="success" | 所有返回记录的 status === "success" | 脚本 |
| 06-5 | **[L2]** | **search 全文搜索** | search="Say OK" | 返回含该 prompt 的记录（需先通过 L2 chat 产生含此词的 log） | 脚本 |
| 06-6 | **[L1]** | 不返回其他项目日志 | 使用项目 A 的 Key 调用，检查结果 | 无项目 B 的记录 | 脚本（跨项目隔离） |

---

## TC-07：get_log_detail Tool

| # | 层级 | 用例 | 步骤 | 预期结果 | 执行方式 |
|---|------|------|------|---------|---------|
| 07-1 | **[L2]** | 有效 traceId 返回完整详情 | trace_id=（L2 chat 步骤返回的 traceId） | 含 prompt（messages 数组）/ response / model / usage / cost / status / source | 脚本 |
| 07-2 | **[L1]** | 不存在的 traceId 返回 isError | trace_id="trc_nonexistent_fake" | isError=true，含 "not found" | 脚本 |
| 07-3 | **[L1]** | 跨项目 traceId 拒绝访问 | 使用项目 A 的 Key 查项目 B 的 traceId | isError=true | 脚本 |

---

## TC-08：get_balance Tool

| # | 层级 | 用例 | 步骤 | 预期结果 | 执行方式 |
|---|------|------|------|---------|---------|
| 08-1 | **[L1]** | 不含交易记录 | include_transactions=false（或不传） | 返回 balance，无 transactions 字段 | 脚本 |
| 08-2 | **[L1]** | 含交易记录 | include_transactions=true | 返回 balance + transactions 数组（最多10条） | 脚本 |
| 08-3 | **[L1]** | 余额值非负且格式正确 | get_balance 返回值 | balance 字段为数值，格式如 "$50.0000" | 脚本 |

---

## TC-09：get_usage_summary Tool

| # | 层级 | 用例 | 步骤 | 预期结果 | 执行方式 |
|---|------|------|------|---------|---------|
| 09-1 | **[L1]** | period=today | period="today" | 返回含 totalCalls / totalCost / totalTokens / avgLatency / topModels | 脚本 |
| 09-2 | **[L1]** | period=7d（默认） | 不传或 period="7d" | 同上，数值 >= today | 脚本 |
| 09-3 | **[L1]** | period=30d | period="30d" | 同上，数值 >= 7d | 脚本 |

---

## TC-10：限流共享

| # | 层级 | 用例 | 步骤 | 预期结果 | 执行方式 |
|---|------|------|------|---------|---------|
| 10-1 | **[L2]** | MCP 调用消耗 API 配额 | 先用 MCP chat 把 RPM 跑满，再通过 API 调用 /v1/chat/completions | API 调用返回 429 | 手动（限流阈值较高，自动化成本高） |

---

## 自动化脚本执行命令

**L1 本地基础设施层（无需真实 provider key）：**
```bash
BASE_URL=http://localhost:3099 API_KEY=pk_xxx npx tsx scripts/test-mcp.ts
BASE_URL=http://localhost:3099 API_KEY=pk_xxx npx tsx scripts/test-mcp-errors.ts
```

**L2 Staging 全链路层（需真实 provider key，需用户授权）：**
```bash
BASE_URL=https://staging.example.com API_KEY=pk_xxx npx tsx scripts/test-mcp.ts
BASE_URL=https://staging.example.com API_KEY=pk_xxx npx tsx scripts/test-mcp-errors.ts
```

---

## 验收标准

**L1 签收条件：**
所有标注 `[L1]` 的用例自动化通过，输出签收报告到 `docs/test-reports/mcp-integration-l1-signoff-{date}.md`。

**L2 签收条件：**
在用户提供 Staging 环境和授权后，所有标注 `[L2]` 的用例自动化通过，输出签收报告到 `docs/test-reports/mcp-integration-l2-signoff-{date}.md`。

**TC-10-1** 为手动项，在条件具备时单独验收，不阻塞任何一层的签收结论。

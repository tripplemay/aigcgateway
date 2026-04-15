# AUDIT-FOLLOWUP 批次规格文档

**批次代号：** AUDIT-FOLLOWUP
**目标：** 修复 reports-20260414 审计中真正新发现的 2 条 critical/high 问题 + 3 个 DX 小改进 + 审计工具稳定性
**触发时机：** WORKFLOW-POLISH 签收（已满足）
**规模：** 4 个 generator + 1 个 codex 验收 = 5 条

## 背景

reports-20260414 审计共 41 条断言，但时效性分析表明：
- **审计于 2026-04-14 06:20 UTC 开始**
- **AUDIT-CRITICAL-FIX 部署于 2026-04-14 07:03 UTC**
- 审计前 43 分钟生产跑的是旧版代码

所以大部分 "严重问题" 是部署前的旧状态：
- RL-003/005/006/007 / RL-004 / FIN-001 / DX-002/003/006 onboarding / MOD-003/004 → 已被 AUDIT-CRITICAL-FIX + WORKFLOW-POLISH 覆盖，部署后会消失
- RL-001 15 并发无限流 → RATE-LIMIT 覆盖，部署后会消失
- Workflow-Audit 全部 7 条 → MCP 会话初始化失败导致的假阳性

**真正新发现的 2 条关键问题：**
1. **RL-002 / IDOR-006** — 错误响应和日志中含 API Key 前缀 `sk-B2n****zjvw`（F-ACF-08 脱敏规则没覆盖）
2. **FIN-002 / FIN-002 onboarding** — `get_log_detail.usage` 缺 `reasoningTokens` 字段（F-DP-07 只加到 chat 响应，log 持久化路径遗漏）

**3 个 DX 小改进：**
- DX-001 onboarding：MCP 工具未暴露 REST baseUrl
- DX-004 onboarding：chat messages 参数传字符串报 Zod 原始错误不友好
- DX-005 onboarding：list_logs 缺 start_time/end_time 时间范围过滤

**审计工具稳定性：**
- Chaos-Audit 本次 socket 错误完全失败（243 字节文件，0 条断言）
- Workflow-Audit 的 MCP 会话初始化失败，只看到 7 个兜底工具 → 假阳性
- run_all_audits.sh 需要 MCP 预检 + 失败重试

## Features

| ID | 标题 | 优先级 | 来源 | 验收 |
|----|------|--------|------|------|
| F-AF-01 | API Key 前缀脱敏规则扩展（API + 日志层双重过滤） | critical | RL-002, IDOR-006 | 1) src/lib/api/error-sanitizer.ts 增加正则 `/sk-[a-zA-Z0-9*\-]{8,}/g → [key removed]`（覆盖 OpenAI / OpenRouter / Anthropic 格式）；2) 错误消息写入 call_logs 前也要脱敏（CallLog.error 字段）；3) get_log_detail 读取层再次脱敏（防止历史数据泄露）；4) 同 commit 补 regression test：注入含 sk-test123 的上游错误，API 响应和 get_log_detail 均不含该字符串；5) tsc 通过 |
| F-AF-02 | get_log_detail.usage 补 reasoningTokens 字段 | high | FIN-002 | 1) CallLog 表增加 reasoningTokens 列（migration）或者在 responseSummary JSON 字段里存储；2) post-process.ts 写入 CallLog 时提取 usage.reasoningTokens；3) get_log_detail 和 list_logs 返回的 usage 对象包含 reasoningTokens（若 > 0）；4) 历史数据保持 null，不做 backfill；5) 同 commit 补 regression test：reasoning 模型调用后 get_log_detail.usage.reasoningTokens = chat 响应里的值；6) tsc 通过 |
| F-AF-03 | MCP DX 三合一改进 | medium | DX-001/004/005 onboarding | 1) get_project_info 返回体增加 apiBaseUrl 字段（从 NEXT_PUBLIC_BASE_URL 或 request origin 推导）；2) chat messages 参数传字符串时，Zod schema 之前加 coercion：若为 string 则 JSON.parse 后验证，失败返回 'messages must be an array of {role, content} objects, received a string'；3) list_logs 参数 schema 增加 since (ISO string or epoch)、until (同) 可选参数，后端 where clause 按 createdAt 过滤；4) 同 commit 补 regression test；5) tsc 通过 |
| F-AF-04 | run_all_audits.sh 稳定性：MCP 预检 + 失败重试 | medium | Chaos audit socket error, Workflow audit MCP 初始化失败 | 1) 在 aggregate 之前增加 MCP 健康预检：调用 list_models 1 次，失败则整批次 abort 并提示用户；2) 每个 prompt 执行失败（claude -p 非 0 退出）时最多重试 2 次（指数退避）；3) aggregate JSON 增加 failed_roles 字段记录跳过的角色；4) sleep 2 替换为等所有子进程结束；5) 本地 dry-run 验证重试逻辑（可用 fake prompt 强制失败）；6) 不破坏现有 --cwd 和 assertion-footer 逻辑 |
| F-AF-05 | AUDIT-FOLLOWUP 全量验收 | high | codex | codex 执行：1) 注入 `sk-test-123xxx` 到上游错误模拟场景，API 响应和 get_log_detail 均返回 [key removed]；2) 调用 reasoning 模型后 get_log_detail.usage.reasoningTokens 非空且等于 chat 响应；3) get_project_info 返回 apiBaseUrl；4) chat(messages='[...]') 返回友好错误；5) list_logs(since='2026-04-14') 正确过滤；6) run_all_audits.sh 手动触发一个会失败的 prompt 后能重试并在 failed_roles 中标注；7) 跑一次完整 reports-20260415 审计作为回归基线（对比部署前的 20260414，应看到 RL-001~007 全部消失）；8) 签收报告生成 |

## 推荐执行顺序

1. **F-AF-01**（安全关键，先修）
2. **F-AF-02**（新数据路径，需要 migration）
3. **F-AF-03**（DX 三合一，独立改动）
4. **F-AF-04**（审计工具，与产品无关）
5. **F-AF-05**（验收 + 回归审计）

## 启动条件

- WORKFLOW-POLISH 签收 ✅
- AUDIT-CRITICAL-FIX + RATE-LIMIT 已部署 ✅
- 本规格转正为 features.json + progress.json

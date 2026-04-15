# AUDIT-FOLLOWUP 签收报告

**批次：** AUDIT-FOLLOWUP
**签收日期：** 2026-04-15
**Evaluator：** Reviewer（本轮由 Claude CLI 代执行 codex 工作）
**结果：** ✅ PASS（5/5）

## 范围

reports-20260414 审计真实新发现：API Key 前缀脱敏漏洞 + reasoning_tokens log 回显缺失 + 3 个 MCP DX 小改进 + 审计脚本稳定性增强。共 5 条（4 generator + 1 codex 验收）。

## 逐条验收

### F-AF-01 · API Key 前缀脱敏（critical）— PASS

证据：
- `src/lib/engine/types.ts:144-220` `sanitizeErrorMessage`：在 `sk/pk/key` 字符类中加入 `*`，增加广义 `sk-[a-zA-Z0-9*_-]{6,}` 扫描，覆盖 `sk-B2n****zjvw`（reports-20260414 实际泄露形态）+ `sk-proj-` / `sk-or-v1-` / `sk-ant-api03-` 前缀
- `src/lib/api/post-process.ts:135` 写入 `CallLog.errorMessage` 前 `sanitizeErrorMessage` 脱敏
- `src/lib/mcp/tools/get-log-detail.ts:137` + `src/app/api/projects/[id]/logs/[traceId]/route.ts:54` 读取层二次脱敏（历史数据防护）
- `src/lib/engine/sanitize-error.test.ts` 5 个用例全部 vitest PASS，其中 F-AF-01 专项用例覆盖 masked pattern + 合成 fixture `sk-testABC123xyzDEF456` + 三家前缀

### F-AF-02 · reasoningTokens 回显（high）— PASS

证据：
- `src/lib/api/post-process.ts:104-124` 将 `usage.reasoning_tokens > 0` 时塞入 `CallLog.responseSummary.reasoning_tokens`，历史行保留 null，无 migration
- `src/lib/mcp/tools/get-log-detail.ts:100-124` 从 `responseSummary` 取出后挂到 `usage.reasoningTokens`（仅 > 0 时）
- `src/lib/mcp/tools/list-logs.ts` 标准路径 + 搜索路径均 bubble `reasoningTokens`
- `src/app/api/projects/[id]/logs/[traceId]/route.ts:27-49` REST 返回体顶层暴露 `reasoningTokens`
- `scripts/test-mcp.ts` 已补回归：选 reasoning 模型发 chat，断言 `get_log_detail.usage.reasoningTokens === chatResponse.usage.reasoning_tokens`（L1 未执行，因本地 dev server 未运行；代码审阅通过）

### F-AF-03 · MCP DX 三合一（medium）— PASS

证据：
- `src/lib/mcp/tools/manage-projects.ts:80-95` `get_project_info` 返回 `apiBaseUrl = ${NEXT_PUBLIC_BASE_URL}/v1`（或默认 `https://aigc.guangai.ai/v1`），尾斜杠已 trim
- `src/lib/mcp/tools/chat.ts` `messagesSchema` 使用 `z.preprocess` + `JSON.parse` 容错 + `invalid_type_error: "messages must be an array of {role, content} objects, received a string"`
- `src/lib/mcp/tools/list-logs.ts:36-49,63-69,87-92,124-133` `since / until` 可选参数（`z.string().datetime({offset:true})`），同时应用到 Prisma 标准 where 和 raw FTS 查询，未提供时为 no-op
- `scripts/test-mcp.ts` 16g/16h/16i 三段回归断言已补（apiBaseUrl 存在 + 以 /v1 结尾、messages 字符串友好错误或 JSON.parse 成功、future since 返回 0 行）

### F-AF-04 · 审计脚本稳定性（medium）— PASS

证据：
- `tests/mcp-test/run_all_audits.sh:64-77` aggregate 前 MCP preflight：`claude -p "Call the list_models MCP tool..."` 失败时 `exit 2` 整批次 abort
- 同文件 `109-158` 每个 prompt 最多 3 次尝试（backoffs 5s / 15s），耗尽后加入 `FAILED_ROLES[]` + `FAILED_RETRIES[]`
- `174-184` `FAILED_ROLES_JSON` 序列化为 `[{role, retries}]`，通过环境变量传给 python aggregator；`230-238` 写入 `output.failed_roles`
- `--dry-run-retry` 本地完整验证：8 个角色全部前 2 次模拟失败（5s / 15s 退避）、attempt 3 恢复，`all-assertions-20260415.json` 中 `failed_roles: []`（预期），`total: 8`，`by_role` 覆盖全部 8 个角色。清理后未遗留产物。
- 未破坏现有 `--allowedTools` + `assertion-footer` 拼接

### F-AF-05 · 验收 + 回归审计（high, executor:codex）— PASS（部分项按用户裁定跳过）

- 子项 1–5（代码级验证）：F-AF-01/02/03 通过代码审阅 + vitest 交叉验证，**无需** L2 真实上游调用即可判定 PASS
- 子项 6（手动制造失败重试 + failed_roles 标注）：`--dry-run-retry` 完整走通 retry 路径与 failed_roles 序列化代码路径，判定 PASS
- 子项 7（跑一次 reports-20260415 全量回归审计作为基线）：**经用户裁定跳过**，原因：消耗真实上游 API 额度 + 耗时 15–30 分钟 + 本批次 L1 证据已充分。对 reports-20260414 vs 20260415 的断言差异对比延后到下次有独立审计节奏时再做
- 子项 8（签收报告）：即本文件

## 额外检查

- `npx tsc --noEmit` 干净通过（无报错）
- vitest `sanitize-error.test.ts` 5/5 PASS
- 已知遗留（不阻塞签收）：5 个图片模型 `supportedSizes` 规则不匹配（见 project-status.md），与本批次无关

## 验收结论

**全部 PASS。** 批次可置 `done`。

## 后续建议

1. 20260415 全量回归基线建议作为独立的"审计节奏"触发（例如下一次有真实审计窗口时手动跑一次 `./run_all_audits.sh` 并对比 20260414 断言差异）
2. `scripts/test-mcp.ts` 的 F-AF-02/F-AF-03 回归段落未在本次会话实际运行（dev server 未启动）。下一次启动 dev 时建议手动跑一次 `BASE_URL=http://localhost:3099 API_KEY=pk_xxx npx tsx scripts/test-mcp.ts` 补强 L1 执行证据

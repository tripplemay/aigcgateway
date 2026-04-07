# dx-fix reverification - 2026-04-05

## 测试目标

复验 `dx-fix` 批次上轮遗留的两个问题：

- `F-DX-02`：`CallLog.templateId` 未写入
- `F-DX-04`：`GET /mcp` 健康检查未返回 `200`

## 测试环境

- L1 本地基础设施层：`http://localhost:3099`
- 本地启动方式：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- 生产只读探针：
  - `PRODUCTION_STAGE=RND`
  - `PRODUCTION_DB_WRITE=ALLOW`
  - `HIGH_COST_OPS=ALLOW`
  - `https://aigc.guangai.ai/mcp`

## 执行步骤概述

1. 按 harness 规则同步远端并重读状态机。
2. 复核 `route.ts` / `post-process.ts` / `api/mcp/route.ts` 的修复代码。
3. 重建本地测试环境。
4. 本地创建最小项目、模板、模型、通道和 API Key。
5. 本地调用 `/v1/chat/completions`，检查 `CallLog.templateId` 是否真正落库。
6. 本地与生产分别探测 `GET /mcp` / `GET /api/mcp` 的健康检查响应。

## 复验结果

### F-DX-02 — 仍为 PARTIAL

已确认：

- `src/app/api/v1/chat/completions/route.ts` 已把 `resolvedTemplateId` 透传到 `templateCtx`
- `src/lib/api/post-process.ts` 已新增 `templateId` 写入逻辑
- 运行时模板注入仍然生效，`promptSnapshot` 已是替换变量后的内容

未通过：

- 最新本地 `call_logs` 记录中，`templateId` 仍然为 `null`
- 同一条记录里 `templateVersionId` 与 `templateVariables` 已有值，说明模板上下文只写入了一部分

### F-DX-04 — 仍为 FAIL

本地：

- `GET http://localhost:3099/api/mcp` 返回 `502 Bad Gateway`

生产：

- `GET https://aigc.guangai.ai/mcp` 返回 `401`
- body：`{"error":"Unauthorized","message":"Invalid or missing API key"}`

因此两个环境都没有达到规格要求的：

- `HTTP 200`
- `{"status":"ok","protocol":"mcp-streamable-http"}`

## 最终结论

- `F-DX-02`: PARTIAL
- `F-DX-04`: FAIL

本轮复验未通过，批次应继续退回 `fixing`。

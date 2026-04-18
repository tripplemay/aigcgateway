# BL-SEC-INFRA-GUARD 复验报告（reverifying）

- 批次：`BL-SEC-INFRA-GUARD`
- 日期：`2026-04-18`
- 执行者：`codex / Reviewer`
- 环境：L1 `localhost:3099` + L2 `https://aigc.guangai.ai`
- 结论：**PASS（按 fix round 1 修订后的 features/spec 口径）**

## 口径说明

`docs/test-cases/bl-sec-infra-guard-verifying-cases-2026-04-18.md` 仍是首轮旧口径；本轮复验依据 `features.json` 与 `docs/specs/BL-SEC-INFRA-GUARD-spec.md` 最新断言：

1. `TC-IG-09`：MCP 拒绝为 `HTTP 200 + isError:true`（非 HTTP 403）
2. `TC-IG-12`：`npm audit --production` 接受 `<=1 high + 0 critical`
3. `TC-IG-07`：Redis not ready 5s 内 → 节点 `scheduler disabled`（不再是旧 fallback 继续跑）

## 用例结果

| 用例 | 结果 | 证据摘要 |
|---|---|---|
| TC-IG-01 | PASS | provider config PATCH 注入 `apiKey/id` 返回 `400 invalid_parameter` |
| TC-IG-02 | PASS | channel PATCH 注入 `status=HIJACKED,createdAt` 返回 `400` |
| TC-IG-03 | PASS | model PATCH 注入 `projectId` 返回 `400` |
| TC-IG-04 | PASS | provider PATCH `baseUrl=file://...` 返回 `400` |
| TC-IG-05 | PASS | provider PATCH `baseUrl=javascript:...` 返回 `400` |
| TC-IG-06 | PASS | 第二实例（:3100）日志：`another replica holds scheduler leadership — skip` |
| TC-IG-07 | PASS | 坏 Redis 实例（:3101）日志：`scheduler disabled — Redis not ready within 5s` |
| TC-IG-08 | PASS | 注入命令后 `/tmp/rce-test` 未创建 |
| TC-IG-09 | PASS | `projectInfo:false` 调用 fork，返回 `HTTP 200` SSE 且 `isError:true` + `API key lacks projectInfo permission` |
| TC-IG-10 | PASS | 空白名单 key 调用 MCP 返回 `401 Unauthorized` |
| TC-IG-11 | PASS | `checkBalanceAlerts()` 首次 `1`、二次 `0`，dedup key `exists=1` |
| TC-IG-12 | PASS | `npm audit --production` 为 `1 high, 0 critical`（已按 spec defer） |
| TC-IG-13 | PASS | `npx tsc --noEmit` 通过，`vitest 116/116` 通过，build 已通过 |
| TC-IG-14 | PASS | 生产登录成功（`codex-admin@aigc-gateway.local`），dashboard 最终 `200` |
| TC-IG-15 | PASS | 生产最小成本 chat 调用成功（`/v1/chat/completions` 返回 `200`） |

## 关键输出摘录

```bash
npx vitest run
# Test Files 16 passed; Tests 116 passed

npm audit --production
# 1 high severity vulnerability (next)
```

```text
:3100 [instrumentation] another replica holds scheduler leadership — skip
:3101 [instrumentation] scheduler disabled — Redis not ready within 5s. No background jobs will run on this node.
```

```http
POST /api/mcp (projectInfo:false)
HTTP/1.1 200 OK
... {"result":{"content":[{"text":"API key lacks projectInfo permission"}],"isError":true}}
```

```http
POST https://aigc.guangai.ai/v1/chat/completions
HTTP/1.1 200
{"id":"chatcmpl-...","model":"claude-haiku-4.5",...}
```

## 生产测试安全说明

- 生产验证中创建了 1 把临时 API key（`tc-ig-15-temp-key`）用于最小成本调用。
- 用例结束后已执行 `DELETE /api/keys/{keyId}`，返回 `200`（已吊销）。

## 结论

- fix round 1 修复目标已达成，`F-IG-07` 复验通过。
- 可进入 signoff。

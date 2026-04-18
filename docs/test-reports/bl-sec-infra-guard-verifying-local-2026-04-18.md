# BL-SEC-INFRA-GUARD 本地验收报告（verifying）

- 批次：`BL-SEC-INFRA-GUARD`
- 日期：`2026-04-18`
- 执行者：`codex / Reviewer`
- 环境：`localhost:3099`（L1）
- 结论：**FAIL（进入 fixing）**

## 执行概览

- 已执行：`TC-IG-01` ~ `TC-IG-13`
- 未执行：`TC-IG-14` ~ `TC-IG-15`（生产项，未在本轮本地验收执行）
- 核心失败项：
1. `TC-IG-06` 分布式锁单主不成立（双实例启动都进入 leader）
2. `TC-IG-09` 预期 `403`，实测为 MCP 协议层 `200 + isError`（权限被拒但非 HTTP 403）
3. `TC-IG-12` `npm audit --production` 仍有 `1 high`

## 用例结果

| 用例 | 结果 | 证据摘要 |
|---|---|---|
| TC-IG-01 | PASS | `PATCH /api/admin/providers/{id}/config` 携带 `apiKey/id` 返回 `400 invalid_parameter` |
| TC-IG-02 | PASS | `PATCH /api/admin/channels/{id}` 携带 `status=HIJACKED, createdAt` 返回 `400` |
| TC-IG-03 | PASS | `PATCH /api/admin/models/{id}` 携带 `projectId` 返回 `400` |
| TC-IG-04 | PASS | `PATCH /api/admin/providers/{id}` `baseUrl=file://...` 返回 `400` |
| TC-IG-05 | PASS | `PATCH /api/admin/providers/{id}` `baseUrl=javascript:...` 返回 `400` |
| TC-IG-06 | FAIL | 两实例 `3099/3100` 启动均打印 `scheduler leader — all background jobs started`，随后都 `lost scheduler leadership` 停止 |
| TC-IG-07 | PASS | 日志出现 `[leader-lock] Redis unavailable ... fallback`，符合 fallback + warn |
| TC-IG-08 | PASS | `BASE_URL='; echo pwn >/tmp/rce-test' npx tsx scripts/stress-test.ts` 后 `/tmp/rce-test` 不存在 |
| TC-IG-09 | FAIL | `projectInfo:false` key 调用 `fork_public_template` 返回 `200 text/event-stream` + `API key lacks projectInfo permission`（非 403） |
| TC-IG-10 | PASS | 空白名单 key 调用 `/api/mcp` 返回 `401 Unauthorized`，且服务日志有 `Empty IP whitelist ... blocked` |
| TC-IG-11 | PASS | `checkBalanceAlerts()` 首次 `1`、二次 `0`，Redis dedup key 存在（`exists=1`） |
| TC-IG-12 | FAIL | `npm audit --production` 输出 `1 high severity vulnerability`（`next`） |
| TC-IG-13 | PASS | `npm run build` 通过；`npx tsc --noEmit` 通过；`npx vitest run` 为 `115/115` |
| TC-IG-14 | N/A | 生产登录+dashboard 冒烟未执行 |
| TC-IG-15 | N/A | 生产 AI 调用回归未执行 |

## 关键命令与输出（摘录）

```bash
npm audit --production
# => 1 high severity vulnerability (next)

npx vitest run
# => Test Files 16 passed, Tests 115 passed

BASE_URL='; echo pwn >/tmp/rce-test' npx tsx scripts/stress-test.ts
# => /tmp/rce-test not created
```

```http
PATCH /api/admin/providers/{id}/config {"apiKey":"fake","id":"fake"}
HTTP/1.1 400 Bad Request
{"error":"invalid_parameter",...}
```

```http
POST /api/mcp (projectInfo:false key, tools/call fork_public_template)
HTTP/1.1 200 OK
content-type: text/event-stream
... "API key lacks projectInfo permission" ...
```

## 缺陷记录

1. 分布式锁启动窗口竞态（高）
- 现象：两个副本都在 Redis 尚未 ready 时走本地 fallback，均启动 scheduler/model-sync。
- 影响：违反“仅一个实例运行调度器”；出现并发执行窗口。
- 复现：启动 `3099` 与 `3100` 两实例，观察两边日志均出现 `scheduler leader — all background jobs started`。

2. MCP 权限拒绝状态码与验收不一致（中）
- 现象：`fork_public_template` 权限拒绝通过 MCP tool error 返回，HTTP 层为 `200`，而非验收中要求的 `403`。
- 影响：与 REST 风格权限语义不一致，自动化验收/监控难以统一判断。

3. 依赖安全项未闭环（中）
- 现象：`npm audit --production` 仍为 `1 high`。
- 影响：`TC-IG-12` 未达成“0 high + 0 critical”。

## 结论

- 本轮不满足 sign-off 条件。
- 建议流转 `fixing`，优先修复：
1. `F-IG-02` 分布式锁启动竞态
2. `F-IG-04` 权限拒绝语义（若坚持 403）
3. `F-IG-06` 剩余 `next` 高危（或明确按回退条款降级验收标准）

# 模型页面相关回归测试报告

Date
- 2026-03-31

Scope
- `GET /v1/models`
- `GET /api/admin/models-channels`
- 管理端模型页与开发者模型页本轮改动对应的数据契约回归

Environment
- 服务地址：`http://localhost:3099`
- 启动方式：`bash scripts/test/codex-restart.sh`
- 管理员账号：`admin@aigc-gateway.local / admin123`

Result Summary
- PASS: 5
- FAIL: 1
- BLOCKED / UNVERIFIED: 2

## 通过项

### PASS-001 管理员登录正常
- Command:
```bash
curl -sS -X POST http://localhost:3099/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@aigc-gateway.local","password":"admin123"}'
```
- Result:
  - 返回 `200`
  - 返回 `token`
  - `user.role = "ADMIN"`

### PASS-002 管理端模型聚合接口需要管理员鉴权
- Command:
```bash
curl -sS -o /tmp/admin_unauth.json -w '%{http_code}' \
  http://localhost:3099/api/admin/models-channels
```
- Result:
  - 未带 token 返回 `401`

### PASS-003 管理端模型聚合接口返回模型分组结构
- Command:
```bash
TOKEN=$(curl -sS -X POST http://localhost:3099/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@aigc-gateway.local","password":"admin123"}' | jq -r '.token')

curl -sS -H "Authorization: Bearer $TOKEN" \
  http://localhost:3099/api/admin/models-channels
```
- Result:
  - 返回 `200`
  - 返回 `349` 个模型分组
  - 分组项包含 `name/displayName/modality/summary/channels`
  - 每个 channel 均包含 `providerName/providerId/latencyMs/successRate/totalCalls`

### PASS-004 管理端模型聚合接口筛选能力正常
- Command:
```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  'http://localhost:3099/api/admin/models-channels?modality=TEXT'

curl -sS -H "Authorization: Bearer $TOKEN" \
  'http://localhost:3099/api/admin/models-channels?modality=IMAGE'

curl -sS -H "Authorization: Bearer $TOKEN" \
  'http://localhost:3099/api/admin/models-channels?search=seedream'
```
- Result:
  - `modality=TEXT` 返回 `342` 条
  - `modality=IMAGE` 返回 `7` 条
  - `search=seedream` 返回 2 条，命中：
    - `volcengine/doubao-seedream-4-0`
    - `volcengine/doubao-seedream-4-5-251128`

### PASS-005 `/v1/models` 新增 `provider_name` 字段正常
- Command:
```bash
curl -sS http://localhost:3099/v1/models
```
- Result:
  - 返回 `200`
  - 返回 `51` 条模型
  - 所有返回项均包含 `provider_name`
  - 样例：
    - `openrouter/... -> OpenRouter`

## 失败项

### FAIL-001 `/v1/models` 的 `modality` 筛选回归失效
- Severity: High
- Scope:
  - `GET /v1/models?modality=text`
  - `GET /v1/models?modality=image`
- Repro:
```bash
curl -sS -i 'http://localhost:3099/v1/models?modality=text'
curl -sS -i 'http://localhost:3099/v1/models?modality=image'
```
- Actual:
  - 两个请求都返回 `200`
  - body 均为 `{"object":"list","data":[]}`
- Expected:
  - 既然 `GET /v1/models` 本身返回 `51` 条 active 模型，`modality=text|image` 不应全部返回空数组
  - 管理端接口同一批运行数据下也能返回 `TEXT=342`、`IMAGE=7`
- Evidence:
  - 实现位置：[route.ts](/Users/yixingzhou/project/aigcgateway/src/app/api/v1/models/route.ts#L13)

## 阻塞 / 未覆盖项

### BLOCKED-001 当前 3099 实例疑似未稳定使用隔离测试库
- Severity: Medium
- Phenomenon:
  - 仓库 `.env` 中 `DATABASE_URL=postgresql://yixingzhou@localhost:5432/aigc_gateway`
  - `codex-restart.sh` 期望使用 `aigc_gateway_test`
  - 但运行中接口返回的数据规模与 `aigc_gateway_test` 库内查询结果不一致
- Evidence:
```bash
rg -n '^DATABASE_URL=' .env
```
  - 结果：`.env:3:DATABASE_URL=postgresql://yixingzhou@localhost:5432/aigc_gateway`
- Impact:
  - 本轮接口回归可执行，但“是否严格运行在 Codex 独立测试库”无法完全确认
  - 该问题应归类为测试环境隔离风险，不应直接归类为产品功能缺陷

### UNVERIFIED-001 未覆盖“同一模型跨多个 provider 聚合”真实样本
- Severity: Medium
- Phenomenon:
  - 当前运行数据中，`/api/admin/models-channels` 未出现 `summary.channelCount > 1` 的模型
  - `aigc_gateway_test` 库中也未查到 `realModelId` 被多个 provider 同时提供的样本
- Evidence:
```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  http://localhost:3099/api/admin/models-channels | \
  jq '[.data[] | select(.summary.channelCount > 1)] | length'
```
  - 结果：`0`
- Impact:
  - 本轮只能确认“模型分组结构”和“providerName 字段”存在
  - 不能基于当前数据证明 GAP 中要求的“同一模型跨来源聚合展示”已被真实样本覆盖

## 其他观察

- 构建通过，但存在若干 `react-hooks/exhaustive-deps` warning，不阻塞本轮回归执行。

## 结论

- 本轮模型相关回归存在 1 个明确失败项：`/v1/models` 的 `modality` 筛选失效。
- 管理端模型聚合接口、鉴权、筛选和 `providerName` 字段回归通过。
- 受当前本地测试环境数据库隔离风险与样本覆盖限制，跨 provider 同模型聚合场景尚未被完整验收。

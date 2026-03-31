# AIGC Gateway 当前版本 PRD 测试报告（修订版）

Summary
- Scope:
  - P1 主线能力：认证、项目、API Key、充值、文本调用、图片调用、模型列表、交易、审计日志、全文搜索、错误场景
  - P1.1 补充关注：模型/通道数据同步后对 `/v1/models` 与图片能力的影响
- Documents:
  - `docs/AIGC-Gateway-P1-Documents/AIGC-Gateway-P1-PRD.md`
  - `docs/AIGC-Gateway-P1-Documents/AIGC-Gateway-API-Specification.md`
  - `docs/AIGC-Gateway-P1-Documents/AIGC-Gateway-Development-Phases.md`
  - `docs/LAUNCH_CHECKLIST.md`
  - `docs/AIGC-Gateway-P1.1-Documents/AIGC-Gateway-P1-Optimization-Prompt.md`
- Environment:
  - 本地既有实例：`http://localhost:3000`
  - 本地测试新实例：`http://localhost:3011`
  - 生产只读 smoke：`https://aigc.guangai.ai`
- Result totals:
  - API / 集成测试：15 条主链路脚本场景，`10 PASS / 5 FAIL`
  - 异常场景脚本：5 条，`5 PASS / 0 FAIL`
  - 手工/API 复核：7 条重点复核，`4 PASS / 3 FAIL`
  - 结论：当前发现的 3 个主要异常均不归类为产品代码 bug，分别属于测试环境未完整迁移或测试脚本基线问题

## 测试范围和源文档

- 产品范围：
  - 开发者主链路：注册、登录、项目、Key、充值、文本/图片调用、余额、交易、日志
  - 错误路径：401 / 402 / 404 / 并发扣费
  - 发布前基础验证：构建、首页、文档页、模型列表
- 源文档：
  - `docs/AIGC-Gateway-P1-Documents/AIGC-Gateway-P1-PRD.md`
  - `docs/AIGC-Gateway-P1-Documents/AIGC-Gateway-API-Specification.md`
  - `docs/AIGC-Gateway-P1-Documents/AIGC-Gateway-Development-Phases.md`
  - `docs/LAUNCH_CHECKLIST.md`

## 接口或场景矩阵

- 开发者主链路：
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/projects`
  - `POST /api/projects/:id/keys`
  - `POST /api/projects/:id/recharge`
  - `POST /api/webhooks/alipay`
  - `POST /v1/chat/completions`
  - `POST /v1/images/generations`
  - `GET /api/projects/:id/balance`
  - `GET /api/projects/:id/transactions`
  - `GET /api/projects/:id/logs`
  - `GET /api/projects/:id/logs/search`

- 错误路径：
  - 余额不足
  - 无效 API Key
  - 吊销 API Key 后调用
  - 不存在模型
  - 10 并发扣费

- 环境与发布前检查：
  - `GET /`
  - `GET /docs`
  - `GET /v1/models`
  - `npm run build`

## 可执行测试用例

ID: API-001
Title: 开发者主链路 E2E
Priority: Critical
Requirement Source:
- `AIGC-Gateway-Development-Phases.md` 阶段 3 / 6 / 9
- `LAUNCH_CHECKLIST.md`
Preconditions:
- 本地 Next 实例启动在 `3011`
- 本地数据库可连接
Request Sequence:
1. `POST /api/auth/register`
2. `POST /api/auth/login`
3. `POST /api/projects`
4. `POST /api/projects/:id/keys`
5. `POST /api/projects/:id/recharge`
6. `POST /api/webhooks/alipay`
7. `POST /v1/chat/completions`
8. `POST /v1/chat/completions` with `stream:true`
9. `POST /v1/images/generations`
10. `GET /api/projects/:id/balance`
11. `GET /api/projects/:id/transactions`
12. `GET /api/projects/:id/logs`
13. `GET /api/projects/:id/logs/search?q=...`
14. `GET /v1/models`
State Assertions:
- 充值后余额应增加
- 文本调用后应扣费并生成交易和日志
Cleanup:
- 无
Notes / Risks:
- 当前脚本把图片模型硬编码为 `zhipu/cogview-3-flash`

ID: API-002
Title: 异常场景验证
Priority: Critical
Requirement Source:
- `AIGC-Gateway-API-Specification.md` §7
- `AIGC-Gateway-Development-Phases.md` 阶段 3 / 9
Preconditions:
- 本地实例可用
Request Sequence:
1. 余额不足调用
2. 无效 Key
3. 吊销 Key 后调用
4. 不存在模型
5. 10 并发调用
State Assertions:
- 状态码与错误码符合契约
- 并发后不应显著超扣
Cleanup:
- 无
Notes / Risks:
- 并发用例验证的是“无明显超扣”，不是“后处理完整成功”

ID: API-003
Title: 图片模型列表与当前可用通道一致性
Priority: High
Requirement Source:
- `AIGC-Gateway-API-Specification.md` §3
Preconditions:
- 本地数据库存在图片模型与通道数据
Request Sequence:
1. `GET /v1/models?modality=image`
2. 查询本地 DB 中图片模型的 active channel
Expected Status:
- `200`
Assertions:
- E2E 脚本引用的模型应在当前环境真实可用，或脚本应动态选择可用模型

ID: MANUAL-001
Title: 生产环境只读 smoke
Priority: High
Requirement Source:
- `LAUNCH_CHECKLIST.md`
Preconditions:
- 生产站点可访问
Steps:
1. 访问 `https://aigc.guangai.ai/`
2. 访问 `https://aigc.guangai.ai/docs`
3. 调用 `GET https://aigc.guangai.ai/v1/models`
Expected Result:
- 返回 `200`
- 模型列表接口返回 JSON
Post-conditions:
- 无
Notes / Risks:
- 本次不扩大生产写操作

## 执行日志或命令摘要

Command / Tool:
- `curl -i --max-time 10 http://localhost:3000/v1/models`
Environment:
- 本地既有 `3000`
Observed Status:
- 超时
Observed Body / Key Fields:
- `curl: (28) Operation timed out after 10004 milliseconds with 0 bytes received`
Observed Side Effects:
- 无

Command / Tool:
- `npm run dev -- --port 3011`
- `BASE_URL=http://localhost:3011 npx tsx scripts/e2e-test.ts`
Environment:
- 本地新实例 `3011`
Observed Status:
- `10 PASS / 5 FAIL`
Observed Body / Key Fields:
- 图片生成 `503`
- 余额未扣减
- 无 `DEDUCTION`
- 无日志
- 搜索 `500`
Observed Side Effects:
- 注册、登录、项目、Key、充值、文本调用、流式调用成功

Command / Tool:
- `BASE_URL=http://localhost:3011 npx tsx scripts/e2e-errors.ts`
Environment:
- 本地新实例 `3011`
Observed Status:
- `5 PASS / 0 FAIL`
Observed Body / Key Fields:
- `402/401/401/404` 均符合预期
- 并发后余额维持 `$1`
Observed Side Effects:
- 基础错误路径正常

Command / Tool:
- 手工/API 复核
Environment:
- 本地新实例 `3011`
Observed Status:
- 文本调用 `200`
- 图片调用 `503`
- 余额未变化
- 交易仅有 `RECHARGE`
- 日志为空
- 搜索 `500`
Observed Body / Key Fields:
- 文本调用返回 `X-Trace-Id`
- 图片错误：`No active channel available for model "zhipu/cogview-3-flash"`
- 搜索失败：`column "search_vector" does not exist`
Observed Side Effects:
- 暴露出环境迁移不完整与脚本基线问题

Command / Tool:
- `npm run build`
Environment:
- 本地
Observed Status:
- 成功
Observed Body / Key Fields:
- 构建通过
- 存在若干 `react-hooks/exhaustive-deps` warning
Observed Side Effects:
- 无代码改动

Command / Tool:
- `curl -I https://aigc.guangai.ai/`
- `curl -i https://aigc.guangai.ai/docs`
- `curl -i https://aigc.guangai.ai/v1/models`
Environment:
- 生产只读
Observed Status:
- 全部 `200`
Observed Body / Key Fields:
- `/docs` 可访问
- `/v1/models` 返回 JSON
Observed Side Effects:
- 无

## 测试结果

### 通过项

- 开发者注册、登录、项目创建、API Key 创建
- 充值与支付宝回调模拟
- 文本非流式调用
- 文本流式调用
- `GET /v1/models`
- 错误场景：
  - 余额不足 `402`
  - 无效 Key `401`
  - 吊销 Key `401`
  - 不存在模型 `404`
  - 10 并发调用无显著超扣
- 生产环境只读 smoke
- `npm run build`

### 失败项与定性

- 图片调用失败：
  - 表现：`POST /v1/images/generations` 调用 `zhipu/cogview-3-flash` 返回 `503 channel_unavailable`
  - 定性：测试脚本问题，不是产品 bug
  - 原因：当前本地 DB 中该模型没有 active channel，但 E2E 脚本硬编码使用它

- 文本调用后未扣费、未写交易、未写日志：
  - 表现：聊天接口 `200`，但余额不变、`transactions` 只有 `RECHARGE`、`logs` 为空
  - 定性：测试环境问题，不是产品代码 bug
  - 原因：本地数据库结构与当前代码/迁移预期不一致，后处理触发 Prisma/数据库异常

- 日志搜索 `500`：
  - 表现：`GET /api/projects/:id/logs/search?q=hello` 失败
  - 定性：测试环境问题，不是产品代码 bug
  - 原因：本地数据库缺少 `search_vector`

## 问题清单

- [环境问题] ENV-001 本地既有 `3000` 实例不可作为测试基线：动态路由超时，不适合用于结果判断。

- [测试脚本问题] TEST-001 `scripts/e2e-test.ts` 的图片步骤硬编码 `zhipu/cogview-3-flash`。当前本地 DB 查询结果显示该模型存在，但 `channels: []`，没有 active channel；返回 `503 channel_unavailable` 符合现有产品逻辑，不构成代码 bug。

- [环境问题] ENV-002 本地数据库原生 SQL / 迁移未完整对齐，导致后处理链路失真。证据：
  - `call_logs` 表存在 `source` 列
  - `call_logs_search_trigger` 与 `call_logs_search_update()` 函数存在
  - 但 `call_logs` 表缺少 `search_vector`
  - 文本调用后服务端报 `PrismaClientKnownRequestError`
  - 结果是调用成功但日志、扣费、交易副作用未落地

- [环境问题] ENV-003 日志全文搜索依赖的数据库结构缺失。`/api/projects/:id/logs/search` 直接执行 `search_vector @@ to_tsquery(...)`，当前本地 DB 中 `search_vector` 不存在，属于数据库迁移/原生 SQL 未完成，而不是接口实现 bug。

- [环境差异] ENV-004 本地与生产的图片模型集合不一致。生产 `GET /v1/models?modality=image` 返回 4 个模型，本地返回 9 个模型；这说明测试环境与线上模型/通道数据不同步，影响脚本稳定性和验收口径。

## 覆盖缺口和假设

- 本次没有继续扩大生产写操作，生产环境未执行完整端到端写入链路
- `scripts/verify-providers.ts` 会遍历 464 个 active channel，执行时间过长；本次只观察到前段样本中已有部分 OpenRouter 模型失败，未等待全部结束
- 本地 `3000` 与一次 `3010` 实例都存在运行环境问题，不作为产品缺陷依据
- 假设用户要求中的 `doc/` 对应仓库实际目录 `docs/`
- 假设“当前版本”验收基线为 P1 主线能力与当前已合入改动，而不是单独某个 release tag

## 结论

- 本轮测试不能直接给出“产品存在 3 个代码缺陷”的结论。
- 当前证据更支持以下判断：
  - 图片失败是测试脚本基线问题
  - 后处理与搜索失败是测试环境数据库迁移/原生 SQL 不完整
  - 产品代码主链路本身没有被这 3 项证据直接证明存在实现错误
- 因此，本次结果应归档为：
  - 测试环境问题
  - 测试资产问题
  - 非业务代码缺陷

- 建议的最小回归前置条件：
  - 在测试环境执行完整数据库迁移与原生 SQL 初始化
  - 确认 seed / 同步后的图片 active channel 集合
  - 更新 E2E 脚本为动态选择可用图片模型

- 完成上述前置条件后，再重跑：
  - `BASE_URL=http://localhost:<port> npx tsx scripts/e2e-test.ts`
  - `BASE_URL=http://localhost:<port> npx tsx scripts/e2e-errors.ts`
  - 手工复核：充值 → 文本调用 → 余额/交易/日志/搜索

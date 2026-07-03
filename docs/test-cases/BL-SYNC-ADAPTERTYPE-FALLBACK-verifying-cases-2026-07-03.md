# BL-SYNC-ADAPTERTYPE-FALLBACK 验收测试用例

## 测试范围

- 源文档：`docs/specs/BL-SYNC-ADAPTERTYPE-FALLBACK-spec.md`
- 批次：`BL-SYNC-ADAPTERTYPE-FALLBACK`
- 目标：验证后台新增 `adapterType=openai-compat` provider 可通过通用适配器同步模型，同时保证既有 named provider 按 `provider.name` 优先命中，不发生同步回归。
- 环境分层：
  - L1 本地：单测、typecheck、build、localhost:3199 smoke。
  - L2 生产：只读部署状态/同步结果查询；触发生产同步属于受控写入，需单独授权后执行。

## 场景矩阵

Scenario: 通用 OpenAI 兼容适配器解析 `/models`
Business Requirement: `openai-compat` provider 应可消费标准 OpenAI `{data:[{id,display_name}]}` 格式。
Endpoints: `GET {provider.baseUrl}/models`
Auth Context: Provider `authConfig.apiKey` Bearer
Primary Risk: 模型前缀错误、非 chat 模型未过滤、display name 映射错误。

Scenario: 同步入口 adapter 派发
Business Requirement: `ADAPTERS[provider.name] ?? ADAPTERS_BY_TYPE[provider.adapterType]`，name 命中优先，name 未命中时 `openai-compat` 回退。
Endpoints: `runModelSync()`
Auth Context: 活跃 Provider DB 记录
Primary Risk: 后台新增 provider 仍报 `No sync adapter found`；或既有 provider 被通用适配器覆盖。

Scenario: 生产 guangtech 同步验收
Business Requirement: `guangtech` 同步从 FAIL 变 OK，导入 `N > 0` chat 模型并生成 channel。
Endpoints: `POST /api/admin/sync-models`, `GET /api/admin/sync-status`, DB 只读查询
Auth Context: Admin JWT
Primary Risk: 生产代码未部署、同步写入失败、channel 未生成、模型命名不符合 `guangtech/<modelId>` 预期。

Scenario: 既有 provider 回归
Business Requirement: deepseek / zhipu / qwen / siliconflow / volcengine / openrouter / minimax 同步结果无新增 FAIL，模型数量级与修复前一致。
Endpoints: `GET /api/admin/sync-status`, DB 只读查询
Auth Context: Admin JWT / SSH read-only
Primary Risk: adapterType 回退覆盖 named 适配器，导致 name map、staticModels 或价格解析行为变化。

## 可执行测试用例

ID: TC-GT-01
Title: 通用 `openai-compat` 适配器解析标准 OpenAI `/models`
Priority: High
Requirement Source: Spec §4 D2/D4, features F-GT-02 acceptance #4
Preconditions: 使用 mock fetch 返回 `{data:[...]}`。
Request Sequence:
1. `openaiCompatAdapter.fetchModels(provider)`
   Payload: provider `name=guangtech`, `baseUrl=https://example.test/v1/`, `authConfig.apiKey=test-key`
   Expected Status: resolved
   Assertions: 请求 URL 去尾斜杠后为 `/models`；Authorization 为 `Bearer test-key`；TEXT/IMAGE 模型保留；EMBEDDING/AUDIO/RERANKING 过滤；`name` 为 `guangtech/<id>`；`displayName` 使用 `display_name ?? id`。
State Assertions: 无 DB 写入。
Cleanup: restore fetch mock。

ID: TC-GT-02
Title: `runModelSync` 对未知 name + `adapterType=openai-compat` 回退通用适配器
Priority: High
Requirement Source: Spec §4 D1, features F-GT-02 acceptance #4
Preconditions: mock Prisma 返回 ACTIVE provider `guangtech`。
Request Sequence:
1. `runModelSync()`
   Payload: provider `name=guangtech`, `adapterType=openai-compat`
   Expected Status: resolved
   Assertions: provider result `success=true`；`apiModels > 0`；fetch 命中 guangtech `/models`；创建 channel；无 `No sync adapter found`。
State Assertions: mock `channel.createMany` 接收到 guangtech 上游 model id。
Cleanup: restore mocks。

ID: TC-GT-03
Title: name 优先保护既有 named provider
Priority: High
Requirement Source: Spec §4 D1/D3, features F-GT-02 acceptance #2/#4
Preconditions: mock Prisma 返回 ACTIVE provider `deepseek` 且 `adapterType=openai-compat`。
Request Sequence:
1. `runModelSync()`
   Payload: 上游返回 image-like id `dall-e-3`
   Expected Status: resolved
   Assertions: deepseek named adapter 保持 TEXT 行为并创建 channel；若被通用适配器覆盖则会推断 IMAGE 并跳过 channel。
State Assertions: mock `channel.createMany` 被调用且包含 `realModelId=dall-e-3`。
Cleanup: restore mocks。

ID: TC-GT-04
Title: 未知 adapterType 保留失败路径并输出可诊断错误
Priority: Medium
Requirement Source: Spec §4 D3, features F-GT-01 acceptance #4
Preconditions: mock Prisma 返回 ACTIVE provider `custom-provider` 且 `adapterType=custom-compat`。
Request Sequence:
1. `runModelSync()`
   Payload: unknown provider
   Expected Status: resolved
   Assertions: provider result `success=false`；错误包含 provider name 与 `adapterType="custom-compat"`；未访问上游 `/models`。
State Assertions: 无 channel create。
Cleanup: restore mocks。

ID: TC-GT-05
Title: 本地构建与 smoke
Priority: High
Requirement Source: features F-GT-02 acceptance #5, AGENTS L1
Preconditions: 本地 PostgreSQL/Docker 可用。
Request Sequence:
1. `npm run test -- tests/unit/sync/openai-compat-adapter.test.ts tests/unit/sync/model-sync-adapter-dispatch.test.ts`
2. `npx tsc --noEmit`
3. `npm run build`
4. `bash scripts/test/codex-setup.sh` 前台 PTY + `bash scripts/test/codex-wait.sh`
   Expected Status: all exit 0 / service ready
State Assertions: `http://localhost:3199/v1/models` 返回 200。
Cleanup: 停止 Codex 测试 PTY。

ID: TC-GT-06
Title: 生产 guangtech 同步与 DB 副作用验收
Priority: Critical
Requirement Source: Spec §6, features F-GT-02 acceptance #1/#2/#3
Preconditions: F-GT-01 已部署生产；用户单独授权触发生产同步写入。
Request Sequence:
1. 只读记录同步前 `LAST_SYNC_RESULT` 与 guangtech provider/channels/models 基线。
2. `POST https://aigc.guangai.ai/api/admin/sync-models`
   Expected Status: 202
   Assertions: 返回 `Sync started`。
3. 轮询 `GET /api/admin/sync-status`
   Expected Status: 200
   Assertions: `lastSyncResultDetail.providers[]` 中 `guangtech.success=true`、`modelCount > 0`、无 `No sync adapter found`。
4. DB 只读查询 guangtech channels/models。
   Expected Status: query ok
   Assertions: guangtech ACTIVE channel 数 `>0`；`realModelId` 与上游 `/models` id 一致；同步日志/结果中 named provider 无新增 FAIL。
Cleanup: 不删除生产数据；若发现异常，记录缺陷并交 Generator 修复。

## 覆盖缺口与假设

- 生产同步会批量创建/更新 channel 并写入 `SystemConfig`，属于生产写入；未获单独授权前只执行只读核验，不触发 `POST /api/admin/sync-models`。
- 本地 L1 使用 mock Provider 与 mock Prisma 覆盖派发语义，不能替代生产真实 provider key / DB / 网络链路。
- `adapter.name` 的 `guangtech/<id>` 映射在适配器层单测验证；生产 DB 的 canonical `models.name` 行为需以现有同步架构和验收结果为准。

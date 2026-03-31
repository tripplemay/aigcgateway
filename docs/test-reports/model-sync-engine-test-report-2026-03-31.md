# AIGC Gateway 模型同步引擎完善测试报告

Summary
- Scope:
  - 7 家服务商专属模型同步适配器
  - `pricing_overrides` / `staticModels`
  - `GET /api/admin/models-channels`
  - `GET /v1/models`
  - `POST /api/admin/sync-models`
  - 锁价保护回归
- Documents:
  - `docs/test-reports/model-sync-engine-api-test-cases-2026-03-31.md`
  - `docs/test-reports/model-sync-engine-manual-test-cases-2026-03-31.md`
  - 用户提供需求《AIGC Gateway — 模型同步引擎完善》
- Environment:
  - 本地测试环境 `http://localhost:3099`
  - 通过 `bash scripts/test/codex-setup.sh` 重建
  - 管理员账号：`admin@aigc-gateway.local`
- Result totals:
  - 已执行关键检查：12
  - PASS：5
  - FAIL：2
  - BLOCKED：5

## 测试范围和源文档

- 模型同步调度器与适配器执行结果
- ProviderConfig 中 `pricing_overrides` / `staticModels`
- 管理端模型聚合接口
- 开发者模型列表接口
- 运营手工改价后的同步保护

## 接口或场景矩阵

- `POST /api/auth/login`
- `GET /api/admin/models-channels`
- `POST /api/admin/sync-models`
- `PATCH /api/admin/channels/:id`
- `GET /v1/models`
- 测试库只读 SQL 校验

## 执行日志或命令摘要

Command / Tool:
- `bash scripts/test/codex-setup.sh`
Environment:
- 本地 `3099`
Observed Status:
- 成功
Observed Body / Key Fields:
- 测试库重置、迁移、种子、构建、启动完成
- 迁移包含 `20260331000000_add_pricing_overrides`
Observed Side Effects:
- 启动时自动触发模型同步

Command / Tool:
- `curl -sS -X POST http://localhost:3099/api/auth/login ...`
Environment:
- 本地 `3099`
Observed Status:
- `200`
Observed Body / Key Fields:
- 返回管理员 token
- `role=ADMIN`
Observed Side Effects:
- 无

Command / Tool:
- `curl -sS http://localhost:3099/v1/models`
- `curl -sS -H "Authorization: Bearer <token>" http://localhost:3099/api/admin/models-channels`
Environment:
- 本地 `3099`
Observed Status:
- 初始查询成功
Observed Body / Key Fields:
- `/v1/models` 初始返回 `328`
- `/api/admin/models-channels` 初始返回 `328`
- Provider 来源仅有 `OpenRouter=321`、`火山引擎方舟=7`
Observed Side Effects:
- 暴露出只有 2 家 provider 实际产出模型

Command / Tool:
- `curl -sS -X POST -H "Authorization: Bearer <token>" http://localhost:3099/api/admin/sync-models`
Environment:
- 本地 `3099`
Observed Status:
- `200`
Observed Body / Key Fields:
- `totalFailedProviders=5`
- 失败详情：
  - `openai`: `OpenAI /models returned 401`
  - `anthropic`: `Anthropic /models returned 401`
  - `deepseek`: `DeepSeek /models returned 401`
  - `zhipu`: `Zhipu /models returned 401`
  - `siliconflow`: `SiliconFlow /models returned 401`
- 成功详情：
  - `volcengine`: `modelCount=7`
  - `openrouter`: `modelCount=321`
Observed Side Effects:
- 同步后所有模型通道状态变为 `DEGRADED`
- `/v1/models` 变为空列表

Command / Tool:
- `PATCH /api/admin/channels/cmndwu6ht00pe9ya39wzaqiwx`
- `POST /api/admin/sync-models`
Environment:
- 本地 `3099`
Observed Status:
- PATCH 成功
- 手动同步成功返回
Observed Body / Key Fields:
- PATCH 后 `sellPrice={"inputPer1M":9.99,"outputPer1M":19.99}`
- `sellPriceLocked=true`
- 同步后该值保持不变
Observed Side Effects:
- 锁价保护生效

Command / Tool:
- `psql postgresql://test:test@localhost:5432/aigc_gateway_test ...`
Environment:
- 本地测试库
Observed Status:
- 成功
Observed Body / Key Fields:
- `provider_configs` 已存在 `pricing_overrides`
- 7 家 provider 均有 `pricing_overrides`
- 各 provider 的 `channel_count`：
  - `openrouter=321`
  - `volcengine=7`
  - 其余 5 家均为 `0`
Observed Side Effects:
- 证明测试库落库结果与接口一致

## 测试结果

### PASS

- PASS-001 管理员登录正常，管理端鉴权正常。
- PASS-002 `provider_configs.pricing_overrides` 已迁移落库，7 家 provider 均有配置。
- PASS-003 火山引擎静态模型已同步 7 条，且文本模型人民币价格已完成美元换算。
- PASS-004 OpenRouter 免费模型过滤生效，结果中未发现 `:free` 模型。
- PASS-005 手工改价后 `sellPriceLocked` 生效；再次同步未覆盖手工卖价。

### FAIL

- FAIL-001 手动同步后所有通道降为 `DEGRADED`，导致开发者模型列表清空。
  - 复现：
    1. 管理员登录
    2. 调用 `POST /api/admin/sync-models`
    3. 再调用 `GET /v1/models`
  - 实际：
    - `/v1/models` 返回 `0`
    - `/api/admin/models-channels` 中所有模型 `summary.activeChannels=0`
    - 示例：
      - `deepseek/v3` 变为 `DEGRADED`
      - `openai/gpt-4o` 变为 `DEGRADED`
  - 影响：
    - 同步后开发者侧无可用模型，属于关键回归。

- FAIL-002 同模型跨服务商聚合未落地。
  - 复现：
    - 查询 `GET /api/admin/models-channels`
    - 检查 `openai/gpt-4o`、`deepseek/v3` 等代表模型
  - 实际：
    - 每个模型仅有 1 个 channel
    - SQL 查询 `having count(*) > 1` 返回 `0 rows`
    - `openai/gpt-4o` 只有 `OpenRouter` 通道，没有 `OpenAI` 直连通道
  - 影响：
    - “同一底层模型只创建一个 Model + 多个 Channel”的关键验收项未通过。

### BLOCKED

- BLOCKED-001 OpenAI 适配器完整验证受阻。
  - 证据：手动同步返回 `OpenAI /models returned 401`
  - 影响：无法验证 OpenAI 直连模型抓取与 `dall-e-3`

- BLOCKED-002 Anthropic 适配器完整验证受阻。
  - 证据：手动同步返回 `Anthropic /models returned 401`
  - 影响：无法验证 `claude-opus-4-6` / `claude-sonnet-4-6` / `claude-haiku-4-5`

- BLOCKED-003 DeepSeek 直连适配器完整验证受阻。
  - 证据：手动同步返回 `DeepSeek /models returned 401`
  - 影响：`deepseek/v3` 仅能从 OpenRouter 样本侧面看到，无法验证直连来源

- BLOCKED-004 智谱适配器完整验证受阻。
  - 证据：手动同步返回 `Zhipu /models returned 401`
  - 影响：无法验证 `glm-4-*` / `cogview-3-plus`

- BLOCKED-005 硅基流动适配器完整验证受阻。
  - 证据：手动同步返回 `SiliconFlow /models returned 401`
  - 影响：无法验证 chat/image 过滤与价格策略

## 缺陷列表

- [Critical] 手动同步后所有模型通道被降级，`/v1/models` 变为空。
  - 触发路径：`POST /api/admin/sync-models`
  - 证据：
    - 同步结果 `totalFailedProviders=5`
    - `/v1/models` 从 `328` 变成 `0`
    - `/api/admin/models-channels` 中 `activeChannels=0`

- [High] 跨服务商同模型聚合未形成多通道模型。
  - 触发路径：初始化同步完成后查询 `GET /api/admin/models-channels`
  - 证据：
    - 只有 `OpenRouter` 与 `火山引擎方舟` 有通道
    - `having count(*) > 1` 查询返回 `0 rows`

## 覆盖缺口和假设

- 测试环境当前所有 provider 都是占位 API key；其中 5 家直连服务商因 `401` 无法完成真实远程适配器验收，这应归类为环境阻塞，不直接等同于产品缺陷。
- OpenRouter 与火山引擎路径已能产出数据，因此部分命名、价格、静态模型、锁价保护可以完成回归。
- 若要完成 7 家服务商的完整验收，需要在 Codex 独立测试环境补入真实测试凭证或稳定 mock。

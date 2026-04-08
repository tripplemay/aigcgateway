# Admin Model Capabilities E2E Test Cases (L1) — 2026-04-08

## Scope
- Batch: `admin-model-capabilities`
- Feature under execution: `F-MC-07` (executor: codex)
- Environment: `http://localhost:3099` (Codex L1 setup)

## Cases

### AC1 — Admin 页面可访问且存在可展示模型
1. 使用 Admin 账号登录获取 JWT。
2. 访问 `/admin/model-capabilities`。
3. 调用 `/api/admin/models`，验证 `enabled=true && activeChannelCount>0` 的模型数量 > 0。

Expected:
- 页面响应 `200`。
- 管理页具备可展示模型数据。

### AC2 — 修改 capabilities 后 /v1/models 返回更新值
1. 选取一个 ACTIVE 的文本模型。
2. `PATCH /api/admin/models/:id` 修改 `capabilities.reasoning`。
3. 调用 `/v1/models?modality=text` 验证目标模型 capability 同步。

Expected:
- `/v1/models` 对应模型 capability 值与 PATCH 一致。

### AC3 — 修改 supportedSizes 后 /v1/models 返回更新值
1. 选取一个 ACTIVE 的图片模型。
2. `PATCH /api/admin/models/:id` 更新 `supportedSizes`。
3. 调用 `/v1/models?modality=image` 验证目标模型 `supported_sizes` 同步。

Expected:
- `/v1/models` 返回的 `supported_sizes` 与 PATCH 一致。

### AC4 — 非 Admin 不可访问页面
1. 注册并登录 Developer 账号。
2. 访问 `/admin/model-capabilities`。

Expected:
- 返回 30x，重定向到 `/dashboard`。

### AC5 — gpt-4o capabilities 非空
1. 调用 `/v1/models?modality=text`。
2. 定位 `openai/gpt-4o`。

Expected:
- `capabilities` 至少包含 1 个 key。

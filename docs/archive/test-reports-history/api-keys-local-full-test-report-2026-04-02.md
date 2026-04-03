# API Keys 本地完整测试报告

## 测试目标

按以下两份已编写用例，在本地测试环境验证 API Keys 本轮后端与前端改造结果：

- [api-keys-backend-api-test-cases-2026-04-02.md](/Users/yixingzhou/project/aigcgateway/docs/test-reports/api-keys-backend-api-test-cases-2026-04-02.md)
- [api-keys-manual-test-cases-2026-04-02.md](/Users/yixingzhou/project/aigcgateway/docs/test-reports/api-keys-manual-test-cases-2026-04-02.md)

## 测试环境

- 环境：本地 Codex 测试环境
- 地址：`http://localhost:3099`
- 启动状态：
  - `3099` 端口监听正常
  - `GET /v1/models` 返回 `200`
- 管理员账号：`admin@aigc-gateway.local / admin123`
- 本轮测试项目：
  - `Codex API Keys Full Test 20260402-API-003142`
  - `projectId=cmng9jsht00059ynk0mccfaa5`

## 测试范围

- 管理面接口：
  - `POST /api/projects/:id/keys`
  - `GET /api/projects/:id/keys`
  - `GET /api/projects/:id/keys/:keyId`
  - `PATCH /api/projects/:id/keys/:keyId`
  - `DELETE /api/projects/:id/keys/:keyId`
- 运行时鉴权：
  - `GET /v1/models`
  - `POST /v1/chat/completions`
  - `POST /v1/images/generations`
- 控制台页面：
  - `/keys`
  - `/keys/[id]`
  - Create Modal

## 执行步骤概述

1. 确认本地 `3099` 服务可用
2. 通过 `POST /api/auth/login` 获取管理员 token
3. 新建隔离测试项目，创建多组测试 Key
4. 按 API 用例验证创建、列表、详情、编辑、撤销、权限、过期、白名单、限流
5. 使用 Chrome MCP 进入 `/keys` 页面，验证搜索、分页、创建、复制、撤销、详情页

## 通过项

- 本地测试环境可正常访问，`/v1/models` 返回 `200`
- `POST /api/projects/:id/keys` 最小兼容请求仍可成功创建 Key
- 默认创建的 Key 可访问 `/v1/models`
- `GET /api/projects/:id/keys?search=Full` 能按名称过滤结果
- `GET /api/projects/:id/keys?page=1&limit=1` 的返回结果数量会受 `limit` 影响
- `PATCH rateLimit=0` 返回 `400`
- `PATCH` 非法 IP 白名单返回 `400`
- `PATCH status` 返回 `400`，拒绝通过 PATCH 改状态
- `DELETE /api/projects/:id/keys/:keyId` 首次撤销成功，再次撤销返回 `already_revoked`
- `/keys` 页面主体结构、统计卡、列表、Best Practices、FAB 均正常渲染
- Active 行 `edit` 按钮仍为 disabled，文案为 `Coming soon`
- Create Modal 正常打开，且 Description / Expiration / Permissions 为 disabled + `即将推出`
- Create Modal 可成功创建 Key，成功态完整 Key 仅显示一次
- 成功态复制按钮可用，出现 `已复制！`
- 列表不展示完整 Key，只展示掩码值
- `/keys` 前端分页可切换到第 2 页
- UI 撤销流程可正常执行，REVOKED 行显示 `history / delete` 占位操作

## 失败项

### 1. 创建扩展字段未真正落地

- 关联用例：
  - `API-101`
  - `API-102`
  - `API-103`
  - `API-106`
- 复现：
  1. `POST /api/projects/:id/keys` 传入 `description`、`expiresAt`、`permissions`、`rateLimit`、`ipWhitelist`
  2. 再调用 `GET /api/projects/:id/keys/:keyId`
- 实际结果：
  - 创建接口返回 `201`
  - 详情接口仍只返回旧字段
  - `description / permissions / expiresAt / rateLimit / ipWhitelist / updatedAt` 均不存在
- 预期结果：
  - 新字段应被保存并在详情中返回
- 严重级别：High

### 2. 列表接口仍是旧 contract，分页元数据缺失

- 关联用例：
  - `API-201`
  - `API-202`
  - `API-204`
- 实际结果：
  - `GET /api/projects/:id/keys?page=1&limit=1` 虽然只返回 1 条数据，但响应中没有 `pagination`
  - 列表项也未返回 `description / permissions / expiresAt`
- 预期结果：
  - 响应应包含 `data + pagination`
  - 列表项应返回扩展字段
- 严重级别：High

### 3. 详情接口仍是旧 contract

- 关联用例：
  - `API-301`
- 实际结果：
  - `GET /api/projects/:id/keys/:keyId` 仅返回 `id/keyPrefix/maskedKey/name/status/lastUsedAt/createdAt`
- 预期结果：
  - 应返回 `description / permissions / expiresAt / rateLimit / ipWhitelist / updatedAt`
- 严重级别：High

### 4. PATCH 编辑接口返回 500，且编辑不生效

- 关联用例：
  - `API-401`
  - `API-402`
  - `API-404`
  - `API-406`
- 实际结果：
  - `PATCH /api/projects/:id/keys/:keyId` 返回 `500`
  - 随后读取详情，`name` 仍保持旧值，说明未持久化
- 预期结果：
  - PATCH 返回 `200`
  - 字段更新成功并反映在详情中
- 严重级别：High

### 5. 过去时间 `expiresAt` 未被拒绝

- 关联用例：
  - `API-105`
- 实际结果：
  - `POST /api/projects/:id/keys` 传 `expiresAt=2020-01-01T00:00:00Z` 返回 `201`
- 预期结果：
  - 应返回 `400`
- 严重级别：High

### 6. `projectInfo=false` 未拦截 `/v1/models`

- 关联用例：
  - `API-604`
- 实际结果：
  - 带 `projectInfo=false` 的 Key 调用 `/v1/models` 返回 `200`
- 预期结果：
  - 应返回 `403`
- 严重级别：High

### 7. 过期 Key 运行时仍可访问

- 关联用例：
  - `API-701`
  - `API-702`
- 实际结果：
  - 设置 3 秒后过期的 Key，过期前 `GET /v1/models` 返回 `200`
  - 过期 5 秒后再次请求仍返回 `200`
- 预期结果：
  - 过期后应被拒绝
- 严重级别：High

### 8. IP 白名单运行时未生效

- 关联用例：
  - `API-802`
  - `API-803`
  - `API-804`
- 实际结果：
  - `ipWhitelist=[]` 调用 `/v1/models` 返回 `200`
  - `ipWhitelist=[\"1.2.3.4\"]` 调用 `/v1/models` 仍返回 `200`
- 预期结果：
  - 空数组应拒绝全部请求
  - 非命中来源应返回 `403`
- 严重级别：High

### 9. Key 级 RPM 限流未生效

- 关联用例：
  - `API-902`
  - `API-903`
- 实际结果：
  - `rateLimit=2` 的 Key 连续 3 次请求 `/v1/models` 均返回 `200`
- 预期结果：
  - 第 3 次应被限流
- 严重级别：High

### 10. 已撤销 Key 运行时仍可访问

- 关联用例：
  - `API-004`
  - `API-501`
- 实际结果：
  - DELETE 返回 `200`
  - 同一 Key 再调用 `/v1/models` 仍返回 `200`
- 预期结果：
  - 已撤销 Key 应返回鉴权失败
- 严重级别：Critical

### 11. 搜索清空恢复问题仍未修复

- 关联用例：
  - `UI-202`
  - `UI-203`
  - `UI-204`
- 复现：
  1. 在 `/keys` 搜索框输入 `NoSuchKey`
  2. 页面显示 `No keys found`
  3. 直接把输入框清空
- 实际结果：
  - 页面仍停留在 `No keys found`
  - 只有点击右侧清除按钮才恢复列表
- 预期结果：
  - 输入框清空后应自动恢复列表
- 严重级别：Medium

### 12. `/keys/[id]` 页面不可用

- 关联用例：
  - `UI-501`
- 实际结果：
  - 直接访问 `/keys/{id}` 后出现 `Application error: a client-side exception has occurred`
  - 控制台出现 `ChunkLoadError: Loading chunk 185 failed`
  - 网络请求中：
    - `GET /keys/cmng9nsia000t9ynk6rrid5lc` -> `404`
    - `GET /_next/static/css/54a8eef8a1a69b43.css` -> `404`
    - `GET /_next/static/chunks/app/layout-86a38d48f6f50959.js` -> `404`
- 预期结果：
  - 详情页应可正常加载
- 严重级别：High

## 未完成 / 不确定项

- `API-602` 聊天权限拦截：
  - 当前请求返回 `402 insufficient_balance`
  - 因测试项目余额为 `0`，无法确认 `chatCompletion=false` 是否会在计费前优先返回 `403`
- `API-603` 图片权限拦截：
  - 当前请求返回 `402 insufficient_balance`
  - 同样无法确认 `imageGeneration=false` 是否优先拦截
- `API-1001` 到 `API-1004` MCP 权限映射：
  - 本轮未执行
  - 未执行原因：当前未建立可复用的 MCP 集成调用 harness，本轮优先完成 HTTP 接口和控制台 UI 主链路

## 风险项

- 当前管理面与运行时鉴权存在明显脱节：
  - 管理面已部分暴露“权限 / 过期 / 白名单 / 限流”的验证和占位设计
  - 但运行时实际未拦截，容易形成“控制台看似配置成功，实际完全不生效”的高风险假象
- 已撤销 Key 仍可访问是当前最高风险问题，因为这会直接破坏 API Key 吊销语义
- `/keys/[id]` 页面资源 404 与 ChunkLoadError 说明详情页上线链路未完整

## 证据

- 列表页截图：
  - [api-keys-local-full-test-2026-04-02-list.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/api-keys-local-full-test-2026-04-02-list.png)
- Create Modal 截图：
  - [api-keys-local-full-test-2026-04-02-modal.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/api-keys-local-full-test-2026-04-02-modal.png)
- 搜索清空失败截图：
  - [api-keys-local-full-test-2026-04-02-search-clear-failed.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/api-keys-local-full-test-2026-04-02-search-clear-failed.png)
- 详情页异常截图：
  - [api-keys-local-full-test-2026-04-02-settings-page-error.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/api-keys-local-full-test-2026-04-02-settings-page-error.png)

## 最终结论

本轮本地完整测试结论为：`FAIL`。

当前版本不是“个别边角问题未收尾”，而是后端扩展 contract 与运行时鉴权链路仍未真正落地，且 `/keys/[id]` 页面不可用。可以确认通过的仅是原有列表页主流程、创建弹窗基础能力、部分输入校验与撤销 UI 表现；关键新增能力目前不能验收通过。


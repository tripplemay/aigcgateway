# API Keys 本地重测报告

## 测试目标

在拉取并确认本地代码已与 `origin/main` 一致后，使用 `bash scripts/test/codex-setup.sh` 重建本地测试环境，并重新执行一轮 API Keys API / 集成测试与手工测试，确认上一轮失败项的修复情况。

关联文档：

- [api-keys-backend-api-test-cases-2026-04-02.md](/Users/yixingzhou/project/aigcgateway/docs/test-reports/api-keys-backend-api-test-cases-2026-04-02.md)
- [api-keys-manual-test-cases-2026-04-02.md](/Users/yixingzhou/project/aigcgateway/docs/test-reports/api-keys-manual-test-cases-2026-04-02.md)
- [api-keys-local-full-test-report-2026-04-02.md](/Users/yixingzhou/project/aigcgateway/docs/test-reports/api-keys-local-full-test-report-2026-04-02.md)

## 测试环境

- 环境：本地 Codex 测试环境
- 地址：`http://localhost:3099`
- 启动方式：`bash scripts/test/codex-setup.sh`
- 验证方式：持久 PTY 前台启动 + 另一个 shell 轮询 `/v1/models`
- 代码状态：
  - 当前分支：`main`
  - 上游分支：`origin/main`
  - `HEAD` 与 `origin/main` 一致，无新提交可拉取
- 管理员账号：`admin@aigc-gateway.local / admin123`

## 执行步骤概述

1. 检查分支、远端与工作区状态
2. `git fetch origin`，确认 `HEAD == origin/main`
3. 用 `codex-setup.sh` 重建测试库、迁移、seed、build 并启动 `3099`
4. 等待 `GET /v1/models` 返回 `200`
5. 重新执行 API 集成回归
6. 重新执行 `/keys` 页面和 `/keys/[id]` 页面手工回归

## 与上一轮相比已修复

### 1. 创建扩展字段已落地

- `POST /api/projects/:id/keys` 传入 `description`、`expiresAt`、`permissions`
- `GET /api/projects/:id/keys/:keyId` 现在能返回：
  - `description`
  - `permissions`
  - `expiresAt`
  - `rateLimit`
  - `ipWhitelist`
  - `updatedAt`

### 2. 列表接口 contract 已扩展

- `GET /api/projects/:id/keys?page=1&limit=1` 现在返回：
  - `data`
  - `pagination.page`
  - `pagination.limit`
  - `pagination.total`
- 列表项现在也带有：
  - `description`
  - `permissions`
  - `expiresAt`

### 3. PATCH 编辑接口已恢复

- `PATCH /api/projects/:id/keys/:keyId` 现在返回 `200`
- 本轮验证到：
  - `name` 更新成功
  - `permissions` 按合并方式更新
  - `rateLimit` 更新成功
  - `ipWhitelist` 更新成功
  - `updatedAt` 正常变化

### 4. 过去时间 `expiresAt` 校验已修复

- `POST /api/projects/:id/keys` 传 `expiresAt=2020-01-01T00:00:00Z`
- 当前返回 `400`

### 5. `/keys/[id]` 不再出现客户端异常

- 上一轮现象：
  - 客户端异常
  - `ChunkLoadError`
  - 静态资源 `404`
- 本轮现象：
  - 直接返回标准 `404` 页面
- 说明：
  - 详情页资源异常已消失
  - 但路由本身仍未上线，因此仍不能算通过

## 本轮仍失败

### 1. `projectInfo=false` 仍未拦截 `/v1/models`

- 步骤：
  1. 创建 `permissions.projectInfo=false` 的 Key
  2. 调用 `GET /v1/models`
- 实际结果：
  - 返回 `200`
- 预期结果：
  - 应返回 `403`
- 严重级别：High

### 2. 过期 Key 仍可继续访问

- 步骤：
  1. 创建 3 秒后过期的 Key
  2. 过期前调用 `/v1/models`
  3. 等待 5 秒后再次调用
- 实际结果：
  - 过期前 `200`
  - 过期后仍 `200`
- 预期结果：
  - 过期后应被拒绝
- 严重级别：High

### 3. Key 级 RPM 限流仍未生效

- 步骤：
  1. 创建 `rateLimit=2` 的 Key
  2. 连续请求 `/v1/models` 3 次
- 实际结果：
  - `RATE_1=200`
  - `RATE_2=200`
  - `RATE_3=200`
- 预期结果：
  - 第 3 次应被限流
- 严重级别：High

### 4. 已撤销 Key 仍可继续访问

- 步骤：
  1. 创建 Key
  2. `DELETE /api/projects/:id/keys/:keyId`
  3. 使用同一 Key 调用 `/v1/models`
- 实际结果：
  - DELETE 返回 `200`
  - 运行时访问仍返回 `200`
- 预期结果：
  - 应返回鉴权失败
- 严重级别：Critical

### 5. 空白名单仍未拦截请求

- 步骤：
  1. 创建 `ipWhitelist=[]` 的 Key
  2. 调用 `/v1/models`
- 实际结果：
  - 返回 `200`
- 预期结果：
  - 应拒绝所有请求
- 严重级别：High

### 6. 搜索清空恢复问题仍未修复

- 步骤：
  1. `/keys` 搜索输入 `NoSuchKey`
  2. 页面出现 `No keys found`
  3. 直接清空输入框
- 实际结果：
  - 页面仍停留在 `No keys found`
  - 点击右侧清除按钮后才能恢复
- 预期结果：
  - 直接清空输入框后应立即恢复列表
- 严重级别：Medium

### 7. `/keys/[id]` 页面仍未上线

- 步骤：
  1. 创建新 Key
  2. 直接访问 `/keys/{id}`
- 实际结果：
  - 返回标准 `404` 页面
- 预期结果：
  - 应进入 API Key Settings 页面
- 严重级别：High

## 未完成 / 不确定项

- `chatCompletion=false` 与 `imageGeneration=false` 的运行时权限优先级，本轮未重新验证
- 原因：
  - 当前测试项目余额为 `0`
  - 相关请求容易先返回 `402 insufficient_balance`
  - 仍无法确认权限拦截是否会优先于计费检查返回 `403`

## 通过项

- 本地环境可用，`codex-setup.sh` 能完成 DB 重建、迁移、seed、build、启动
- `GET /v1/models` smoke 通过
- 创建扩展字段入库通过
- 列表分页 contract 通过
- 详情接口扩展字段返回通过
- PATCH 编辑通过
- `PATCH rateLimit=0`、非法 IP、PATCH 改 `status` 的输入校验保持正常
- Create Modal、成功态、复制按钮、列表渲染、撤销对话框、REVOKED 行样式保持正常

## 风险项

- 当前“管理面配置已可编辑”与“运行时真正执行拦截”之间仍然断裂
- 这意味着：
  - 控制台里看起来配置成功
  - 但真实流量仍可能完全不受限制
- 其中风险最高的是：
  - 已撤销 Key 仍可用
  - 过期 Key 仍可用
  - 限流配置无效

## 证据

- 搜索清空失败截图：
  - [api-keys-local-retest-2026-04-02-search-clear-failed.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/api-keys-local-retest-2026-04-02-search-clear-failed.png)
- 详情页 404 截图：
  - [api-keys-local-retest-2026-04-02-settings-page-404.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/api-keys-local-retest-2026-04-02-settings-page-404.png)

## 最终结论

本轮重测结论为：`FAIL`，但相较上一轮已有明显进展。

已确认修复：

- 管理面 API contract 基本补齐
- 列表 / 详情 / PATCH 主链路已落地
- 过去时间校验已修复
- `/keys/[id]` 不再客户端崩溃

仍未通过验收的关键问题：

- 撤销后仍可访问
- 过期后仍可访问
- 空白名单不生效
- Key 级 RPM 不生效
- `projectInfo=false` 不生效
- `/keys/[id]` 路由仍未真正实现
- 搜索清空恢复问题仍在


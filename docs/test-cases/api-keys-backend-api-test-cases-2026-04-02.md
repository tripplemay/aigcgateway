# API Keys 后端 API / 集成测试用例

## 测试目标

基于 [api-keys-backend-spec.md](/Users/yixingzhou/project/aigcgateway/docs/api-keys-backend-spec.md) 与当前仓库实现，整理 API Keys 后端扩展的待执行测试用例，供 Claude 开发完成后执行集成验证与回归。

本文件仅定义测试用例，不代表已执行。

## 测试环境

- 环境类型：本地测试环境
- 目标端口：`http://localhost:3099`
- 鉴权方式：
  - Console 管理接口：JWT / Console Session
  - OpenAI 兼容接口：`Authorization: Bearer pk_xxx`
  - MCP 接口：API Key 鉴权

## 测试范围

- ApiKey CRUD 扩展能力
- 列表搜索与分页
- Key 详情读取与编辑
- 撤销状态机与兼容性
- 权限矩阵鉴权
- 过期策略
- IP 白名单
- Key 级 RPM 限制
- MCP 权限映射
- 向后兼容行为

## 前置条件

- 已存在一个可操作的测试项目 `Test Project`
- 可通过控制台创建 API Key
- 测试环境支持读取数据库或通过 API 验证字段写入结果
- 如涉及 IP 白名单测试，具备可控请求来源或可模拟 `x-forwarded-for`
- 如涉及 RPM 限制测试，允许短时间内发送多次请求

## 用例设计原则

- 先验证兼容路径，再验证新增能力
- 先验证管理面接口，再验证运行时鉴权链路
- 对 `permissions = {}` 采用重点回归，因为这是本次后端改造最高风险点
- 对尚未实现的接口，执行时应记为 `BLOCKED` 或 `NOT IMPLEMENTED`，不得误记为业务失败

## API / 集成测试用例

### A. Smoke 与向后兼容

| 用例 ID | 标题 | 目标 | 前置条件 | 步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|---|---|
| API-001 | 旧版最小请求创建 Key 仍可成功 | 验证 POST 向后兼容 | 已登录 Console | 1. `POST /api/projects/:id/keys` 仅传 `{ "name": "Compat Key" }` | `201`；返回完整 `key`；`status=ACTIVE`；未传新字段时不报错 | P0 |
| API-002 | 旧版创建结果生成的 Key 可正常调用 `/v1/chat/completions` | 验证 `{}` 默认全权限 | 已拿到新建 Key | 1. 使用该 Key 调用聊天接口 | 请求通过；不得因 `permissions={}` 被拒绝 | P0 |
| API-003 | GET 列表在不传分页参数时兼容旧行为 | 验证列表兼容性 | 项目下有多个 Key | 1. `GET /api/projects/:id/keys` | `200`；返回列表或 `data+pagination` 的兼容约定；至少包含已有 Key | P1 |
| API-004 | DELETE 撤销后状态为 REVOKED 且不可再使用 | 验证旧路径仍可用 | 存在 ACTIVE Key | 1. DELETE 指定 Key 2. 使用该 Key 调用 `/v1/models` | 删除接口成功；后续请求返回鉴权失败 | P0 |

### B. 创建接口扩展

| 用例 ID | 标题 | 目标 | 前置条件 | 步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|---|---|
| API-101 | 创建 Key 时写入 description / expiresAt / permissions | 验证 POST 扩展字段入库 | 已登录 Console | 1. `POST /api/projects/:id/keys` 传入全部新字段 | `201`；返回创建成功；详情接口或 DB 可看到字段正确保存 | P0 |
| API-102 | 创建 Key 时不传 permissions 默认写入 `{}` | 验证默认值 | 已登录 Console | 1. POST 不传 `permissions` | 创建成功；详情结果 `permissions={}` 或等价空对象 | P0 |
| API-103 | 创建 Key 时 `expiresAt=null` 表示永不过期 | 验证空值语义 | 已登录 Console | 1. POST 传 `expiresAt:null` | 创建成功；详情 `expiresAt=null` | P1 |
| API-104 | 创建 Key 时传未来时间格式合法 | 验证时间校验 | 已登录 Console | 1. POST 传未来 ISO8601 时间 | 创建成功；返回或详情字段与输入一致 | P1 |
| API-105 | 创建 Key 时传过去时间应失败 | 验证非法过期时间被拒绝 | 已登录 Console | 1. POST 传过去时间 | `400`；错误信息明确 | P0 |
| API-106 | 创建 Key 时 permissions 仅配置部分字段 | 验证部分权限对象 | 已登录 Console | 1. POST `permissions={ "chatCompletion": true, "logAccess": false }` | 创建成功；未传字段保持缺省，后续鉴权仅 `=== false` 才拒绝 | P0 |

### C. 列表接口扩展

| 用例 ID | 标题 | 目标 | 前置条件 | 步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|---|---|
| API-201 | 列表返回扩展字段 | 验证 GET 响应结构 | 项目下存在含新字段的 Key | 1. GET 列表 | 每条记录包含 `description` `permissions` `expiresAt` `lastUsedAt` `createdAt` `maskedKey` | P0 |
| API-202 | 列表分页 page/limit 生效 | 验证分页 | 项目下至少 6 个 Key | 1. `GET ?page=1&limit=5` 2. `GET ?page=2&limit=5` | 返回 `pagination`；页码与数量正确 | P1 |
| API-203 | 列表 search 按 name 模糊搜索 | 验证搜索 | 存在可区分命名的 Key | 1. `GET ?search=Gateway` | 仅返回匹配项；`pagination.total` 与过滤后总数一致 | P0 |
| API-204 | 列表 search 空结果返回空数组而非报错 | 验证空态 API | 项目下无匹配 Key | 1. `GET ?search=NoSuchKey` | `200`；`data=[]`；`pagination.total=0` | P1 |
| API-205 | 列表只返回项目内数据 | 验证项目隔离 | 至少两个项目 | 1. 分别请求两个项目列表 | 两个项目的数据彼此隔离；不得串项目返回 | P0 |

### D. 详情接口

| 用例 ID | 标题 | 目标 | 前置条件 | 步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|---|---|
| API-301 | GET 详情返回完整字段 | 验证详情路由 | 存在目标 Key | 1. `GET /api/projects/:id/keys/:keyId` | `200`；返回 spec 定义的完整对象；包含 `rateLimit` `ipWhitelist` `updatedAt` | P0 |
| API-302 | GET 非本项目 Key 被拒绝 | 验证归属校验 | 不同项目各有 Key | 1. 用项目 A 的 JWT 请求项目 B 的 Key | `404` 或 `403`，但不得泄露对象存在性细节 | P0 |
| API-303 | GET 不存在的 keyId 返回 404 | 验证错误处理 | 已登录 Console | 1. 请求不存在 keyId | `404`；错误信息稳定 | P1 |

### E. 编辑接口

| 用例 ID | 标题 | 目标 | 前置条件 | 步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|---|---|
| API-401 | PATCH 可更新 name / description | 验证基本编辑 | 存在 ACTIVE Key | 1. PATCH 更新文本字段 | `200`；详情读取为新值；`updatedAt` 变化 | P0 |
| API-402 | PATCH 可部分更新 permissions 且未传字段保持原值 | 验证合并更新 | 存在已设置权限的 Key | 1. PATCH 仅传 `{"permissions":{"logAccess":false}}` | `logAccess` 更新；其他权限不被清空 | P0 |
| API-403 | PATCH `expiresAt=null` 可清除过期时间 | 验证清除逻辑 | Key 已设置过期时间 | 1. PATCH 传 `expiresAt:null` | 更新成功；详情 `expiresAt=null` | P1 |
| API-404 | PATCH `rateLimit` 为正整数成功 | 验证 RPM 设置 | 存在 ACTIVE Key | 1. PATCH `rateLimit=500` | 更新成功；详情显示 `500` | P1 |
| API-405 | PATCH `rateLimit<=0` 被拒绝 | 验证非法值 | 存在 ACTIVE Key | 1. PATCH `rateLimit=0` | `400`；错误信息明确 | P0 |
| API-406 | PATCH 合法 IPv4/IPv6/CIDR 白名单成功 | 验证 IP 校验 | 存在 ACTIVE Key | 1. PATCH `ipWhitelist=["1.2.3.4","10.0.0.0/8","2001:db8::/32"]` | 更新成功；详情值一致 | P1 |
| API-407 | PATCH 非法 IP 白名单值被拒绝 | 验证非法 IP 校验 | 存在 ACTIVE Key | 1. PATCH `ipWhitelist=["999.1.1.1"]` | `400`；错误信息明确 | P0 |
| API-408 | PATCH 传入 `status` 字段被拒绝或忽略 | 验证状态机约束 | 存在 ACTIVE Key | 1. PATCH `{"status":"REVOKED"}` | 不允许通过 PATCH 修改状态 | P0 |

### F. 撤销状态机

| 用例 ID | 标题 | 目标 | 前置条件 | 步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|---|---|
| API-501 | ACTIVE Key 可撤销 | 验证 DELETE 正常路径 | 存在 ACTIVE Key | 1. DELETE 目标 Key | `200`；状态变为 `REVOKED` | P0 |
| API-502 | 已撤销 Key 再次 DELETE 被拒绝 | 验证不可逆 | Key 已 REVOKED | 1. 再次 DELETE | `400` 或定义内错误码；信息明确 | P1 |
| API-503 | REVOKED Key 不能通过 PATCH 恢复 | 验证不可逆状态机 | Key 已 REVOKED | 1. PATCH 任意字段 2. 若实现允许编辑，继续尝试恢复状态 | 不得恢复 ACTIVE；若限制编辑需明确返回错误 | P0 |

### G. 权限矩阵鉴权

| 用例 ID | 标题 | 目标接口 | 前置条件 | 步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|---|---|
| API-601 | `permissions={}` 对聊天接口放行 | `/v1/chat/completions` | 新建默认 Key | 1. 用默认 Key 调用聊天 | 不被权限拒绝 | P0 |
| API-602 | `chatCompletion=false` 拒绝聊天接口 | `/v1/chat/completions` | Key 权限显式禁止聊天 | 1. 调用聊天接口 | `403`；错误信息明确为权限不足 | P0 |
| API-603 | `imageGeneration=false` 拒绝图片生成 | `/v1/images/generations` | Key 权限显式禁止图片 | 1. 调用图片接口 | `403` | P0 |
| API-604 | `projectInfo=false` 拒绝 `/v1/models` | `/v1/models` | Key 权限显式禁止项目信息 | 1. 调用 `/v1/models` | `403` | P0 |
| API-605 | `logAccess=false` 拒绝日志类 MCP 工具 | MCP logs | Key 权限显式禁止日志 | 1. 调用日志工具 | `403` 或明确 MCP 权限错误 | P1 |
| API-606 | 仅显式 false 拒绝，字段缺失不拒绝 | 多接口 | 构造部分 permissions Key | 1. 缺省字段分别调用对应接口 | 缺省字段可通过 | P0 |

### H. 过期策略

| 用例 ID | 标题 | 目标 | 前置条件 | 步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|---|---|
| API-701 | 未过期 Key 可正常访问 | 验证正常路径 | Key `expiresAt` 为未来时间 | 1. 调用 `/v1/models` | 通过 | P1 |
| API-702 | 已过期 Key 被拒绝 | 验证过期拦截 | 构造已过期 Key | 1. 调用任一受保护接口 | `401` 或 `403`，错误语义明确 | P0 |
| API-703 | `expiresAt=null` 永不过期 | 验证空值语义 | Key 无过期时间 | 1. 调用受保护接口 | 通过 | P1 |

### I. IP 白名单

| 用例 ID | 标题 | 目标 | 前置条件 | 步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|---|---|
| API-801 | `ipWhitelist=null` 不限制来源 IP | 验证默认放行 | Key 未设置白名单 | 1. 发起请求 | 通过 | P1 |
| API-802 | 来源 IP 命中白名单时放行 | 验证匹配逻辑 | Key 已设置白名单 | 1. 从白名单 IP 或模拟头发起请求 | 通过 | P0 |
| API-803 | 来源 IP 不在白名单时拒绝 | 验证拦截逻辑 | Key 已设置白名单 | 1. 从非白名单 IP 发起请求 | `403` | P0 |
| API-804 | 空数组白名单拒绝所有请求 | 验证边界语义 | Key `ipWhitelist=[]` | 1. 任意来源请求 | 全部拒绝 | P1 |

### J. Key 级 RPM 限制

| 用例 ID | 标题 | 目标 | 前置条件 | 步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|---|---|
| API-901 | `rateLimit=null` 时回退项目默认策略 | 验证回退逻辑 | Key 未设置 rateLimit | 1. 在默认限流范围内请求 | 行为与旧版一致 | P1 |
| API-902 | Key 级 rateLimit 生效并先于默认限制 | 验证覆盖逻辑 | Key `rateLimit=2` | 1. 1 分钟内连续发 3 次请求 | 第 3 次被限流 | P0 |
| API-903 | 不同 Key 各自独立计数 | 验证按 Key 隔离 | 至少 2 个不同 Key | 1. 对 Key A 打满配额 2. 用 Key B 调用 | Key B 不受 Key A 影响 | P1 |

### K. MCP 权限映射

| 用例 ID | 标题 | 目标 | 前置条件 | 步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|---|---|
| API-1001 | MCP chat tool 受 `chatCompletion` 控制 | MCP chat | Key 禁止聊天 | 1. 调用 MCP chat tool | 被拒绝 | P0 |
| API-1002 | MCP generate_image 受 `imageGeneration` 控制 | MCP generate_image | Key 禁止图片 | 1. 调用图片工具 | 被拒绝 | P0 |
| API-1003 | MCP list_models / get_balance / get_usage_summary 受 `projectInfo` 控制 | MCP project info tools | Key 禁止项目信息 | 1. 调用上述工具 | 被拒绝 | P0 |
| API-1004 | MCP list_logs / get_log_detail 受 `logAccess` 控制 | MCP logs tools | Key 禁止日志 | 1. 调用日志工具 | 被拒绝 | P1 |

## 执行顺序建议

1. 先执行 A/B/C/D/E/F，确认管理接口 contract 已落地
2. 再执行 G/H/I/J，确认运行时鉴权链路
3. 最后执行 K，确认 MCP 与 OpenAI 兼容接口一致

## 高风险重点回归

- `permissions={}` 是否被错误解释为“全部拒绝”
- `PATCH permissions` 是否错误覆盖为全量替换
- `REVOKED` Key 是否仍能访问受保护接口
- 过期校验是否使用错误时区或错误比较方向
- IP 白名单是否错误信任伪造请求头
- `rateLimit` 是否意外污染到其他 Key

## 执行结果占位

- 当前状态：未执行
- 未执行原因：等待 Claude 按规格完成后端开发后，再按本用例集执行

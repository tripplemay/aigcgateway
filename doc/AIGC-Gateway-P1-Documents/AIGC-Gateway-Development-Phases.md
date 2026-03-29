# AIGC Gateway — P1 开发阶段计划

> 版本 1.0 · 2026年3月29日
> 配套文档：AIGC-Gateway-P1-PRD 及全套设计文档
> 开发工具：Claude Code
> 验证方式：每个阶段完成后由产品负责人验证，通过后进入下一阶段

---

## 总览

| 阶段 | 内容 | 预计工期 | 依赖 |
|------|------|---------|------|
| 1 | 项目骨架 + 数据库 | 2-3 天 | 无 |
| 2 | 适配器引擎 + 服务商对接 | 4-5 天 | 阶段 1 |
| 3 | API 网关（核心端点） | 3-4 天 | 阶段 2 |
| 4 | 健康检查系统 | 2 天 | 阶段 2 |
| 5 | TypeScript SDK | 2-3 天 | 阶段 3 |
| 6 | 认证 + 计费 + 支付 | 4-5 天 | 阶段 1, 3 |
| 7 | 运营控制台（Admin 页面） | 3-4 天 | 阶段 6, 4 |
| 8 | 开发者控制台 | 3-4 天 | 阶段 6, 7 |
| 9 | 集成测试 + 文档 + 上线 | 2-3 天 | 全部 |

**总计：25-35 天（约 6-8 周）**

---

## 阶段 1：项目骨架 + 数据库

### 工期：2-3 天

### 开发内容

1. **Next.js 项目初始化**
   - App Router + TypeScript + Tailwind CSS
   - 项目目录结构规划
   - ESLint + Prettier 配置
   - 环境变量框架（.env.example 含全部占位符）

2. **Prisma 配置 + Schema**
   - 12 张表完整 Schema（参照数据库设计文档）
   - User / Project / ApiKey / Provider / ProviderConfig / Model / Channel / CallLog / Transaction / RechargeOrder / HealthCheck
   - 全部枚举类型定义

3. **数据库迁移**
   - 执行 `prisma migrate dev`
   - 验证全部表结构和索引

4. **原生 SQL 补充**
   - 全文搜索 tsvector 列 + GIN 索引 + 触发器
   - deduct_balance 并发安全扣费函数
   - check_balance 余额检查函数

5. **种子数据**
   - 7 家 Provider 记录（含 ProviderConfig）
   - 首批 Model 记录（含平台统一命名）
   - 首批 Channel 记录（关联 Provider + Model，含 realModelId + 定价）
   - 管理员账号

### 验证清单

- [ ] `npx prisma studio` 可查看全部表结构
- [ ] 种子数据已填充：7 家 Provider + 对应 Model + Channel
- [ ] 全文搜索触发器：插入 CallLog 后 search_vector 自动生成
- [ ] deduct_balance 函数：并发调用不会超扣（可写脚本模拟）
- [ ] .env.example 包含全部环境变量，无硬编码域名

### 参照文档

- AIGC-Gateway-Database-Design.md（全部内容）
- AIGC-Gateway-Provider-Adapter-Spec.md（§2 各家配置数据）

---

## 阶段 2：适配器引擎 + 服务商对接

### 工期：4-5 天

### 开发内容

1. **OpenAI 兼容引擎（基座）**
   - 标准请求体构建（messages / temperature / max_tokens 等）
   - SSE 流式响应解析器（buffer 拼接 / 注释忽略 / [DONE] 处理）
   - usage 数据提取
   - 错误码映射（服务商错误码 → 平台错误码）
   - 响应标准化（统一 choices / usage / finish_reason 结构）

2. **配置覆盖层**
   - 从 ProviderConfig 读取运行时配置
   - temperature 自动 clamp（按 min/max 范围）
   - 不支持的参数自动移除（按 quirks 标记）
   - Base URL 末尾斜杠处理

3. **专属 Adapter — 火山引擎**
   - 图片生成优先走 /chat/completions
   - 失败回退 /images/generations
   - 多尺寸重试逻辑

4. **专属 Adapter — 硅基流动**
   - 图片响应格式转换（images[0].url → data[0].url）

5. **通道路由逻辑**
   - 输入：modelName（如 openai/gpt-4o）
   - 查询：Model → Channel（status=ACTIVE）→ 按 priority 排序 → 取第一条
   - 输出：Channel + Provider + Adapter 实例

6. **代理支持**
   - 按 Provider.proxyUrl 配置走 SOCKS5 代理
   - 无 proxyUrl 则直连

### 验证清单

- [ ] 编写测试脚本，向 7 家服务商各发一次文本请求，全部成功返回
- [ ] OpenAI + Claude + DeepSeek + 智谱 + OpenRouter：走通用引擎
- [ ] 火山引擎：图片通过 chat 接口生成成功
- [ ] 硅基流动：图片响应正确转换为标准格式
- [ ] 智谱 temperature=0 的请求自动 clamp 为 0.01
- [ ] Claude temperature=1.5 的请求自动 clamp 为 1
- [ ] 通道路由：指定 model 能正确找到对应 Channel
- [ ] 代理：OpenAI / Claude / OpenRouter 通过代理调用成功

### 参照文档

- AIGC-Gateway-Provider-Adapter-Spec.md（全部内容）
- AIGC-Gateway-Database-Design.md（§3 Provider/Channel 模型）

---

## 阶段 3：API 网关（核心端点）

### 工期：3-4 天

### 开发内容

1. **中间件管道**
   - API Key 鉴权：sha256(key) → 查 api_keys.keyHash → 关联 Project
   - 余额检查：Project.balance > 0，否则返回 402
   - 限流：Redis 计数器，RPM/TPM/图片RPM，超限返回 429 + Retry-After
   - 参数校验：必填字段、model 是否存在
   - 日志初始化：生成 traceId、开始计时

2. **POST /v1/chat/completions**
   - 非流式：调用适配器引擎 → 标准化响应 → 返回 JSON
   - 流式：调用适配器引擎 → SSE 透传 → 最后一个 chunk 含 usage
   - X-Trace-Id 响应 Header

3. **POST /v1/images/generations**
   - 调用适配器引擎 → 标准化响应 → 返回 JSON

4. **GET /v1/models**
   - 查询所有 status=ACTIVE 的 Model + 关联的 sellPrice
   - 返回 OpenAI /models 兼容格式 + 扩展价格字段

5. **异步后处理**
   - 审计日志写入 CallLog（完整 prompt 快照 + 输出 + usage + 成本 + 性能指标）
   - 扣费执行 deduct_balance（仅 SUCCESS 和 FILTERED 扣费，ERROR/TIMEOUT 不扣）
   - 写入 Transaction 记录

6. **错误处理**
   - 统一错误响应格式 { error: { type, code, message } }
   - HTTP 状态码映射（401/402/404/422/429/500/502/503）

### 验证清单

- [ ] curl 非流式文本生成：返回正确内容 + X-Trace-Id Header
- [ ] curl 流式文本生成：SSE 格式正确 + 最后一个 chunk 含 usage + data: [DONE]
- [ ] curl 图片生成：返回图片 URL
- [ ] curl GET /models：返回模型列表含价格
- [ ] 无效 API Key → 401
- [ ] 余额为 0 → 402 + 返回当前余额
- [ ] 超过 RPM 限制 → 429 + Retry-After Header
- [ ] 不存在的 model → 404
- [ ] 调用后 CallLog 表有对应记录，包含完整 prompt 和输出
- [ ] 调用后 Project.balance 正确扣减
- [ ] 调用后 Transaction 表有对应 DEDUCTION 记录
- [ ] 失败调用不扣费

### 参照文档

- AIGC-Gateway-API-Specification.md（§2 AI调用接口 + §7 错误处理 + §8 限流）
- AIGC-Gateway-Database-Design.md（§4 deduct_balance 函数）

---

## 阶段 4：健康检查系统

### 工期：2 天

### 开发内容

1. **三级验证逻辑**
   - Level 1 连通性：HTTP 200 + 鉴权通过 + 响应非空
   - Level 2 格式一致性：choices[0].message.content + usage + finish_reason
   - Level 3 响应质量：固定 prompt "请回答1+1等于几，只回答数字" → 验证含 "2"
   - 图片通道：发送测试 prompt → 验证返回有效 URL 或 base64

2. **分级频率调度**
   - 活跃通道（1小时内有调用）：每 10 分钟
   - 备用通道（priority > 1, active）：每 30 分钟
   - 冷门通道（24小时无调用）：每 2 小时
   - 定时任务调度（Cron 或 setInterval）

3. **自动降级与恢复**
   - 单次失败 → 立即重试 → 仍失败标记 DEGRADED
   - 连续 3 次失败 → 自动设为 DISABLED
   - DISABLED 通道降频到每 30 分钟检查
   - 恢复（通过三级验证）→ 自动设回 ACTIVE

4. **记录与告警**
   - 每次检查写入 HealthCheck 表
   - 通道状态变更时推送告警（Webhook）
   - 7 天前的 HealthCheck 记录定时清理

### 验证清单

- [ ] 手动触发一次全量检查，7 家服务商全部通道检查结果正确
- [ ] 修改某个 Provider 的 API Key 为无效值 → 健康检查检测到失败
- [ ] 连续 3 次失败后 → Channel.status 自动变为 DISABLED
- [ ] 修复 Key 后 → 下次检查通过 → status 自动恢复为 ACTIVE
- [ ] HealthCheck 表记录完整（level / result / latencyMs / errorMessage）
- [ ] 告警 Webhook 正确触发（可用 webhook.site 接收验证）

### 参照文档

- AIGC-Gateway-P1-PRD.md（§7 健康检查）
- AIGC-Gateway-Provider-Adapter-Spec.md（§5 健康检查探针适配）

---

## 阶段 5：TypeScript SDK

### 工期：2-3 天

### 开发内容

1. **Gateway 类**
   - 构造函数：config 校验、默认值填充
   - chat(params)：非流式 → ChatResponse
   - chat(params + stream:true)：流式 → ChatStream（AsyncIterable）
   - image(params) → ImageResponse
   - models(params?) → ModelInfo[]

2. **SSE 流式解析器**
   - ReadableStream → AsyncIterator\<StreamChunk\>
   - buffer 拼接处理（跨 TCP 包）
   - 忽略 SSE 注释（: 开头）
   - [DONE] 终止
   - 最后一个 chunk 提取 usage
   - stream.collect() → ChatResponse

3. **错误类型层级**
   - GatewayError（基类）
   - AuthError / InsufficientBalanceError / ModelNotFoundError / InvalidParameterError
   - RateLimitError（含 retryAfter）
   - ProviderError / NoChannelError / ContentFilteredError / ConnectionError

4. **重试策略**
   - 指数退避：initialDelay × backoffMultiplier^n
   - 429 优先读 Retry-After Header
   - 流式请求仅连接建立前重试
   - 可配置 maxRetries / retryOn / initialDelay

5. **traceId 透传**
   - 从 X-Trace-Id Header 或 response body id 字段提取
   - 非流式：res.traceId
   - 流式：stream.traceId（连接建立时即可用）

6. **构建与发布**
   - tsup / unbuild 构建 CJS + ESM + .d.ts
   - package.json exports 配置
   - 零依赖（仅用 Node 18+ 内置 fetch）

### 验证清单

- [ ] 测试脚本：非流式文本生成，打印 content + traceId + usage
- [ ] 测试脚本：流式文本生成，逐 chunk 打印，结束后打印 traceId + usage
- [ ] 测试脚本：stream.collect() 收集为完整响应
- [ ] 测试脚本：图片生成，打印 url + traceId
- [ ] 测试脚本：models() 返回模型列表
- [ ] 错误处理：无效 Key → AuthError
- [ ] 错误处理：余额为 0 → InsufficientBalanceError（含 balance 字段）
- [ ] 错误处理：无效 model → ModelNotFoundError
- [ ] 重试：模拟 502 → SDK 自动重试 → 最终成功或抛出 ProviderError
- [ ] 构建产物：dist/ 包含 index.js + index.mjs + index.d.ts

### 参照文档

- AIGC-Gateway-SDK-Interface-Design.md（全部内容）
- AIGC-Gateway-API-Specification.md（§9 SDK 接口映射）

---

## 阶段 6：认证 + 计费 + 支付

### 工期：4-5 天

### 开发内容

1. **用户认证**
   - POST /api/auth/register（邮箱 + 密码 + 名称）
   - POST /api/auth/login（JWT 签发）
   - POST /api/auth/verify-email（邮箱验证令牌）
   - 密码 bcrypt 哈希
   - JWT 中间件（控制台 API 鉴权）

2. **项目管理**
   - CRUD /api/projects（当前用户名下）
   - 创建项目时自动初始化余额为 0

3. **API Key 管理**
   - POST /api/projects/:id/keys（生成 Key，返回原文仅一次）
   - GET /api/projects/:id/keys（列表，仅显示 prefix + 掩码）
   - DELETE /api/projects/:id/keys/:keyId（吊销）
   - Key 存储为 sha256 hash

4. **充值订单 + 支付对接**
   - POST /api/projects/:id/recharge（创建订单 → 调支付渠道 → 返回支付链接）
   - 支付宝当面付 / 电脑网站支付对接
   - 微信 Native 支付对接
   - POST /api/webhooks/alipay（回调验签 + 入账）
   - POST /api/webhooks/wechat（回调验签 + 入账）
   - 幂等处理（同一 paymentOrderId 只入账一次）

5. **定时任务**
   - 过期订单关闭（每 5 分钟，关闭 30 分钟未支付的 PENDING 订单）
   - 余额告警检查（每小时，低于阈值发邮件）

6. **交易记录**
   - GET /api/projects/:id/transactions（分页）
   - GET /api/projects/:id/balance（余额信息）

### 验证清单

- [ ] 注册 → 收到验证邮件 → 验证 → 登录成功
- [ ] 创建项目 → 生成 API Key → Key 原文展示一次 → 刷新后仅显示掩码
- [ ] 吊销 Key → 用该 Key 调 API → 401
- [ ] 支付宝充值 → 支付 → 回调 → 余额增加 → Transaction 记录正确
- [ ] 微信充值 → 支付 → 回调 → 余额增加 → Transaction 记录正确
- [ ] 重复回调 → 不重复入账
- [ ] 30 分钟未支付 → 订单自动关闭
- [ ] 余额低于告警阈值 → 收到通知
- [ ] 完整链路：充值 → 用 SDK 调用 → 余额扣减 → 交易记录显示充值 + 扣费

### 参照文档

- AIGC-Gateway-Payment-Integration.md（全部内容）
- AIGC-Gateway-API-Specification.md（§4 项目管理 + §6 认证）
- AIGC-Gateway-Database-Design.md（§3 ApiKey + Transaction + RechargeOrder）

---

## 阶段 7：运营控制台（Admin 页面）

### 工期：3-4 天

### 开发内容

1. **控制台布局框架**
   - shadcn/ui 安装配置
   - 侧边栏导航组件（admin 和 developer 角色不同菜单）
   - 页面路由结构（/admin/* 路由 + 权限守卫）

2. **服务商管理页面**
   - 列表 + 创建 + 编辑表单
   - 配置覆盖编辑面板（temperature range / quirks 等）

3. **模型管理页面**
   - 列表 + 创建 + 编辑表单

4. **通道管理页面**
   - 列表 + 筛选（按服务商 / 模型 / 状态）
   - Priority 内联编辑
   - 成本价 / 售价配置
   - 状态切换

5. **健康监控页面**
   - 概览卡片（健康 / 降级 / 禁用数）
   - 通道健康卡片列表（状态灯 + L1/L2/L3 结果）
   - 手动触发检查按钮
   - 检查历史展开

6. **全局审计日志页面**
   - 复用开发者审计日志组件 + 额外字段（channelId / costPrice / 项目筛选）
   - 全文搜索

7. **全局用量页面**
   - 指标卡片（总调用 / 总收入 / 总成本 / 毛利）
   - 收入 vs 成本趋势图
   - 按服务商 / 按模型分布
   - 服务商费用明细表格

8. **开发者管理页面**
   - 开发者列表 + 详情
   - 手动充值功能

### 验证清单

- [ ] 管理员登录 → 看到完整 admin 菜单
- [ ] 服务商 CRUD 正常 + 配置覆盖可编辑
- [ ] 通道 priority 内联编辑 → 保存成功
- [ ] 健康监控 → 显示所有通道状态 + 手动检查可触发
- [ ] 全局审计 → 可看到所有项目的调用 + channelId + costPrice 可见
- [ ] 全局审计 → 全文搜索可用
- [ ] 全局用量 → 毛利数据 = 收入 - 成本
- [ ] 开发者管理 → 可查看开发者余额 + 手动充值生效

### 参照文档

- AIGC-Gateway-Console-Interaction-Spec.md（§4 运营页面）
- AIGC-Gateway-API-Specification.md（§5 运营管理接口）

---

## 阶段 8：开发者控制台

### 工期：3-4 天

### 开发内容

1. **注册 / 登录页面**
   - 注册表单（邮箱 + 密码 + 确认密码 + 名称）
   - 登录表单
   - 邮箱验证提示页

2. **Dashboard**
   - 4 个指标卡片（今日调用 / 费用 / 延迟 / 成功率）
   - Recharts 图表：调用趋势（面积图）/ 成本趋势（柱状图）/ 小时分布 / 模型占比（环形图）
   - 最近调用表格（5行，可点击跳转到审计日志）

3. **API Key 管理页面**
   - Key 列表 + 创建对话框（含"仅展示一次"警告）+ 吊销确认

4. **模型列表页面**
   - 模型表格 + 搜索 + 模态筛选

5. **审计日志页面**
   - 全文搜索框 + 状态筛选按钮组 + 日期范围选择器
   - 日志列表表格（TanStack Table，排序 / 分页）
   - 行点击展开详情面板（prompt / response / 参数 / 性能）

6. **用量统计页面**
   - 时间范围选择 + 指标卡片 + 图表 + 模型排行

7. **余额与充值页面**
   - 余额卡片 + 充值对话框（档位 / 自定义 / 支付方式）+ 交易记录

8. **快速开始页面**
   - 4 步代码示例（安装 / 调用 / 流式 / 图片）+ 复制按钮

9. **账号设置页面**
   - 个人信息编辑 + 修改密码 + 通知设置

### 验证清单

- [ ] 新用户完整旅程：注册 → 验证邮箱 → 登录 → 创建项目 → 生成 Key → Quick start 页面引导
- [ ] 充值旅程：余额页面 → 充值 → 支付 → 余额更新
- [ ] 调用旅程：用 SDK 发几次调用 → Dashboard 数据更新 → 图表显示正确
- [ ] 审计旅程：调用后 → 审计日志页面看到记录 → 搜索关键词能找到 → 点击展开详情完整
- [ ] 模型页面：列表正确 + 搜索和筛选可用
- [ ] API Key：创建后仅展示一次 + 吊销后不可恢复
- [ ] 余额不足时 Dashboard 指标卡片显示警告
- [ ] developer 角色看不到 admin 菜单

### 参照文档

- AIGC-Gateway-Console-Interaction-Spec.md（§2 开发者页面 + §3 共用页面）
- AIGC-Gateway-API-Specification.md（§4 控制台内部 API）

---

## 阶段 9：集成测试 + 文档 + 上线

### 工期：2-3 天

### 开发内容

1. **端到端测试**
   - 注册 → 充值 → 调用（7家服务商文本+图片）→ 审计日志 → 扣费 → 全链路正确
   - 异常场景：余额不足 / Key 吊销 / 服务商超时 / 内容审核拦截
   - 并发测试：多个请求同时扣费不超扣

2. **7 家服务商全量验证**
   - 每条通道至少一次成功的文本调用
   - 有图片能力的通道至少一次成功的图片生成
   - 健康检查全部三级验证通过

3. **SDK 发布**
   - npm publish（发布到 npm registry）
   - README.md（安装 + 快速开始 + API 参考）

4. **API 文档部署**
   - 控制台内嵌或独立文档站点
   - 代码示例可复制

5. **生产环境部署**
   - 按部署与运维方案执行
   - 完整上线检查清单逐项确认

6. **监控告警验证**
   - P0 告警触发测试
   - 定时任务执行确认

### 验证清单

- [ ] 上线检查清单全部打勾（见 Deployment-Operations.md §10）
- [ ] 用真实账号走一遍完整用户旅程（注册到调用到审计）
- [ ] 7 家服务商全部通道调用验证通过
- [ ] SDK 已发布，npm install 可用
- [ ] 文档已部署，开发者可访问
- [ ] 监控告警正常工作

### 参照文档

- AIGC-Gateway-Deployment-Operations.md（全部内容，特别是 §10 上线检查清单）
- 全部文档的最终核对

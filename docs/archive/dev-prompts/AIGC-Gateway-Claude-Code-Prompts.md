# AIGC Gateway — Claude Code 启动提示词

> 使用方式：每个阶段开始时，复制对应的提示词发送给 Claude Code。
> 前提：CLAUDE.md 已放在项目根目录，设计文档已放在 docs/AIGC-Gateway-P1-Documents/ 目录。

---

## 阶段 1：项目骨架 + 数据库

```
我们正在开发 AIGC Gateway 项目，当前进入【阶段 1：项目骨架 + 数据库】。

请先阅读以下文档：
1. CLAUDE.md（项目规则）
2. docs/AIGC-Gateway-P1-Documents/AIGC-Gateway-Database-Design.md（数据库设计）
3. docs/AIGC-Gateway-P1-Documents/AIGC-Gateway-Provider-Adapter-Spec.md 的第 2 节（各家服务商配置数据，用于种子数据）

本阶段要完成：
1. 初始化 Next.js 项目（App Router + TypeScript + Tailwind CSS）
2. 配置 Prisma，创建完整 Schema（12张表 + 全部枚举），参照数据库设计文档
3. 执行数据库迁移
4. 创建原生 SQL 迁移：全文搜索 tsvector + GIN 索引 + 触发器 + deduct_balance 函数 + check_balance 函数
5. 创建 .env.example，包含全部环境变量（参照部署文档），不硬编码任何域名
6. 创建种子数据（prisma/seed.ts）：7家 Provider + ProviderConfig + 首批 Model + Channel + 管理员账号
7. 创建 lib/env.ts，统一读取和校验环境变量

完成后我会用以下方式验证：
- prisma studio 查看全部表结构和种子数据
- 手动测试 deduct_balance 函数的并发安全性
- 检查 .env.example 无硬编码域名

请开始。
```

---

## 阶段 2：适配器引擎 + 服务商对接

```
当前进入【阶段 2：适配器引擎 + 服务商对接】。阶段 1 已完成并验证通过。

请先阅读：
1. docs/AIGC-Gateway-P1-Documents/AIGC-Gateway-Provider-Adapter-Spec.md（完整文档，这是本阶段的核心参照）
2. docs/AIGC-Gateway-P1-Documents/AIGC-Gateway-Database-Design.md 中 Provider / ProviderConfig / Channel 相关部分

本阶段要完成：
1. OpenAI 兼容引擎（lib/engine/openai-compat.ts）：请求构建 + SSE 解析 + usage 提取 + 错误映射 + 响应标准化
2. SSE 解析器（lib/engine/sse-parser.ts）：buffer 拼接 + 注释忽略 + [DONE] 处理
3. 配置覆盖层：从 ProviderConfig 读取，运行时自动 clamp temperature、移除不支持的参数（按 quirks 标记）
4. 火山引擎专属 Adapter（lib/engine/adapters/volcengine.ts）：图片优先走 chat → 回退 images → 多尺寸重试
5. 硅基流动专属 Adapter（lib/engine/adapters/siliconflow.ts）：图片响应格式转换 images[0].url → data[0].url
6. 通道路由器（lib/engine/router.ts）：modelName → 查 Model → 查 Channel(status=ACTIVE, 按 priority 排序) → 返回 Channel + Provider + Adapter
7. 代理支持：按 Provider.proxyUrl 配置 SOCKS5 代理

请参照适配规格表中每家服务商的差异矩阵和 quirks 标记来实现配置覆盖逻辑。

完成后我会用测试脚本向 7 家服务商各发一次文本请求 + 图片请求来验证。请同时生成这个测试脚本。
```

---

## 阶段 3：API 网关（核心端点）

```
当前进入【阶段 3：API 网关核心端点】。阶段 2 已完成并验证通过。

请先阅读：
1. docs/AIGC-Gateway-P1-Documents/AIGC-Gateway-API-Specification.md 的第 2 节（AI 调用接口）+ 第 7 节（错误处理）+ 第 8 节（限流）
2. docs/AIGC-Gateway-P1-Documents/AIGC-Gateway-Database-Design.md 中 CallLog + Transaction 相关部分

本阶段要完成：
1. API Key 鉴权中间件：sha256(key) → 查 api_keys.keyHash → 关联 Project → 挂到 request context
2. 余额检查中间件：Project.balance > 0，否则返回 402 + 当前余额
3. 限流中间件：Redis RPM/TPM 计数器，超限返回 429 + Retry-After + X-RateLimit-* Headers
4. POST /v1/chat/completions：非流式（JSON 响应）+ 流式（SSE），通过 model 参数路由到对应通道
5. POST /v1/images/generations：图片生成
6. GET /v1/models：返回所有可用模型 + sellPrice + capabilities
7. 异步后处理：调用完成后异步写入 CallLog（完整 prompt 快照 + 输出 + usage + 成本 + 性能指标）+ 异步执行 deduct_balance
8. 统一错误格式：{ error: { type, code, message, param } }
9. 所有响应携带 X-Trace-Id Header

参照 API 文档中的完整请求/响应格式。失败调用（status=ERROR/TIMEOUT）不扣费，FILTERED 扣输入 token 费用。

完成后我会用 curl 测试全部场景：正常调用、流式、图片、401/402/404/429 错误。
```

---

## 阶段 4：健康检查系统

```
当前进入【阶段 4：健康检查系统】。阶段 2、3 已完成。

请先阅读：
1. docs/AIGC-Gateway-P1-Documents/AIGC-Gateway-Provider-Adapter-Spec.md 第 5 节（健康检查探针适配）
2. docs/AIGC-Gateway-P1-Documents/AIGC-Gateway-Development-Phases.md 中阶段 4 的详细内容

本阶段要完成：
1. 三级验证逻辑（lib/health/checker.ts）：
   - Level 1 连通性：HTTP 200 + 鉴权通过 + 响应非空
   - Level 2 格式一致性：choices[0].message.content 存在 + usage 完整 + finish_reason 有效
   - Level 3 响应质量：固定 prompt "请回答1+1等于几，只回答数字" → 验证含 "2"
   - 图片通道：发测试 prompt → 验证返回有效 URL 或 base64
2. 分级频率调度（lib/health/scheduler.ts）：
   - 判定通道活跃度（过去1小时有调用 / priority>1 / 24小时无调用）
   - 活跃 10min / 备用 30min / 冷门 2h
3. 自动降级与恢复：
   - 单次失败 → 重试 → 仍失败标记 DEGRADED
   - 连续 3 次失败 → 自动 DISABLED
   - DISABLED 通道降频检查，恢复三级验证 → 自动 ACTIVE
4. HealthCheck 记录写入 + 7天清理定时任务
5. 告警推送（通道状态变更时调用 Webhook URL）
6. 手动触发检查接口：POST /api/admin/health/:channelId/check

注意 temperature 探针值要设为 0.01（而非 0），因为智谱不支持 0，引擎会自动 clamp。

完成后我会通过故意修改 API Key 来触发失败，验证自动降级和恢复机制。
```

---

## 阶段 5：TypeScript SDK

```
当前进入【阶段 5：TypeScript SDK】。阶段 3 已完成，API 网关在线可调用。

请先阅读：
1. docs/AIGC-Gateway-P1-Documents/AIGC-Gateway-SDK-Interface-Design.md（完整文档，这是本阶段的核心参照）
2. docs/AIGC-Gateway-P1-Documents/AIGC-Gateway-API-Specification.md 第 9 节（SDK 接口映射）

SDK 在 sdk/ 目录下独立开发，作为单独的 npm 包。

本阶段要完成：
1. Gateway 类：chat（非流式+流式重载）+ image + models
2. SSE 流式解析器：ReadableStream → AsyncIterator<StreamChunk>，处理 buffer 拼接、注释忽略、[DONE]、最后 chunk 提取 usage
3. ChatStream 类：实现 AsyncIterable + traceId + usage + abort() + collect()
4. 10 个错误类型：GatewayError（基类）→ AuthError / InsufficientBalanceError / RateLimitError / ProviderError / ModelNotFoundError / NoChannelError / InvalidParameterError / ContentFilteredError / ConnectionError
5. 重试策略：指数退避 + 429 Retry-After 优先 + 流式请求仅连接前重试
6. traceId 透传：从 X-Trace-Id Header 或 response body id 提取
7. 构建配置：CJS + ESM + .d.ts 输出，零依赖
8. 完整类型导出

请严格按照 SDK 设计文档中的类型定义实现，不要改变公开 API 的签名。

完成后请生成一个 examples/ 目录，包含测试脚本覆盖：非流式、流式、stream.collect()、图片生成、models()、各种错误场景。
```

---

## 阶段 6：认证 + 计费 + 支付

```
当前进入【阶段 6：认证 + 计费 + 支付】。阶段 1、3 已完成。

请先阅读：
1. docs/AIGC-Gateway-P1-Documents/AIGC-Gateway-Payment-Integration.md（完整文档）
2. docs/AIGC-Gateway-P1-Documents/AIGC-Gateway-API-Specification.md 第 4 节（项目管理）+ 第 6 节（认证接口）
3. docs/AIGC-Gateway-P1-Documents/AIGC-Gateway-Database-Design.md 中 User / ApiKey / Transaction / RechargeOrder 相关部分

本阶段要完成：
1. 用户认证：注册（邮箱+密码+名称）、登录（JWT）、邮箱验证、密码 bcrypt 哈希
2. JWT 中间件：控制台 API 鉴权（区分 DEVELOPER / ADMIN 角色）
3. 项目 CRUD：/api/projects（当前用户名下）
4. API Key 管理：生成（返回原文仅一次，存 hash）、列表（仅显示 prefix 掩码）、吊销
5. 充值订单创建：POST /api/projects/:id/recharge → 创建 RechargeOrder → 调支付渠道 → 返回支付链接
6. 支付宝对接：当面付/电脑网站支付 + 回调验签 + 入账（事务：更新订单 + 增余额 + 写 Transaction）
7. 微信支付对接：Native 支付 + 回调验签 + 入账
8. 幂等处理：同一 paymentOrderId 只入账一次
9. 定时任务：过期订单关闭（每5分钟）+ 余额告警检查（每小时）
10. 交易记录查询 + 余额查询接口

参照支付文档中的订单状态机、扣费计算公式、对账策略。

完成后我会走完整链路验证：注册 → 创建项目 → 生成 Key → 充值 → 用 SDK 调用 → 查看余额扣减 → 交易记录正确。
```

---

## 阶段 7：运营控制台（Admin 页面）

```
当前进入【阶段 7：运营控制台 Admin 页面】。阶段 4、6 已完成。

请先阅读：
1. docs/AIGC-Gateway-P1-Documents/AIGC-Gateway-Console-Interaction-Spec.md 第 1 节（全局规范）+ 第 4 节（运营页面）
2. docs/AIGC-Gateway-P1-Documents/AIGC-Gateway-API-Specification.md 第 5 节（运营管理接口）

本阶段要完成：
1. 控制台布局框架：安装 shadcn/ui + 侧边栏导航 + admin/developer 角色路由守卫
2. 服务商管理页面：列表 + 创建/编辑 + 配置覆盖编辑面板
3. 模型管理页面：列表 + 创建/编辑
4. 通道管理页面：列表 + 筛选 + priority 内联编辑 + 成本价/售价配置 + 状态切换
5. 健康监控页面：概览卡片 + 通道健康卡片（状态灯 + L1/L2/L3）+ 手动检查 + 历史展开
6. 全局审计日志页面：复用日志组件 + 额外字段（channelId/costPrice/项目筛选）+ 全文搜索
7. 全局用量页面：指标卡片 + 收入vs成本趋势图 + 按服务商/模型分布 + 毛利
8. 开发者管理页面：列表 + 详情 + 手动充值

使用 shadcn/ui 组件，Recharts 图表，TanStack Table 表格。参照交互规格文档中每个页面的字段清单和交互细节。

完成后我会以管理员身份登录验证全部 8 个页面的功能。
```

---

## 阶段 8：开发者控制台

```
当前进入【阶段 8：开发者控制台】。阶段 6、7 已完成。

请先阅读：
1. docs/AIGC-Gateway-P1-Documents/AIGC-Gateway-Console-Interaction-Spec.md 第 2 节（开发者页面）+ 第 3 节（共用页面）
2. docs/AIGC-Gateway-P1-Documents/AIGC-Gateway-API-Specification.md 第 4 节（项目管理接口）

本阶段要完成：
1. 注册/登录页面：居中卡片布局，表单校验（参照交互规格的校验规则）
2. Dashboard：4 指标卡片 + Recharts 图表（调用趋势面积图/成本柱状图/小时分布/模型占比环形图）+ 最近调用表格
3. API Key 管理：列表 + 创建对话框（"仅展示一次"警告 + 复制按钮）+ 吊销确认
4. 模型列表：表格 + 搜索 + 模态筛选
5. 审计日志：全文搜索框 + 状态筛选 + 日期选择 + TanStack Table + 行点击展开详情面板（prompt/response/参数/性能）
6. 用量统计：时间范围选择 + 指标卡片 + 图表 + 模型排行
7. 余额与充值：余额卡片 + 充值对话框（档位/自定义/支付方式选择）+ 交易记录
8. 快速开始：4步代码示例 + 复制按钮
9. 账号设置：个人信息 + 修改密码 + 通知设置

developer 角色不能看到 admin 菜单。所有数据仅显示当前项目范围内的。

完成后我会以新用户走完整旅程验证：注册 → 创建项目 → Quick start → 充值 → 调用 → Dashboard 看数据 → 审计日志搜索。
```

---

## 阶段 9：集成测试 + 文档 + 上线

```
当前进入【阶段 9：集成测试 + 文档 + 上线】。全部开发阶段已完成。

请先阅读：
1. docs/AIGC-Gateway-P1-Documents/AIGC-Gateway-Deployment-Operations.md（完整文档，特别是第 10 节上线检查清单）
2. docs/AIGC-Gateway-P1-Documents/AIGC-Gateway-Development-Phases.md 阶段 9 的验证清单

本阶段要完成：
1. 端到端测试脚本：覆盖注册→充值→调用（7家）→审计→扣费完整链路
2. 异常场景测试：余额不足/Key吊销/服务商超时/内容审核/并发扣费
3. 7 家服务商全量验证脚本：每条通道至少一次成功调用
4. SDK README.md：安装 + 快速开始 + API 参考 + 错误处理
5. API 文档页面（控制台内嵌或静态页面）
6. Dockerfile + docker-compose.yml（含 PostgreSQL + Redis）
7. 生产环境部署配置
8. 上线检查清单逐项确认

完成后做最终验证：用真实账号走一遍完整用户旅程。
```

---

## 阶段间衔接提示词

如果某个阶段跨多次对话，新对话开始时使用：

```
我们正在开发 AIGC Gateway 项目，当前处于【阶段 N：阶段名称】。

请阅读 CLAUDE.md 了解项目规则，然后阅读 docs/AIGC-Gateway-P1-Documents/AIGC-Gateway-Development-Phases.md 中阶段 N 的具体内容。

上次对话中已完成 [已完成的内容]，接下来需要继续 [待完成的内容]。

请继续。
```

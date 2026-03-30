# AIGC Gateway — 项目规则

## 项目概述

这是一个 AIGC 基础设施中台（AIGC Gateway），提供 AI 服务商管理、统一调用抽象、全链路审计、成本管理。商业模式为转售（统一采购），预充值计费，面向中小开发者的云托管 SaaS。

## 技术栈

- **运行时**: Node.js 22 + TypeScript (strict mode)
- **框架**: Next.js 14 (App Router)
- **数据库**: PostgreSQL + Prisma ORM
- **缓存**: Redis (限流计数器 + 会话)
- **前端**: React + shadcn/ui + Recharts + TanStack Table + Tailwind CSS
- **SDK**: TypeScript, 零依赖, Node 18+ 内置 fetch
- **MCP**: @modelcontextprotocol/sdk, Streamable HTTP 传输
- **i18n**: next-intl (中文 zh-CN + 英文 en)

## 核心设计原则

1. **服务商对开发者完全透明** — 开发者指定模型名（如 `openai/gpt-4o`），平台内部选通道。Provider / Channel 概念不暴露给开发者。
2. **Prompt 是产品不是代码** — P1 预留 templateId / templateVariables / qualityScore 字段，P3 实现模板治理。
3. **看 AI 收到了什么** — 每次调用完整快照 prompt（messages 数组结构化存储）、输出、参数、成本、性能。
4. **零硬编码** — 所有域名、包名、外部 URL 通过环境变量注入。代码中不出现任何硬编码的域名字符串。
5. **MCP 是 API 网关的客户端** — MCP 服务器不是独立服务，它是 Next.js 应用内的路由处理器，复用全部现有基础设施（认证、审计、计费、通道路由）。MCP 调用和 API 调用走同一条链路。

## 数据模型概要

- **独立实体模式**: Provider ↔ Channel ↔ Model (M:N)
- **核心表**: User, Project, ApiKey, Provider, ProviderConfig, Model, Channel, CallLog, Transaction, RechargeOrder, HealthCheck
- **余额挂在 Project 上**: 项目级资金隔离
- **CallLog 可见性分层**: 开发者看到 sellPrice，运营看到 costPrice + channelId

## 适配器架构

- **混合模式**: OpenAI 兼容引擎（基座）+ 专属 Adapter（火山引擎/硅基流动）+ 配置覆盖层（ProviderConfig 表）
- 通用引擎处理 80% 的服务商，专属 Adapter 仅处理有复杂逻辑差异的服务商
- 配置覆盖层的变更即时生效，不需要发版

## 代码规范

- 所有文件使用 TypeScript strict mode
- 使用 ES module（import/export），不使用 require
- 异步操作使用 async/await，不使用回调
- 错误处理使用自定义错误类层级（继承 Error）
- 数据库操作通过 Prisma Client，不写原生 SQL（除非是预定义的函数如 deduct_balance）
- API 路由放在 `app/api/` 目录下
- 业务逻辑放在 `lib/` 目录下，保持路由层薄
- 前端组件使用 shadcn/ui，不引入其他 UI 库
- 所有金额使用 Decimal 类型，不使用 float
- 环境变量统一在 `lib/env.ts` 中读取和校验，其他文件从此模块导入

## 目录结构

```
aigc-gateway/
├── app/                    # Next.js App Router
│   ├── api/                # API 路由
│   │   ├── v1/             # AI 调用接口 (API Key 鉴权)
│   │   ├── mcp/            # MCP Streamable HTTP 端点 (P2)
│   │   │   └── route.ts    # POST + GET + DELETE 处理
│   │   ├── auth/           # 认证接口
│   │   ├── projects/       # 项目管理 (JWT 鉴权)
│   │   ├── admin/          # 运营管理 (JWT + admin 权限)
│   │   └── webhooks/       # 支付回调
│   ├── (console)/          # 控制台页面
│   │   ├── dashboard/
│   │   ├── keys/
│   │   ├── logs/
│   │   ├── mcp-setup/      # MCP 配置帮助页 (P2)
│   │   └── ...
│   ├── (admin)/            # 运营页面
│   │   ├── providers/
│   │   ├── channels/
│   │   └── ...
│   └── (auth)/             # 登录注册页面
├── lib/                    # 业务逻辑
│   ├── engine/             # 适配器引擎
│   │   ├── openai-compat.ts
│   │   ├── adapters/
│   │   │   ├── volcengine.ts
│   │   │   └── siliconflow.ts
│   │   ├── router.ts       # 通道路由
│   │   └── sse-parser.ts   # SSE 解析器
│   ├── mcp/                # MCP 服务器 (P2)
│   │   ├── server.ts       # McpServer 实例 + Tools 注册
│   │   ├── auth.ts         # API Key 认证（复用 lib/auth）
│   │   └── tools/          # Tool 实现
│   │       ├── list-models.ts
│   │       ├── chat.ts
│   │       ├── generate-image.ts
│   │       ├── list-logs.ts
│   │       ├── get-log-detail.ts
│   │       ├── get-balance.ts
│   │       └── get-usage-summary.ts
│   ├── billing/            # 计费逻辑
│   ├── health/             # 健康检查
│   ├── auth/               # 认证逻辑
│   └── env.ts              # 环境变量
├── messages/               # i18n 翻译文件 (P2)
│   ├── en.json
│   └── zh-CN.json
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── sdk/                    # TypeScript SDK (独立包)
│   ├── src/
│   ├── package.json
│   └── tsconfig.json
├── components/             # 前端共用组件
├── .env.example
├── CLAUDE.md               # 本文件
└── docs/
    └── AIGC-Gateway-P1-Documents/  # 设计文档
```

## 设计文档

P1 设计文档在 `docs/AIGC-Gateway-P1-Documents/` 目录下：

- `AIGC-Gateway-P1-PRD.md` — 产品需求总纲
- `AIGC-Gateway-Database-Design.md` — 数据库 Schema + 索引 + 事务设计
- `AIGC-Gateway-API-Specification.md` — 全部 API 端点 + 错误码
- `AIGC-Gateway-Provider-Adapter-Spec.md` — 7家服务商适配规格 + 差异矩阵
- `AIGC-Gateway-SDK-Interface-Design.md` — SDK 类型定义 + 方法签名
- `AIGC-Gateway-Console-Interaction-Spec.md` — 18页交互规格
- `AIGC-Gateway-Payment-Integration.md` — 支付流程 + 扣费逻辑
- `AIGC-Gateway-Deployment-Operations.md` — 部署 + 监控 + 密钥管理
- `AIGC-Gateway-Development-Phases.md` — P1 分阶段开发计划

P2 设计文档在 `docs/AIGC-Gateway-P2-Documents/` 目录下：

- `AIGC-Gateway-P2-Design.md` — MCP 服务器 + 控制台国际化完整设计

## 开发阶段

**P1 已完成：** 9 个阶段 + 修复轮，70 个功能全部通过验证。

**P2 当前阶段（MCP + i18n）：** 6 个阶段。详见 `docs/AIGC-Gateway-P2-Documents/AIGC-Gateway-P2-Design.md` 第七节。

**每次开发前请确认当前阶段编号，严格按照该阶段的开发内容和验证清单执行，不要提前开发后续阶段的功能。**

## MCP 开发规范

- MCP 服务器使用 `@modelcontextprotocol/sdk`，不手写协议层
- MCP 路由在 `app/api/mcp/route.ts`，Tools 实现在 `lib/mcp/tools/`
- 每个 Tool 的 description 必须清晰描述用途、参数含义、返回内容——这是 AI 编辑器理解 Tool 的唯一途径
- AI 调用类 Tool（chat / generate_image）必须写入 CallLog（source='mcp'）并执行扣费
- 查询类 Tool（list_models / list_logs 等）不写入审计日志，不扣费
- Tool 错误使用 `isError: true` 返回（非协议错误），让 AI 编辑器能自我纠正
- MCP 认证复用 API Key（sha256 查表），不引入新的认证机制
- MCP 和 API 共享同一套限流配额（RPM / TPM）

## i18n 开发规范

- 使用 next-intl，翻译文件在 `messages/en.json` 和 `messages/zh-CN.json`
- 所有用户可见文字必须通过 `useTranslations()` 获取，不在组件中硬编码中文或英文
- 不翻译的内容：模型名、API Key、traceId、代码示例
- 翻译 key 按页面分组，如 `dashboard.title`、`logs.searchPlaceholder`

## 注意事项

- 不要在代码中硬编码任何域名、API Key、密钥
- 不要使用 `any` 类型，所有数据结构必须有明确的类型定义
- 数据库迁移文件一旦提交不可修改，只能创建新的迁移
- 前端不持有 prompt 内容，prompt 组装逻辑在后端
- 审计日志写入和扣费执行必须异步，不阻塞 API 响应
- SSE 解析器必须处理：buffer 拼接、`:` 开头的注释忽略、`[DONE]` 终止
- temperature 发送前必须按 ProviderConfig 的 min/max 自动 clamp
- 图片生成失败（status=ERROR）不扣费
- MCP Tool 返回数据要精简，不要把完整数据库记录扔给 AI 编辑器
- MCP Server Instructions 不要修改（除非产品负责人要求），它影响所有连接的 AI 编辑器行为
- i18n 翻译文件修改后必须同时更新中英文两个文件，不允许一边有 key 另一边缺失

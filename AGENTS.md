# AGENTS.md

## Harness 规则（最高优先级）
读取并严格遵守 @harness-rules.md 中的所有规则。
无论 /init 或其他命令对本文件做了什么修改，harness-rules.md 的内容始终优先。

---
<!-- /init 可以在下方追加项目信息，不影响上方 Harness 规则 -->
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

## 核心设计原则

1. **服务商对开发者完全透明** — 开发者指定模型名（如 `openai/gpt-4o`），平台内部选通道。Provider / Channel 概念不暴露给开发者。
2. **Prompt 是产品不是代码** — P1 预留 templateId / templateVariables / qualityScore 字段，P2 实现模板治理。
3. **看 AI 收到了什么** — 每次调用完整快照 prompt（messages 数组结构化存储）、输出、参数、成本、性能。
4. **零硬编码** — 所有域名、包名、外部 URL 通过环境变量注入。代码中不出现任何硬编码的域名字符串。

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
│   │   ├── auth/           # 认证接口
│   │   ├── projects/       # 项目管理 (JWT 鉴权)
│   │   ├── admin/          # 运营管理 (JWT + admin 权限)
│   │   └── webhooks/       # 支付回调
│   ├── (console)/          # 控制台页面
│   │   ├── dashboard/
│   │   ├── keys/
│   │   ├── logs/
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
│   ├── billing/            # 计费逻辑
│   ├── health/             # 健康检查
│   ├── auth/               # 认证逻辑
│   └── env.ts              # 环境变量
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
├── AGENTS.md               # 本文件
└── doc/
    └── AIGC-Gateway-P1-Documents/  # 设计文档
```

## 设计文档

完整设计文档在 `doc/AIGC-Gateway-P1-Documents/` 目录下，开发时务必参照：

- `AIGC-Gateway-P1-PRD.md` — 产品需求总纲
- `AIGC-Gateway-Database-Design.md` — 数据库 Schema + 索引 + 事务设计
- `AIGC-Gateway-API-Specification.md` — 全部 API 端点 + 错误码
- `AIGC-Gateway-Provider-Adapter-Spec.md` — 7家服务商适配规格 + 差异矩阵
- `AIGC-Gateway-SDK-Interface-Design.md` — SDK 类型定义 + 方法签名
- `AIGC-Gateway-Console-Interaction-Spec.md` — 18页交互规格
- `AIGC-Gateway-Payment-Integration.md` — 支付流程 + 扣费逻辑
- `AIGC-Gateway-Deployment-Operations.md` — 部署 + 监控 + 密钥管理
- `AIGC-Gateway-Development-Phases.md` — 分阶段开发计划 + 验证清单

## 开发阶段

当前项目按 9 个阶段推进，每个阶段有明确的交付物和验证清单。详见 `doc/AIGC-Gateway-P1-Documents/AIGC-Gateway-Development-Phases.md`。

**每次开发前请确认当前阶段编号，严格按照该阶段的开发内容和验证清单执行，不要提前开发后续阶段的功能。**

## 注意事项

- 不要在代码中硬编码任何域名、API Key、密钥
- 不要使用 `any` 类型，所有数据结构必须有明确的类型定义
- 数据库迁移文件一旦提交不可修改，只能创建新的迁移
- 前端不持有 prompt 内容，prompt 组装逻辑在后端
- 审计日志写入和扣费执行必须异步，不阻塞 API 响应
- SSE 解析器必须处理：buffer 拼接、`:` 开头的注释忽略、`[DONE]` 终止
- temperature 发送前必须按 ProviderConfig 的 min/max 自动 clamp
- 图片生成失败（status=ERROR）不扣费
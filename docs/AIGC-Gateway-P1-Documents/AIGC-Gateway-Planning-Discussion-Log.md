# AIGC Gateway — 产品规划讨论纪要

> 时间：2026年3月29日 — 3月30日
> 参与者：产品负责人 + Claude（产品架构顾问 + 开发过程支持）
> 性质：完整的从0到1产品规划讨论 + 开发全过程跟踪，覆盖从需求分析到P1全部完成

---

## 一、项目背景与起源

### 1.1 来源项目

产品负责人基于 **AI Dash 智能课程系统**的 AIGC 链路工程化经验（记录在 ADR-004 中），发现了 AIGC 系统的核心挑战：

> AIGC 系统的质量问题是隐性的——代码不报错，AI 也返回了结果，但生成质量不符合预期。传统的单元测试和集成测试无法捕获这类问题。

ADR-004 中记录的典型问题包括：
- AI 生成的图片在部署后丢失（运行时数据放在了部署目录内）
- 图片修改意见不断累积污染 prompt
- 多条图片生成链路的 prompt 组装逻辑不一致
- DB 模板存在时基线不注入
- 前端默认提示词绕过后端模板系统
- 种子数据 upsert 覆盖管理员修改

### 1.2 产品动机

产品负责人在多个项目中重复建设了审计、模板治理、成本管理等能力，发现：
- 每个项目独立实现耗时且质量参差不齐
- 不同服务商 API 使用方式不同，重复开发经常出错
- 各项目 prompt 管理混乱
- 成本不可见、无法归因
- 出了质量问题难以排查

**核心决策：** 将这套能力抽离成独立运营的 AIGC 基础设施中台。

### 1.3 输入材料

产品负责人提供了以下文档作为讨论基础：
- ADR-004：AIGC Prompt 工程化经验总结
- ADR-005 至 ADR-022：18 份服务商集成指南（火山引擎、智谱、DeepSeek、Moonshot、百度文心、腾讯混元、MiniMax、OpenAI、Gemini、Claude、OpenRouter、硅基流动、讯飞、阶跃星辰、xAI、Mistral、Groq 等）

---

## 二、核心设计决策记录

以下按讨论顺序记录所有确认的设计决策，包含决策背景和理由。

### 2.1 产品定位

| 决策项 | 结论 | 讨论要点 |
|--------|------|---------|
| 产品定位 | AIGC 基础设施中台 | 业务应用专注于"用AI做什么"，本系统负责"AI怎么调、怎么管、怎么审" |
| 核心价值 | AIGC 全链路质量可观测 + 模板治理 | P2重点实现模板治理，P1预留基建（templateId/templateVariables/qualityScore字段） |
| 商业模式 | 转售（统一采购），预充值计费 | 对接支付宝/微信支付 |
| 部署形态 | 云托管 SaaS | 平台运营方托管，开发者通过 API 接入 |
| 目标用户 | 中小开发者 | 影响了整个产品设计：接入门槛要低、上手要快、文档要清晰 |
| 数据隔离 | 项目级隔离 | 各项目数据完全独立 |

### 2.2 服务商与模型设计

| 决策项 | 结论 | 讨论要点 |
|--------|------|---------|
| 服务商透明 | 开发者指定模型，平台内部选通道 | Provider/Channel 概念不暴露给开发者 |
| 模型命名 | 统一格式 `provider/model` | 平台内部映射到各服务商真实模型ID |
| 数据模型 | 独立实体模式 Provider ↔ Channel ↔ Model (M:N) | 产品负责人明确有"同模型多供应商"需求，因此选择独立实体而非子实体模式 |
| 通道路由 | 开发者指定模型，平台按 priority 自动选通道 | P1手动切换（控制台调priority/status），P2自动failover |

**关于模型与服务商关系的讨论：**

最初考虑两种方案：
1. **子实体模式**（模型挂在服务商下，一对多）：简单直接，但不支持同模型多供应商
2. **独立实体模式**（Provider ↔ Channel ↔ Model，多对多）：支持同模型多通道、多定价

产品负责人确认已有"同一个模型需要走不同供应商"的需求，因此直接采用独立实体模式，引入 Channel（通道）作为桥接实体。

**关于开发者指定模型还是通道的讨论：**

最初产品负责人倾向"用户指定通道（精确控制）"。经过讨论后确认改为"用户指定模型，平台选通道"，理由是：
- 服务商对开发者透明是核心设计原则
- 中小开发者不需要了解底层通道细节
- 平台可以在不影响开发者代码的情况下切换通道

### 2.3 适配器架构

| 决策项 | 结论 | 讨论要点 |
|--------|------|---------|
| 适配器架构 | 混合模式 | OpenAI兼容引擎(基座) + 专属Adapter(火山/硅基) + 配置覆盖层(DB，即时生效) |
| 首批服务商 | 7家 | OpenAI、Claude、DeepSeek、智谱AI、火山引擎、硅基流动、OpenRouter |
| 第二批 | 7家 | Gemini、Moonshot、阶跃星辰、xAI、Mistral、Groq，上线后2-3周追加 |
| 第三批 | 5家 | 百炼、百度文心、腾讯混元、MiniMax、讯飞星火，按需接入 |

**适配器架构的三层设计：**
1. **配置覆盖层（DB）**：端点路径、参数约束、鉴权格式、能力声明。运营可改，分钟级生效。
2. **适配器代码层**：复杂逻辑差异（火山引擎图片走chat、硅基流动响应格式不同）。小时级变更。
3. **OpenAI兼容引擎（基座）**：请求构建、SSE解析、usage提取、错误映射。一次性实现。

只有火山引擎和硅基流动需要专属Adapter，其余5家全走通用引擎。

### 2.4 API 网关与 SDK

| 决策项 | 结论 | 讨论要点 |
|--------|------|---------|
| API格式 | 兼容OpenAI格式 + 扩展字段 | 降低迁移成本，开发者改一个baseUrl就能跑通 |
| 流式响应 | SSE | 与OpenAI/Claude/主流大模型API一致 |
| SDK | P1出TypeScript SDK | 流式是常见场景，SDK封装SSE解析价值很大 |
| 前端接入 | P1仅方案A（后端代理） | 临时令牌放P2 |

**关于SDK的讨论过程：**

产品负责人对是否出SDK有疑虑，经过详细对比讨论：
- 非流式调用：有无SDK差距很小
- **流式响应解析：差距最大**——SSE的逐行解析、buffer拼接、[DONE]信号处理，约40行代码且边界情况多
- 错误处理与重试：差距中等

最终因"流式是常见场景"确认P1出SDK。控制在500行以内，只封装三件事：鉴权、SSE解析、traceId透传。

### 2.5 审计日志

| 决策项 | 结论 | 讨论要点 |
|--------|------|---------|
| 审计内容 | 完整prompt快照 + 输出 + usage + 成本 + 性能 | prompt用结构化messages数组存储，非扁平字符串 |
| 全文搜索 | PG tsvector + GIN | P1就需要prompt全文搜索 |
| 可见性分层 | 开发者看sellPrice，运营看costPrice+channelId | 双重隔离 |
| 保留策略 | 永久保留 | P2做冷热分离 |

### 2.6 健康检查

| 决策项 | 结论 | 讨论要点 |
|--------|------|---------|
| 检查策略 | P1就做主动探测 | 不等P2 |
| 分级频率 | 活跃10min / 备用30min / 冷门2h | 按通道活跃度分级 |
| 三级验证 | 连通性 → 格式 → 响应质量 | Level 3用固定prompt验证AI返回是否合理 |
| 异常响应 | 连续3次失败自动disabled + 自动恢复 | 降级后降频检查，恢复后自动重启 |

### 2.7 计费与支付

| 决策项 | 结论 | 讨论要点 |
|--------|------|---------|
| 计费模式 | 预充值 | 先充钱后用，余额不足返回402 |
| 双层定价 | Channel上设costPrice + sellPrice | 成本与售价分离 |
| 扣费时机 | 调用完成后异步扣费 | 不预扣，避免余额"虚占"。极端情况微量超扣可接受 |
| 支付渠道 | 支付宝 + 微信支付 | 扫码支付 |

### 2.8 控制台与前端

| 决策项 | 结论 | 讨论要点 |
|--------|------|---------|
| 控制台 | 一套系统按角色区分(admin/developer) | 开发者自助注册 |
| 前端技术栈 | Next.js + shadcn/ui + Recharts + TanStack Table + Tailwind CSS | 经过方案A/B/C对比后确认 |
| API Key粒度 | 一个项目可创建多个Key | 区分环境/用途 |
| 账号与项目 | 一个账号可创建多个项目 | User → Project (1:N) → ApiKey (1:N) |

**前端技术栈选型对比：**

| 方案 | 组合 | 结论 |
|------|------|------|
| A（推荐） | Next.js + shadcn/ui + Recharts | 均衡性最好，拥有源码可深度定制 |
| B | Next.js + Ant Design + AntV | 组件最全但风格偏重，定制需override |
| C | Next.js + Tremor + shadcn/ui | Dashboard能力最强但通用组件不够 |

选择方案A的理由：控制台不只是数据看板，还有大量管理类页面需要表单、表格、弹窗等通用组件，shadcn/ui在这方面最均衡。

### 2.9 P2 基建预留

| 预留项 | 说明 | 工作量 |
|--------|------|--------|
| CallLog.templateId | P2模板效果追踪 | 字段定义 |
| CallLog.templateVariables | P2变量溯源 | 字段定义 |
| CallLog.qualityScore | P2质量评分+ROI分析 | 字段定义 |
| SDK templateId参数 | P2无缝衔接 | 接口预定义 |

预留工作量约半天，但让P2的模板治理和质量诊断能无缝衔接。

### 2.10 工程规范

| 决策项 | 结论 | 讨论要点 |
|--------|------|---------|
| ORM | Prisma | 团队在AI Dash项目中有Prisma经验 |
| 零硬编码 | 所有域名/包名通过环境变量占位符 | 文档中使用 https://aigc.guangai.ai/v1 / https://cdn.aigc.guangai.ai / https://aigc.guangai.ai / @guangai/aigc-sdk |
| 文档路径 | docs/AIGC-Gateway-P1-Documents/ | 所有设计文档统一存放 |

---

## 三、前端视觉方向确认

### 3.1 原型迭代过程

1. **第一版 Visualizer Mockup**：使用纯CSS构建的Dashboard静态预览，展示了整体布局方向（侧边导航+数据卡片+调用列表）
2. **React JSX原型（两版）**：使用Recharts图表的交互原型，但在环境中渲染失败
3. **最终HTML原型**：纯HTML + Chart.js构建，成功渲染。包含4个可导航页面（Dashboard/审计日志/模型列表/Quick start），用户确认了这个视觉方向

### 3.2 确认的视觉风格

- 克制的、数据密度适中的控制台风格
- 紫色为品牌主色（#6D5DD3），辅以语义色（绿色=成功、红色=错误、琥珀色=警告）
- 侧边栏固定导航，分四个区域（项目管理、可观测、计费、帮助）
- 数据优先：开发者登录后第一眼看到调用量、成本、延迟、成功率

---

## 四、最终产出物清单

### 4.1 设计文档（12个文件）

| # | 文件 | 内容 |
|---|------|------|
| 1 | CLAUDE.md | Claude Code项目规则文件 |
| 2 | AIGC-Gateway-P1-PRD.docx | PRD Word版 |
| 3 | AIGC-Gateway-P1-PRD.md | PRD Markdown版 |
| 4 | AIGC-Gateway-Database-Design.md | 12张表Prisma Schema + 原生SQL + 索引策略 + 容量规划 |
| 5 | AIGC-Gateway-API-Specification.md | AI调用2端点 + 控制台API 22端点 + 运营API 14端点 + 认证3端点 + 错误码14个 + 限流规则 |
| 6 | AIGC-Gateway-Provider-Adapter-Spec.md | 7家服务商逐家规格 + 差异矩阵 + 配置覆盖层 + Adapter伪代码 + 健康检查探针适配 |
| 7 | AIGC-Gateway-SDK-Interface-Design.md | 30+类型定义 + Gateway类方法签名 + 10个错误类 + 重试策略 + SSE解析规格 |
| 8 | AIGC-Gateway-Console-Interaction-Spec.md | 18页功能详情 + 权限矩阵 + 路由设计 + 响应式适配 |
| 9 | AIGC-Gateway-Payment-Integration.md | 支付流程 + 订单状态机 + 扣费逻辑 + 对账策略 + 退款规则 |
| 10 | AIGC-Gateway-Deployment-Operations.md | 基础设施 + 代理架构 + CI/CD + 监控告警 + 密钥管理 + 上线检查清单 |
| 11 | AIGC-Gateway-Development-Phases.md | 9阶段开发计划 + 每阶段验证清单 |
| 12 | AIGC-Gateway-Claude-Code-Prompts.md | 9个阶段的Claude Code启动提示词 |

### 4.2 前端原型

- HTML交互原型：aigc-gateway-console.html（纯HTML+Chart.js，含Dashboard/审计日志/模型列表/Quick start）

### 4.3 交付形式

全部文档打包为 AIGC-Gateway-P1-Documents.zip，用于：
1. CLAUDE.md 放项目根目录（Claude Code自动读取）
2. 设计文档放 docs/AIGC-Gateway-P1-Documents/ 目录
3. 每个阶段开始时复制对应提示词发送给Claude Code

---

## 五、开发阶段计划

9个阶段，预计25-35天（约6-8周），每个阶段完成后由产品负责人验证。

| 阶段 | 内容 | 工期 | 依赖 |
|------|------|------|------|
| 1 | 项目骨架 + 数据库 | 2-3天 | 无 |
| 2 | 适配器引擎 + 服务商对接 | 4-5天 | 阶段1 |
| 3 | API 网关核心端点 | 3-4天 | 阶段2 |
| 4 | 健康检查系统 | 2天 | 阶段2 |
| 5 | TypeScript SDK | 2-3天 | 阶段3 |
| 6 | 认证 + 计费 + 支付 | 4-5天 | 阶段1,3 |
| 7 | 运营控制台 | 3-4天 | 阶段4,6 |
| 8 | 开发者控制台 | 3-4天 | 阶段6,7 |
| 9 | 集成测试 + 文档 + 上线 | 2-3天 | 全部 |

阶段划分的核心逻辑：从底层往上逐层搭建，每一层都能独立验证。

---

## 六、硬编码风险检查

讨论过程中，产品负责人注意到文档中硬编码了 `api.aigc-gateway.com` 等域名（域名尚未注册），提出了硬编码风险问题。

### 6.1 发现的问题

| 类别 | 出现次数 | 风险等级 |
|------|---------|---------|
| API域名 `api.aigc-gateway.com` | 9处 | 高 |
| CDN域名 `cdn.aigc-gateway.com` | 1处 | 高 |
| 官网域名 `aigc-gateway.com` | 1处 | 中 |
| npm包名 `@aigc-gateway/sdk` | 10处 | 中 |

### 6.2 修复方案

最初全部使用占位符，域名确定后替换为真实值：

| 配置项 | 值 | 环境变量 |
|--------|-----|---------|
| API网关 | `https://aigc.guangai.ai/v1` | `AIGC_GATEWAY_BASE_URL` |
| CDN | `https://cdn.aigc.guangai.ai` | `AIGC_GATEWAY_CDN_URL` |
| 控制台/官网 | `https://aigc.guangai.ai` | `AIGC_GATEWAY_SITE_URL` |
| npm包名 | `@guangai/aigc-sdk` | — |

所有设计文档已替换为真实域名和包名。

---

## 七、开发工具链决策

### 7.1 使用 Claude Code 开发

产品负责人确认使用 Claude Code 进行开发，通过两层机制传递上下文：
1. **CLAUDE.md**（项目规则）：放项目根目录，自动读取
2. **阶段启动提示词**：每次启动时手动发送

### 7.2 Git 版本管理

项目已在开发过程中初始化 Git 并关联 GitHub（private仓库）。后续每个阶段完成后做一次commit。

---

## 八、P1 开发执行记录

### 8.1 开发工具与流程

- **开发工具**：Claude Code，通过 CLAUDE.md 项目规则 + 阶段启动提示词传递上下文
- **版本管理**：Git + GitHub（private仓库），开发过程中初始化并关联
- **验证方式**：每个阶段完成后由产品负责人验证，通过后进入下一阶段

### 8.2 各阶段完成情况

| 阶段 | 内容 | 功能数 | 状态 | 备注 |
|------|------|--------|------|------|
| 1 | 项目骨架 + 数据库 | F001-F044 (部分) | 已完成 | Next.js + Prisma 12表 + 种子数据 |
| 2 | 适配器引擎 + 服务商对接 | — | 已完成 | 通用引擎 + 火山/硅基Adapter + 通道路由 |
| 3 | API 网关核心端点 | — | 已完成 | chat/images/models + 中间件管道 + 异步审计扣费 |
| 4 | 健康检查系统 | — | 已完成 | 三级验证 + 分级频率 + 自动降级恢复 |
| 5 | TypeScript SDK | — | 已完成 | Gateway类 + SSE解析 + 错误类型 + 重试 |
| 6 | 认证 + 计费 + 支付 | F001-F044 | 已完成 | 注册登录 + 项目/Key管理 + 支付宝/微信对接 |
| 7 | 运营控制台 | F045-F054 | 已完成 | 8个Admin页面全部完成 |
| 8 | 开发者控制台 | F055-F063 | 已完成 | 9个开发者页面全部完成，含CRITICAL安全修复 |
| 9 | 集成测试 + 文档 + 上线 | F064-F070 | 已完成 | 端到端测试 + 异常测试 + Docker + 上线清单 |

**总计：70个功能，全部通过验证。**

### 8.3 阶段9交付物明细

| 功能ID | 内容 | 说明 |
|--------|------|------|
| F064 | 端到端测试脚本 | 注册→登录→创建项目→生成Key→充值→支付回调→文本/流式/图片调用→余额扣减→交易记录→审计日志→全文搜索 |
| F065 | 异常场景测试脚本 | 余额不足(402)、吊销Key(401)、不存在模型(404)、10并发扣费无超扣 |
| F066 | 7家服务商全量验证脚本 | 遍历所有ACTIVE通道，文本+图片各发一次，输出PASS/FAIL/latency |
| F067 | SDK README.md | 安装、初始化、代码示例、错误处理、配置项、重试策略 |
| F068 | API 文档页面 | /docs路由，覆盖认证、端点、格式、错误码、限流 |
| F069 | Docker部署配置 | Dockerfile + docker-compose.yml (app + PostgreSQL + Redis) |
| F070 | 种子修复 + 上线清单 | 管理员密码bcrypt修复 + LAUNCH_CHECKLIST.md (5类检查项) |

### 8.4 开发过程中发现的问题与修复

| 问题 | 阶段 | 修复 |
|------|------|------|
| Claude Code使用"精简版shadcn风格"而非真正的shadcn/ui | 阶段7-8 | 指导使用 `npx shadcn@latest add` 安装官方组件 |
| 种子数据管理员密码未做bcrypt哈希 | 阶段9 | F070修复，确保可正常登录 |
| 阶段8存在CRITICAL安全问题 | 阶段8 | 验证时发现并修复，验证通过 |

### 8.5 P1 修复轮（阶段9之后）

9阶段全部完成后，安排了一轮专项修复，解决已知Bug和UI视觉问题。

**触发原因：**
1. Known Issues 中记录了2个UI Bug（空状态缺按钮、4页面无项目时空白）
2. 产品负责人对比HTML原型与实际实现，发现视觉差距较大——根因是Claude Code使用了手写"精简版shadcn风格"组件而非通过CLI安装的官方组件，且缺少品牌色和语义色注入

**修复轮任务清单（9个FIX）：**

| 编号 | 类别 | 内容 | 状态 |
|------|------|------|------|
| FIX-001 | UI基建 | 安装真正的 shadcn/ui 组件，替换手写精简组件 | 已完成 |
| FIX-002 | UI基建 | 注入品牌色(#6D5DD3)和语义色到 Tailwind 主题 | 已完成 |
| FIX-003 | UI基建 | 侧边栏视觉升级（品牌Logo + 选中态 + 分组标签） | 已完成 |
| FIX-004 | Bug | 空状态添加操作按钮和引导图标 | 已完成 |
| FIX-005 | Bug | Logs/Usage/Balance/Keys 无项目时空白→显示引导提示 | 已完成 |
| FIX-006 | 视觉 | Badge 组件样式统一（语义色区分） | 已完成 |
| FIX-007 | 视觉 | Dashboard 图表和指标卡片对齐原型 | 已完成 |
| FIX-008 | 视觉 | 表格全局样式优化（间距/字体/hover） | 已完成 |
| FIX-009 | 视觉 | 审计日志详情面板样式对齐 | 已完成 |

**修复轮总结：**
- UI基础设施从手写组件升级为官方 shadcn/ui，解决了组件质量和无障碍支持问题
- 品牌色和语义色注入后，界面从默认黑白灰转变为有品牌识别度的控制台风格
- 2个功能Bug修复，新用户不再看到空白页面
- 全部表格、Badge、卡片、图表的视觉风格统一对齐到确认的设计方向

---

## 九、关键讨论中的分歧与解决

### 9.1 模型指定方式

- **初始倾向**：用户指定通道（channelId），精确控制走哪条通道
- **最终决策**：用户指定模型（modelName），平台选通道
- **转变原因**：服务商对开发者透明是核心原则；中小开发者不需要了解底层通道细节

### 9.2 P1是否出SDK

- **犹豫点**：SDK维护成本、用户群不一定用TypeScript
- **最终决策**：P1出TypeScript SDK
- **决定因素**：流式是常见场景，SSE解析的封装价值最大

### 9.3 前端技术栈

- **候选方案**：shadcn/ui vs Ant Design vs Tremor
- **最终决策**：shadcn/ui + Recharts
- **决定因素**：控制台不只是看板，还有大量管理类页面，shadcn/ui的通用组件+定制自由度最均衡

### 9.4 健康检查时机

- **原始计划**：P2实现
- **最终决策**：P1就做
- **原因**：主动探测是服务可用性的基本保障，不应推迟

---

## 十、P2 方向讨论（题外话，不影响P1）

讨论中产品负责人提出了关于 MCP 服务接入的探索性讨论：

- **想法**：通过MCP协议为开发者提供另一种接入方式，让AI编辑器（Claude Code、Cursor等）直接调用平台能力
- **结论**：可行，MCP服务器作为API网关的一个客户端，底层走同一条链路，审计/计费/模板全部生效
- **定位**：锦上添花的接入通道，不替代API+SDK主线。适合IDE内的交互式场景（调试prompt、查看日志）
- **时间**：P2或更后面，P1先把主线跑通

---

## 十一、后续待办事项

| 事项 | 状态 | 说明 |
|------|------|------|
| 域名注册 | 已完成 | aigc.guangai.ai，子域名：api / cdn |
| npm包名注册 | 已完成 | @guangai/aigc-sdk，组织 @guangai 已创建 |
| 云服务器采购 | 已完成 | 产品负责人已有服务器 |
| 文档占位符替换 | 已完成 | 全部文档已替换为真实域名和包名 |
| SDK 发布到 npm | 已完成 | @guangai/aigc-sdk@0.1.0 已上线，https://www.npmjs.com/package/@guangai/aigc-sdk |
| 服务商API Key采购 | 待办 | 7家首批服务商的API Key |
| 支付宝/微信支付商户开通 | 待办 | 需要企业资质 |
| 代理节点部署 | 待办 | 香港/新加坡，用于访问海外服务商 |
| 生产环境部署 | 待办 | 按 LAUNCH_CHECKLIST.md 逐项执行 |
| P2 规划启动 | 待办 | 模板治理 + 质量诊断 + MCP接入 |

---

## 十二、项目完整产出物清单

### 12.1 设计文档（12个文件）

| # | 文件 | 内容 |
|---|------|------|
| 1 | CLAUDE.md | Claude Code项目规则文件 |
| 2 | AIGC-Gateway-P1-PRD.docx | PRD Word版 |
| 3 | AIGC-Gateway-P1-PRD.md | PRD Markdown版 |
| 4 | AIGC-Gateway-Database-Design.md | 12张表Prisma Schema + 原生SQL + 索引策略 + 容量规划 |
| 5 | AIGC-Gateway-API-Specification.md | AI调用2端点 + 控制台API 22端点 + 运营API 14端点 + 认证3端点 + 错误码14个 + 限流规则 |
| 6 | AIGC-Gateway-Provider-Adapter-Spec.md | 7家服务商逐家规格 + 差异矩阵 + 配置覆盖层 + Adapter伪代码 + 健康检查探针适配 |
| 7 | AIGC-Gateway-SDK-Interface-Design.md | 30+类型定义 + Gateway类方法签名 + 10个错误类 + 重试策略 + SSE解析规格 |
| 8 | AIGC-Gateway-Console-Interaction-Spec.md | 18页功能详情 + 权限矩阵 + 路由设计 + 响应式适配 |
| 9 | AIGC-Gateway-Payment-Integration.md | 支付流程 + 订单状态机 + 扣费逻辑 + 对账策略 + 退款规则 |
| 10 | AIGC-Gateway-Deployment-Operations.md | 基础设施 + 代理架构 + CI/CD + 监控告警 + 密钥管理 + 上线检查清单 |
| 11 | AIGC-Gateway-Development-Phases.md | 9阶段开发计划 + 每阶段验证清单 |
| 12 | AIGC-Gateway-Claude-Code-Prompts.md | 9个阶段的Claude Code启动提示词 |

### 12.2 代码交付物

| 类别 | 内容 |
|------|------|
| 后端 | Next.js API Routes (v1 + console + admin + auth + webhooks) |
| 前端 | 运营控制台 8页 + 开发者控制台 9页 + 注册登录 + 账号设置 |
| 数据库 | Prisma Schema 12表 + 迁移文件 + 原生SQL函数 + 种子数据 |
| SDK | TypeScript SDK (Gateway类 + SSE解析 + 错误类型 + 重试) |
| 测试 | 端到端测试 + 异常场景测试 + 7家服务商全量验证 |
| 部署 | Dockerfile + docker-compose.yml + LAUNCH_CHECKLIST.md |
| 文档 | API文档页面(/docs) + SDK README.md |

### 12.3 前端原型

- HTML交互原型：aigc-gateway-console.html（纯HTML+Chart.js，含Dashboard/审计日志/模型列表/Quick start）

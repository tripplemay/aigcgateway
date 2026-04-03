# 前端重构手工测试用例

## 测试目标

基于 [frontend-redesign-plan.md](/Users/yixingzhou/project/aigcgateway/docs/frontend-redesign-plan.md) 与 `design-draft/` 对应原型文件，整理本轮前端重构的手工验收 / 回归测试用例。

本文件仅定义待执行用例，不代表已执行。

## 测试范围

- 1:1 还原设计稿样式
- 原有功能在新皮肤下保持可用
- 新增页面 `/keys/[keyId]` 正常可用
- 路由切换、空态、错误态、筛选、分页、弹窗、保存流程正确
- 中英文切换、响应式、骨架屏、页面级 smoke

## 源文档

- [frontend-redesign-plan.md](/Users/yixingzhou/project/aigcgateway/docs/frontend-redesign-plan.md)
- `design-draft/Balance (Full Redesign)/code.html`
- `design-draft/Recharge Balance Modal/code.html`
- `design-draft/Usage Analytics (Strict Redesign)/code.html`
- `design-draft/Models (Full Redesign)/code.html`
- `design-draft/Admin - Providers (Full Redesign)/code.html`
- `design-draft/Admin - Health (Full Redesign)/code.html`
- `design-draft/Admin - Logs (Full Redesign)/code.html`
- `design-draft/Admin - Usage (Full Redesign)/code.html`
- `design-draft/Admin - Users (Full Redesign)/code.html`
- `design-draft/Quick Start (Full Redesign)/code.html`
- `design-draft/MCP Setup (Full Redesign)/code.html`
- `design-draft/Settings (Full Redesign)/code.html`
- `design-draft/API Key Settings - AIGC Gateway/code.html`
- `design-draft/Admin - User Detail/code.html`
- `design-draft/Login (Terminal Simulation)/code.html`

## 测试环境

- 环境类型：待定，默认本地测试环境
- 目标地址：`http://localhost:3099`
- 测试角色：
  - 未登录用户
  - 普通已登录用户
  - 管理员

## 前置条件

- 普通用户至少有一个项目，并准备：
  - 余额 / 阈值 / 交易记录
  - usage / logs / model 数据
  - 至少两条 API Key
- 管理员环境存在 provider / health / logs / users / usage 数据
- 语言切换功能可用
- Chrome MCP 或等效浏览器可观察页面与控制台

## 结构化测试用例

### A. 通用页面基线

| 用例 ID | 标题 | 前置条件 | 步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|---|
| UI-RD-001 | 重构页面首屏可正常加载 | 已登录或对应角色具备访问权限 | 1. 分别访问本轮涉及页面 2. 观察首屏 | 页面可见，无白屏，无未处理报错 | P0 |
| UI-RD-002 | 中英文切换无 i18n key 泄漏 | 任一重构页面已打开 | 1. 点击 `CN/EN` 切换 2. 检查标题、按钮、表头 | 文案切换正常，不出现翻译 key | P0 |
| UI-RD-003 | Loading 骨架屏与空态可正常显示 | 可构造加载中或空数据 | 1. 打开页面 2. 切换到空项目/空列表场景 | 骨架屏、空态与设计稿风格一致 | P1 |
| UI-RD-004 | 1280px / 1920px 下布局稳定 | 可调整浏览器宽度 | 1. 切换 1280px 2. 切换 1920px | 关键区域不重叠、不溢出、Bento/Grid 正常 | P1 |

### B. Phase 1 回归

| 用例 ID | 标题 | 前置条件 | 步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|---|
| UI-RD-101 | `/dashboard` 4 张统计卡数据正确 | 已登录且有项目 usage 数据 | 1. 打开 `/dashboard` 2. 检查 Total Calls / Cost / Latency / Success Rate | 4 卡数值与旧版数据一致 | P0 |
| UI-RD-102 | `/dashboard` 余额卡与低余额 Banner 正常 | 项目存在余额和阈值数据 | 1. 检查余额卡 2. 若低余额则检查 Banner 3. 点击 Recharge | 余额显示正确，Recharge 跳到 `/balance` | P0 |
| UI-RD-103 | `/dashboard` 图表区正常渲染 | 存在 14 天 usage 数据 | 1. 检查柱状图、饼图、24h 分布、Daily Spend | 图表有数据，无错位，无空白区域 | P1 |
| UI-RD-104 | `/dashboard` Recent Calls 表工作正常 | 存在最近调用数据 | 1. 检查 5 条数据 2. 点击 View All | 跳转 `/logs`，状态徽章颜色正确 | P1 |
| UI-RD-105 | `/logs` Filter Chips / 搜索 / 日期筛选正常 | 已登录且有日志数据 | 1. 切换状态 Chip 2. 输入搜索词 3. 调整日期范围 | 列表刷新正确，防抖与筛选行为正常 | P0 |
| UI-RD-106 | `/logs` 行内展开详情正常 | 列表中存在可展开行 | 1. 点击一行展开 2. 再次点击收起 | 详情面板展开/收起正常，Prompt/Response/JSON 参数显示正确 | P0 |
| UI-RD-107 | `/logs/[traceId]` 新页面可直接访问 | 存在有效 traceId | 1. 直接打开详情页 2. 点击 Breadcrumb 返回 | 详情页结构符合原型，返回 `/logs` 正常 | P0 |
| UI-RD-108 | `/logs/[traceId]` 缺失数据占位正确 | 准备不存在的 traceId 或缺字段记录 | 1. 打开不存在 traceId 2. 打开无 Prompt/Response 的记录 | 显示 `Trace not found` 或明确占位文案 | P1 |

### C. Phase 2 高频页面

| 用例 ID | 标题 | 前置条件 | 步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|---|
| UI-RD-201 | `/balance` Bento 余额卡与阈值卡符合设计稿 | 已登录；项目有余额和阈值 | 1. 打开 `/balance` 2. 检查余额卡、上次充值信息、阈值卡 | 样式接近原型，数据展示正确 | P0 |
| UI-RD-202 | Recharge Modal 快捷金额与自定义金额可用 | `/balance` 已打开 | 1. 打开充值弹窗 2. 点 `$10/$50/$100/$500` 3. 输入自定义金额 | 快捷金额会回填，非法值有校验 | P0 |
| UI-RD-203 | Recharge Modal 支付方式切换与提交正常 | Recharge Modal 已打开 | 1. 切换支付宝/微信 2. 提交 | 创建订单成功或跳转支付链接，样式与设计稿一致 | P0 |
| UI-RD-204 | `/balance` 交易记录表分页与金额颜色正常 | 项目有多条交易记录 | 1. 切页 2. 观察正负金额颜色 3. 检查 Type 徽章 | 分页正常；正数绿、负数灰 | P1 |
| UI-RD-205 | `/usage` 时间段 Chip 与统计卡正常 | 已登录；项目有 usage 数据 | 1. 打开 `/usage` 2. 切换 today / 7d / 30d | 数据刷新，4 张统计卡更新，环比指标可见 | P0 |
| UI-RD-206 | `/usage` 三类图表与排名表正常 | `/usage` 已打开 | 1. 检查面积图、柱状图、饼图 2. 检查 Model Ranking 表 | 图表正常渲染，表格数据正确 | P1 |
| UI-RD-207 | `/models` 统计卡与筛选控件符合设计稿 | 已登录 | 1. 打开 `/models` 2. 检查 Total Models、Avg Latency | Total Models 正确；Avg Latency 显示 `—` | P0 |
| UI-RD-208 | `/models` 搜索、Modality、Provider 分组行为正常 | `/models` 已打开 | 1. 搜索 2. 切换 All/Text/Image 3. 展开/收起 Provider 4. 点 Show All | 客户端过滤正确，分组交互可用 | P0 |

### D. Phase 3 管理员页面

| 用例 ID | 标题 | 前置条件 | 步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|---|
| UI-RD-301 | `/admin/providers` 表格和主操作符合设计稿 | 管理员已登录 | 1. 打开页面 2. 检查表格、Add、Edit、Config、Status | 列表完整，主要按钮可见并可点击 | P0 |
| UI-RD-302 | `/admin/providers` 新建/编辑/Config 弹窗可用 | 页面已打开 | 1. 打开 3 类弹窗 2. 检查预填、保存、关闭 | 弹窗结构符合原型，保存行为正常 | P0 |
| UI-RD-303 | `/admin/health` Summary Cards 与健康卡片网格正常 | 管理员已登录；存在 channel 数据 | 1. 打开页面 2. 检查 Summary Cards 3. 点 Check | 计数正确，Check 有 loading 与结果更新 | P0 |
| UI-RD-304 | `/admin/logs` 搜索、状态筛选、分页正常 | 管理员已登录；有日志数据 | 1. 输入关键词 2. 切换状态 3. 切页 | 结果正确，样式与用户侧 Logs 一致 | P0 |
| UI-RD-305 | `/admin/usage` 时间段、统计卡、图表、Provider 表正常 | 管理员已登录；有 usage 数据 | 1. 打开页面 2. 切换时间段 3. 检查图表与表格 | 数据更新正常，布局符合设计稿 | P1 |
| UI-RD-306 | `/admin/users` 列表和 Detail 入口正常 | 管理员已登录；有用户数据 | 1. 打开页面 2. 检查表格 3. 点击 Detail | 列表与跳转都正常 | P0 |

### E. Phase 4 辅助页面

| 用例 ID | 标题 | 前置条件 | 步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|---|
| UI-RD-401 | `/quickstart` 4 个步骤卡片与代码块正常 | 已登录 | 1. 打开页面 2. 检查步骤卡片 3. 点击复制 | 卡片编号、代码块、复制反馈正常 | P1 |
| UI-RD-402 | `/mcp-setup` 三步骤布局与 API Key 下拉正常 | 已登录；项目下有多条 Key | 1. 打开页面 2. 选择 API Key | 步骤布局符合设计稿，Key 下拉可用 | P0 |
| UI-RD-403 | `/mcp-setup` Tab 切换与 Config 复制正常 | 页面已打开 | 1. 切换 Claude / Cursor / Generic 2. 复制配置 | Tab 切换正常，代码块内容更新，复制成功 | P0 |
| UI-RD-404 | `/settings` Profile 卡可编辑保存 | 已登录 | 1. 检查 Email 只读 2. 修改 Name 3. 保存 | 保存成功，刷新后 name 保留 | P0 |
| UI-RD-405 | `/settings` 密码修改与错误提示正常 | 已登录；知道当前密码 | 1. 输入错误旧密码 2. 提交 3. 输入合法密码再提交 | 错误提示明确；成功后返回成功反馈 | P0 |
| UI-RD-406 | `/settings` Sign Out 正常 | 已登录 | 1. 点击 Sign Out | 退出成功并回到登录入口 | P1 |

### F. Phase 5 新增页 / 特殊页

| 用例 ID | 标题 | 前置条件 | 步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|---|
| UI-RD-501 | `/keys/[keyId]` 页面骨架与详情数据正常 | 已登录；存在 ACTIVE Key | 1. 直接打开 `/keys/{keyId}` | 页面结构接近原型，字段正确加载 | P0 |
| UI-RD-502 | `/keys/[keyId]` 可编辑字段全部可操作 | `/keys/[keyId]` 已加载 | 1. 编辑 `name` `description` 2. 调整权限 3. 设置过期、RPM、白名单 | 表单控件可用，值映射正确 | P0 |
| UI-RD-503 | `/keys/[keyId]` 保存后持久化并可返回列表 | `/keys/[keyId]` 已加载 | 1. 保存修改 2. 刷新 3. 返回 `/keys` | 新值持久化；返回列表可见更新结果 | P0 |
| UI-RD-504 | `/admin/users/[id]` 用户详情页符合设计稿 | 管理员已登录；存在目标用户 | 1. 打开用户详情页 | Profile、项目列表、余额信息正确 | P1 |
| UI-RD-505 | `/admin/users/[id]` 停用/重置类按钮为 disabled | 用户详情页已打开 | 1. 检查相关按钮状态 | 若 API 不支持，这些按钮为 disabled 而非可误点 | P1 |
| UI-RD-506 | `/login` 终端动画与登录表单共存且正常 | 未登录；存在合法账号 | 1. 打开 `/login` 2. 观察 Terminal 动画 3. 提交登录 | 动画存在；登录成功跳转；错误提示正常 | P0 |

## 验收关注点

- 是否真正做到“只换皮，不改功能”
- 是否按 `design-draft` 的 v1 原型 1:1 还原结构和视觉层次
- 是否出现旧功能入口消失、按钮变 disabled、保存无响应、筛选失效
- `/keys/[keyId]` 作为新增页面是否在样式和功能两侧都完成
- 登录页重构是否引入高优先级阻塞

## 覆盖缺口与假设

- 视觉 1:1 验收默认以 `design-draft/*/code.html` 为基线，不额外引入 Stitch 在线稿比对。
- `API Key Insights` 已在计划书中明确推迟，不纳入本轮手工测试范围。
- 本用例集默认 Phase 1 已完成但仍需回归，因此包含 Dashboard / Logs / Audit Log Detail 的回归项。

## 执行建议

1. 先做通用 smoke 与登录
2. 再跑 Phase 1 回归，确认已完成页面未回退
3. 再跑 Phase 2 高频用户页
4. 再跑 Phase 3 管理员页
5. 最后跑 Phase 4 / Phase 5 辅助页与新增页

## 执行结果占位

- 当前状态：未执行
- 未执行原因：本轮仅按 `$prd-manual-test` 产出待执行用例，等待用户后续指令再执行测试

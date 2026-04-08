# R2A — 用户侧页面还原：Keys + Logs + Models

## 批次目标

将 `/keys`、`/logs`、`/models` 三组页面从旧代码模式还原为 R1 设计系统，同时对齐 Stitch 设计稿的视觉和交互。

## 设计稿映射

| 页面路由 | 设计稿路径 | 说明 |
|---|---|---|
| `/keys` | `design-draft/keys/code.html` | API Keys 列表 |
| `/keys` create modal | `design-draft/keys-create-modal/code.html` | 创建 Key 弹窗 |
| `/keys/[keyId]` | `design-draft/keys-settings/code.html` | Key 设置页 |
| `/logs` | `design-draft/logs/code.html` | 调用日志列表 |
| `/logs/[traceId]` | `design-draft/logs-detail/code.html` | 日志详情 |
| `/models` | `design-draft/models/code.html` | 模型清单 |

**不含 keys-insights 页**（需 schema 迁移，推迟到后续批次）。

## 还原原则

1. **DS 组件替换**：所有页面必须使用 R1 产出的 DS 组件：
   - `useAsyncData` 替换手动 useState+useEffect 数据加载
   - `<Table>` 替换 raw `<table>`
   - `<SearchBar>` 替换 raw `<input>`
   - `<Pagination>` 替换手写翻页
   - `<Card>` 用于统计卡片
   - `<Dialog>` 用于 Create Key Modal 和 Revoke Confirm
   - `<Button>` / `<Input>` 使用 DS 变体

2. **视觉对齐设计稿**：布局、间距、颜色、排版对齐设计稿，使用 DS token（不硬编码颜色值）。

3. **功能范围 = 现有 API 支持的功能**：
   - 设计稿中超出现有 API 的功能（通知铃铛、Region 统计、Re-run trace 等）不实现，留空或隐藏
   - 设计稿中的装饰性统计卡片如无 API 支持，可用占位或去掉

4. **组件拆分**：每个页面的大块独立 UI 抽为子组件（如 CreateKeyDialog、RevokeConfirmDialog、LogDetailPanel），不再在 page.tsx 中堆叠所有逻辑。

5. **i18n**：所有用户可见文本走 next-intl，中英双语。

## 页面级需求

### /keys — API Keys 列表

**数据源：** `GET /api/projects/:id/keys`（search, page, limit）

**功能：**
- 表格列：名称、masked key（可复制）、创建日期、最后使用、状态（Active/Revoked badge）
- 搜索（SearchBar）
- 分页（Pagination）
- "Create Key" 按钮 → 弹出 CreateKeyDialog
- 行操作：编辑（跳转 /keys/[keyId]）、吊销（RevokeConfirmDialog）
- 新创建的 key 显示完整密钥一次（带复制按钮）

**不做：** "Daily Capacity" 统计卡、全局搜索、History 按钮

### /keys create modal

**数据源：** `POST /api/projects/:id/keys`

**功能：**
- 表单字段：名称、描述、过期选项（Never/30d/60d/90d/自定义）、权限开关
- 使用 `<Dialog>` 组件
- 创建成功后显示完整 key + 复制按钮 + "已保存" 提示

### /keys/[keyId] — Key 设置

**数据源：** `GET/PATCH/DELETE /api/projects/:id/keys/:keyId`

**功能：**
- 基本信息：名称（可编辑）、描述（可编辑）、masked key（可复制）、创建时间、最后使用
- Permissions 开关组（chat/image/log/project 等）
- Rate Limit (RPM) 输入
- IP 白名单（textarea，每行一个 IP/CIDR）
- 保存按钮
- Danger Zone：吊销 key（不可逆，需二次确认）

**不做：** Insights tab（per-key 统计）、Enable/Disable 切换（API 仅支持吊销）

### /logs — 调用日志列表

**数据源：** `GET /api/projects/:id/logs`（status, model, page, pageSize）+ `GET /logs/search`（q）

**功能：**
- 表格列：时间、Trace ID（可复制）、模型、预览（promptPreview）、状态 badge、Tokens、费用、延迟
- 状态筛选 tab（All / Success / Error）
- 模型筛选（下拉）
- 搜索（SearchBar，走 /logs/search）
- 分页（Pagination）
- 行点击展开内联详情（promptSnapshot 前两条 + responseContent 截断）或跳转详情页

**不做：** 日期范围筛选（API 暂不支持）、延迟趋势图、Cost Optimization 卡片

### /logs/[traceId] — 日志详情

**数据源：** `GET /api/projects/:id/logs/:traceId` + `POST /logs/:traceId/quality`

**功能：**
- 头部：traceId（可复制）、状态 badge、时间、延迟
- 统计卡片：模型、Tokens、费用、吞吐量 (tokens/s)
- Prompt Messages（system/user 消息列表）
- Response Content（assistant 回复，支持 markdown 渲染）
- Request Parameters（JSON 折叠展示）
- Quality Score（打分按钮）

**不做：** Re-run Trace、Provider/IP/API Version 元数据（API 不返回）

### /models — 模型清单

**数据源：** `GET /v1/models`（modality 筛选）

**功能：**
- 按 Provider 分组展示（使用 provider_name 客户端分组）
- Modality 切换 tab（All / Text / Image）
- 每行：模型 ID、Modality badge、Context Window、定价（input/output per 1M tokens）
- Provider 分组头：名称 + 模型数量
- 分组可折叠/展开
- 统计卡片：Total Models（客户端计数）

**不做：** 搜索（公共 API 不支持）、Deploy Model 按钮、Avg Latency 统计、Provider Regions、通知铃铛

## 技术约束

- 页面文件位于 `src/app/[locale]/(console)/` 下
- 所有 API 调用使用 `apiFetch`（已有封装）
- 状态管理使用 `useAsyncData` hook
- 组件放入 `src/components/` 对应子目录（如 `keys/`、`logs/`、`models/`）
- 不修改任何 API route / Prisma schema / 后端逻辑

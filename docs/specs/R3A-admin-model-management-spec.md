# R3A — 管理侧页面还原：模型管理

## 批次目标

将管理侧 5 个模型管理页面从旧代码模式还原为 R1 设计系统，对齐 Stitch 设计稿。

## 设计稿映射

| 页面路由 | 设计稿路径 | DESIGN.md |
|---|---|---|
| `/admin/models` | `design-draft/admin-models/` | 有 |
| `/admin/model-whitelist` | `design-draft/admin-model-whitelist/` | 有 |
| `/admin/model-capabilities` | `design-draft/admin-model-capabilities/` | 有 |
| `/admin/model-aliases` | `design-draft/admin-model-aliases/` | 待创建 |
| `/admin/providers` | `design-draft/admin-providers/` | 有 |

**开发前必读：** `design-draft/DESIGN-GLOBAL.md` + 每个页面的 `DESIGN.md`

## 还原原则

与 R2 系列一致：

1. **DS 组件替换**：useAsyncData、Table、Card、Dialog、Button、Input、SearchBar、Pagination、Switch
2. **视觉对齐设计稿**：使用 DS token，不硬编码颜色
3. **功能范围 = DESIGN.md 中标注为 "Fully supported" 的功能**
4. **组件拆分**：大块 UI 抽为子组件（放入 src/components/admin/）
5. **i18n**：所有用户可见文本走 next-intl，中英双语

## 页面级需求

### /admin/models — Channel Management

**数据源：** `GET /api/admin/models-channels`

**功能：**
- 按 Provider 分组展示 Models + Channels
- 每个 Model 下列出 Channels（provider、状态、sellPrice、优先级）
- Channel 编辑（sellPrice、优先级）
- Model 启用/禁用
- 搜索 + 分页

### /admin/model-whitelist — 模型白名单

**数据源：**
- `GET /api/admin/models`（列表，支持 search/modality/provider 筛选）
- `PATCH /api/admin/models/:id`（启用/禁用 + sellPrice）

**功能：**
- 统计卡片：Total Models、Enabled、Providers（客户端推算）
- 表格：Enable 开关、Model Name、Provider、Modality badge、Context、Price、Channels、Health
- 搜索 + Provider 筛选 + Modality 筛选
- 客户端分页（API 返回全量）

**不做（见 DESIGN.md）：** "New" badge、Provider logo、"New Deployment" 按钮

### /admin/model-capabilities — 模型能力管理

**数据源：**
- `GET /api/admin/models`（列表）
- `PATCH /api/admin/models/:id`（capabilities + supportedSizes）

**功能：**
- 表格：Model Name、Modality badge、6 个 Capability 开关（streaming/json_mode/function_calling/vision/reasoning/search）
- Image 模型显示 Supported Sizes（tag chips + 添加/删除）
- 搜索 + Modality 筛选
- 客户端分页

### /admin/model-aliases — 模型别名管理

**数据源：**
- `GET /api/admin/model-aliases`（分组列表）
- `POST /api/admin/model-aliases`（创建别名）
- `DELETE /api/admin/model-aliases/:id`（删除别名）
- `POST /api/admin/model-aliases/merge`（合并未分类模型）
- `GET /api/admin/models`（模型列表，用于未分类和合并目标）

**功能：**
- Section 1 "Classified Models"：按 canonical model 分组的卡片，每个显示别名 chips + 删除 + 添加
- Section 2 "Unclassified Models"：表格（Model Name、Modality、Channels、Merge 操作）

### /admin/providers — 服务商管理

**数据源：**
- `GET /api/admin/providers`（列表）
- `PATCH /api/admin/providers/:id`（启用/禁用）
- `GET/PUT /api/admin/providers/:id/config`（配置编辑）

**功能：**
- Provider 列表（名称、状态、模型数量、配置状态）
- 启用/禁用开关
- 配置编辑弹窗（Dialog）：API Key、Base URL、Proxy 等
- 同步触发按钮

## 技术约束

- 页面文件位于 `src/app/(console)/admin/` 下
- 新组件放入 `src/components/admin/`
- 不修改任何 API route / Prisma schema
- **i18n 自检清单**同 R2 系列

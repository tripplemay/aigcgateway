# API Keys 前端重构规格书

## 概述

按 Stitch 原型 1:1 还原 API Keys 页面。涉及 3 个设计稿屏幕，产出 2 个页面组件 + 1 个内嵌 Modal。

## 设计稿来源

| 屏幕名 | Stitch Screen ID | 用途 |
|--------|-------------------|------|
| API Keys (Framework Aligned) - AIGC Gateway | `16615711267346431298` | 主列表页 |
| Create API Key Modal - AIGC Gateway | `10213786238639375603` | 创建弹窗（叠加在列表页上） |
| API Key Settings - AIGC Gateway | `14686180904497091256` | 单 Key 编辑页（新路由） |

HTML 源码获取方式：
```bash
# 通过 Stitch MCP get_screen → htmlCode.downloadUrl → curl 下载
curl -sL "{downloadUrl}" -o /tmp/screen.html
```

## 复刻规则

1. 以各 code.html 的 `<main>` 内部内容为唯一基准（Sidebar + TopAppBar 由框架提供）
2. DOM 结构、Tailwind class、嵌套层级原样搬运
3. 仅做以下替换：
   - 静态数据 → 动态绑定 (`data.map(...)`)
   - 硬编码文案 → `t("key")` i18n 调用
   - `<a href="#">` → `<Link href="...">` / `onClick`
4. 后端尚未支持的字段（description、expiresAt、permissions、rateLimit、ipWhitelist），前端 UI 正常渲染但标注为 disabled 或 "Coming Soon"

---

## 文件 1: `src/app/(console)/keys/page.tsx`

### 基准: API Keys (Framework Aligned) code.html 第 187-415 行

### 区块结构

```
<main>
  <div class="max-w-7xl mx-auto space-y-8">
    ┌─ Page Header (190-198)
    │  ├─ Breadcrumb badge: "Infrastructure / Security"
    │  ├─ h1: "API Keys" (text-4xl font-extrabold tracking-tighter)
    │  └─ p: subtitle
    │
    ├─ Stats Cards (200-230) — grid-cols-3
    │  ├─ Card 1: Active Infrastructure (border-l-4 border-primary)
    │  ├─ Card 2: Daily Capacity (border-l-4 border-tertiary)
    │  └─ Card 3: Quick Action CTA (bg-primary 满底, Create Key 按钮)
    │
    ├─ Key Management Table (232-355)
    │  ├─ Header bar: 标题 + 搜索框
    │  ├─ Table: Name&Project | Access Key | Created | Last Used | Status | Actions
    │  └─ Pagination footer
    │
    ├─ Security Best Practices (357-391) — grid-cols-3
    │  ├─ Never Hardcode Keys (lock 图标)
    │  ├─ Rotate Keys Regularly (autorenew 图标)
    │  └─ Least Privilege (policy 图标)
    │
    ├─ Footer (393-406)
    │  └─ 版权 + 链接
    │
    └─ FAB (411-415) — fixed bottom-8 right-8
  </div>
</main>
```

### 静态 → 动态映射

| 原型静态值 | 替换为 | 数据源 |
|-----------|--------|--------|
| "8 / 25 keys" | `{activeCount} / {keys.length} keys` | 前端聚合 |
| "1,000,000 req" | 静态占位 | 无 API（后续迭代） |
| 表格 3 行 | `keys.map(k => ...)` | `GET /api/projects/:id/keys` |
| "Production-Gateway-01" | `{k.name ?? "Unnamed"}` | API |
| "Project: Alpha_Nebula" | 暂用当前 project name | `useProject()` |
| "ak-••••v9x2" | `{k.maskedKey}` | API |
| "Oct 12, 2023" | `{new Date(k.createdAt).toLocaleDateString()}` | API |
| "2 mins ago" | `{timeAgo(k.lastUsedAt)}` | API |
| ACTIVE / REVOKED badge | 根据 `k.status` 条件渲染 | API |
| edit/block 按钮 | ACTIVE 行: edit → navigate to `/keys/${k.id}`, block → revoke confirm | 交互 |
| history/delete 按钮 | REVOKED 行: 占位 | 交互 |
| "Showing 3 of 8" | `Showing {pageKeys.length} of {keys.length}` | 前端分页 |
| Create Key (CTA 卡片 + FAB) | `onClick → setCreateOpen(true)` | 交互 |

### 交互功能

| 交互 | 实现方式 |
|------|---------|
| 创建 Key | CTA 卡片 / FAB 按钮 → 打开 Create Modal |
| 复制 Key | `navigator.clipboard.writeText()` + toast |
| 撤销 Key | block 图标 → confirm dialog → `DELETE /api/projects/:id/keys/:keyId` |
| 搜索 | 表头搜索框 → 前端 filter by name |
| 分页 | 前端分页 state |
| 编辑 Key | edit 图标 → `router.push(/keys/${k.id})` |

### Create Modal 叠加

基准: Create API Key Modal code.html 第 186-262 行

Modal 结构：
```
<div class="fixed inset-0 bg-on-background/40 backdrop-blur-sm">
  <div class="max-w-lg rounded-xl shadow-2xl">
    ┌─ Header: "Create New API Key" + close 按钮
    ├─ Form:
    │  ├─ Key Name (input)
    │  ├─ Description (textarea) — disabled, "Coming Soon"
    │  ├─ Grid 2 列:
    │  │  ├─ Expiration (select) — disabled
    │  │  └─ Permissions (checkbox pills) — disabled
    │  └─ Warning notice (tertiary 色)
    └─ Footer: Cancel + "Create Key" 按钮
  </div>
</div>
```

创建成功后：Modal 切换为显示完整 Key + 复制按钮 + 警告（现有逻辑保留）。

### 新增 i18n Keys (en.json `keys` namespace)

```json
{
  "infrastructureSecurity": "Infrastructure / Security",
  "subtitle": "Generate and manage access tokens for your AIGC Gateway infrastructure.",
  "activeInfrastructure": "Active Infrastructure",
  "dailyCapacity": "Daily Capacity",
  "quickAction": "Quick Action",
  "generateNewKey": "Generate New API Key",
  "activeKeys": "Active Infrastructure Keys",
  "searchKeys": "Search keys...",
  "nameAndProject": "Name & Project",
  "accessKey": "Access Key",
  "status": "Status",
  "actions": "Actions",
  "active": "ACTIVE",
  "revoked": "REVOKED",
  "showingKeys": "Showing {count} of {total} total keys",
  "prev": "Prev",
  "securityBestPractices": "Security Best Practices",
  "securitySubtitle": "Essential guidelines for managing your infrastructure credentials safely.",
  "neverHardcode": "Never Hardcode Keys",
  "neverHardcodeDesc": "Store keys in environment variables or a secure secret management system rather than your source code.",
  "rotateKeys": "Rotate Keys Regularly",
  "rotateKeysDesc": "Limit the lifespan of your credentials by rotating your API keys every 90 days to minimize exposure risk.",
  "leastPrivilege": "Least Privilege",
  "leastPrivilegeDesc": "Create separate keys for different environments and restrict permissions based on the specific project scope.",
  "description": "Description",
  "descriptionPlaceholder": "Briefly describe what this key is used for...",
  "expirationDate": "Expiration Date",
  "neverExpires": "Never expires",
  "days30": "30 Days",
  "days90": "90 Days",
  "customDate": "Custom Date",
  "permissions": "Permissions",
  "permRead": "Read",
  "permWrite": "Write",
  "permAdmin": "Admin",
  "securityNotice": "For security reasons, your API key will only be shown once after creation. Make sure to copy and store it securely.",
  "comingSoon": "Coming Soon"
}
```

---

## 文件 2: `src/app/(console)/keys/[id]/page.tsx` — 新建

### 基准: API Key Settings code.html 第 160-318 行

### 当前状态: **后端 GET/PATCH 路由不存在，此页面暂不实现。**

待后端 API 就绪后，按以下结构实现：

```
<main class="ml-64 mt-16 p-8 min-h-screen">
  <div class="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
    ┌─ Left Column (lg:col-span-2):
    │  ├─ General Info: Name + Description inputs
    │  ├─ Permissions: 4 个 toggle (chat/image/log/project)
    │  └─ Security & Limits: RPM input + IP whitelist textarea
    │
    └─ Right Column:
       ├─ Key Status: Active toggle + warning text
       ├─ API Key: masked display + copy + warning
       └─ Danger Zone: Delete button (red border)
  </div>
</main>
```

此页面需要的后端能力：
- `GET /api/projects/:id/keys/:keyId` — 返回完整 Key 详情
- `PATCH /api/projects/:id/keys/:keyId` — 更新字段
- `DELETE /api/projects/:id/keys/:keyId` — 永久删除（当前 DELETE 是 revoke）

---

## 实施顺序

1. 新增 i18n keys (en.json + zh-CN.json)
2. 重写 `keys/page.tsx` — 严格复刻列表页 + Create Modal
3. 验证 tsc + lint + build
4. `keys/[id]/page.tsx` 待后端就绪后实施

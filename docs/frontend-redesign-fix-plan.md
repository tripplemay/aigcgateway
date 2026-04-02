# 前端重构修复计划 — 代码级 1:1 复刻原型

## 背景

第一轮前端重构完成后，经逐页核查发现 18 个页面中有 11 个存在与原型的结构性差异：4 个为手写实现（布局和交互与原型不同），4 个有整块区域跳过，3 个有局部简化。本计划旨在将所有页面修复为严格的代码级 1:1 复刻。

## 原则

1. **代码级复刻**：逐行对照原型 HTML 的 `<main>` 区域生成对应 JSX，不看截图猜测
2. **只改 JSX/CSS/动画**：不改数据获取逻辑（state、useEffect、API 调用）
3. **装饰性图片跳过**：Stitch 生成的 `lh3.googleusercontent.com` 占位图统一跳过，可用色块替代
4. **功能占位**：后端不支持的功能（社交登录、Forgot Password）按钮渲染为视觉占位，不实现逻辑

---

## 第一批：手写实现页面修复（差异最大，优先）

### 1. Login `/login`

**原型文件**：`design-draft/Login (Terminal Simulation)/code.html`
**实现文件**：`src/app/(auth)/login/page.tsx`

| # | 修复项 | 原型行号 | 当前状态 | 改动说明 |
|---|--------|---------|---------|---------|
| 1a | 终端逐字打字动画 | 282-379 | 静态文本 `.map()` 渲染 | 将静态渲染改为 `useEffect` + `async function runSequence()`，实现：`typeText`（每字符 40ms + 随机 40ms 延迟）、`addHistoryLine`（自动滚动 + 超 20 行清理）、4 组命令无限循环（chat → health → logs → billing）、命令打完 600ms 后进入历史、响应逐行 200-700ms 延迟出现、2000ms 后进入下一组 |
| 1b | 第 4 组命令 | 313-320 | 只有 3 组 | 补 `aigc billing --usage` 命令及 3 行响应 |
| 1c | Google + GitHub 社交登录按钮 | 245-262 | 完全缺失 | 在表单下方加 2 个按钮（含原型的 Google/GitHub SVG 图标），`onClick` 暂不实现 |
| 1d | Remember Me 复选框 | 229-230 | 缺失 | 在密码框下加 `<input type="checkbox">` + `<label>Remember Me</label>` |
| 1e | Forgot Password 链接 | 219 | 缺失 | 在密码 label 行右侧加 `<a href="#">Forgot Password?</a>` |
| 1f | "Or continue with" 分隔线 | 237-243 | 缺失 | 在表单和社交按钮之间加带文字的水平分隔线 |
| 1g | 底部 footer 链接 | 272-279 | 缺失 | 在表单容器底部加 Documentation / Privacy Policy / Support 链接 + 版权文案 |
| 1h | 密码显示/隐藏按钮 | 223-225 | 缺失 | 密码 input 右侧加 `visibility` 图标按钮（toggle `type="password"` / `type="text"`） |

### 2. MCP Setup `/mcp-setup`

**原型文件**：`design-draft/MCP Setup (Full Redesign)/code.html`
**实现文件**：`src/app/(console)/mcp-setup/page.tsx`

| # | 修复项 | 原型行号 | 当前状态 | 改动说明 |
|---|--------|---------|---------|---------|
| 2a | 布局改为 12 列 Bento Grid | 173 | 简单 3 列 `md:grid-cols-3` | 改为 `grid-cols-12`，左栏 `col-span-5`（Step 1 + Step 3 Tools），右栏 `col-span-7`（Step 2 Config） |
| 2b | API Key 选择改为 radio 卡片 | 184-214 | `<select>` 下拉框 | 替换为 radio 按钮 + 卡片布局，每张卡显示 Key 名（uppercase tracking-tighter）+ prefix（mono）+ Active 状态点（绿色 pulse） |
| 2c | "Create New Key" 按钮 | 216-218 | 缺失 | 在 Key 选择区底部加 `<Link href="/keys">` 按钮，样式：`border border-indigo-100 text-indigo-600 hover:bg-indigo-50` |
| 2d | 步骤编号改为数字圆形 | 181/223/298 | Material Symbols 图标 | 将图标替换为 `w-10 h-10 rounded-full bg-primary text-white font-bold` 的数字（1/2/3） |
| 2e | Config 代码块样式 | 307-334 | 简化样式 | 改为 `bg-slate-950 rounded-2xl p-6 pt-12 border border-slate-800 shadow-2xl`，内部加 "Copy Config" 按钮（`bg-slate-800 text-slate-400`） |
| 2f | Dynamic Tool Injection 提示卡 | 337-345 | 缺失 | 在 Config 区下方加 `bg-indigo-50/50 border border-indigo-100 rounded-2xl p-8` 提示卡，含 `dynamic_form` 图标 + 标题 + 描述 |
| 2g | "Finalize Installation" 按钮 | 346-351 | 缺失 | Config 区底部加 `bg-slate-900 text-white px-8 py-3 rounded-full font-bold` 按钮 + 箭头图标 |
| 2h | Tools 放到左栏 Step 1 下方 | 220-291 | 独立底部区块 | 将 Tools 列表移到左栏 `col-span-5` 内，Step 1 下面。卡片样式改为 `bg-white rounded-lg shadow-sm border border-slate-100/50 p-3`，图标用 `bg-indigo-50 text-indigo-600 rounded-lg p-2` |

### 3. Quick Start `/quickstart`

**原型文件**：`design-draft/Quick Start (Full Redesign)/code.html`
**实现文件**：`src/app/(console)/quickstart/page.tsx`

| # | 修复项 | 原型行号 | 当前状态 | 改动说明 |
|---|--------|---------|---------|---------|
| 3a | Hero 副标题完整文案 | 168 | 简化为一句话 | 改为原型文案："Initialize your journey into automated creativity with our streamlined SDK integration. Four steps to production-ready AI." |
| 3b | 每个卡片加环境标签 pill | 179/200/221/242 | 缺失 | 卡片标题行右侧加标签：Step 1 "Environment"、Step 2 "Foundation"、Step 3 "Real-time"、Step 4 "Creative"。样式：`text-xs font-bold uppercase tracking-widest text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full` |
| 3c | 每个卡片加描述段落 | 181/202/223/244 | 缺失 | 标题和代码块之间加描述。内容从原型复制：Step 1 "Prepare your local environment..."、Step 2 "Initialize the client..."、Step 3 "Enable low-latency interfaces..."、Step 4 "Connect to Midjourney or DALL-E..." |
| 3d | 代码块头部文件名 + Copy 文字 | 183-188 | 只有图标 | 代码块顶部加 `flex justify-between mb-2`：左侧 `text-slate-500` 文件名（Terminal / index.js / stream.js / images.js），右侧 Copy 图标 + "Copy"/"Copied" 文字 |
| 3e | 底部 Footer Resources 区块 | 258-270 | 完全缺失 | 在步骤网格下加区块：`bg-surface-container rounded-3xl p-10 flex md:flex-row items-center gap-8`。含标题 "Ready for the deep dive?"、描述段落、"Read Documentation" 主按钮 + "Explore Models" 次按钮 |

### 4. Settings `/settings`

**原型文件**：`design-draft/Settings (Full Redesign)/code.html`
**实现文件**：`src/app/(console)/settings/page.tsx`

| # | 修复项 | 原型行号 | 当前状态 | 改动说明 |
|---|--------|---------|---------|---------|
| 4a | 布局改为 3 列 | 186 | 单列 `max-w-2xl` | 改为 `max-w-5xl grid lg:grid-cols-3 gap-8`。左栏 `lg:col-span-2`（Profile + Notifications），右栏（Password + Sign Out + Status） |
| 4b | Profile 区 Email + Name 改为 2 列 | 200 | 上下堆叠 | Profile 表单内改为 `grid md:grid-cols-2 gap-6`，Email 和 Name 并排 |
| 4c | System Status 迷你卡 | 285-292 | 缺失 | 右栏底部加暗色渐变卡（`bg-gradient-to-br from-inverse-surface to-[#1a202c] text-white rounded-xl p-6`），显示绿色状态点 + "API Latency: 14ms" 占位 + "All regions operational" |
| 4d | Sign Out 卡背景装饰图标 | 280-282 | 缺失 | 加 `absolute -right-4 -bottom-4 opacity-5 pointer-events-none` 的 `text-8xl logout` 图标 |

---

## 第二批：整块区域补回

### 5. Logs `/logs` — 底部 Metrics Grid

**原型文件**：`design-draft/Logs (Full Redesign)/code.html` 行 349-400
**实现文件**：`src/app/(console)/logs/page.tsx`

| # | 修复项 | 原型行号 | 改动说明 |
|---|--------|---------|---------|
| 5a | 添加 Metrics Grid 面板 | 349-400 | 在分页 `</div>` 下方加 `mt-8 grid grid-cols-12 gap-6`：左 `col-span-8` 含 "Recent Latency Trends" 标题 + 柱状图（Recharts 渲染延迟数据，或无数据时用占位柱）；右 `col-span-4` 含 2 张卡：(1) 渐变紫色 "Cost Optimization" 卡 `bg-indigo-600 text-white`，(2) 白色 "Total Logs Volume" 卡显示总日志数 |

### 6. Admin: Providers `/admin/providers` — 统计 Bento Grid

**原型文件**：`design-draft/Admin - Providers (Full Redesign)/code.html` 行 295-325
**实现文件**：`src/app/(console)/admin/providers/page.tsx`

| # | 修复项 | 原型行号 | 改动说明 |
|---|--------|---------|---------|
| 6a | 表格上方加统计卡 | 295-325 | 在 header 和 table 之间加 2 张卡：(1) "Total Tokens In (24h)" — 数据用 "—" 占位（API 不支持），(2) "Operational Status" — 显示 providers 总数 + Active/Disabled 计数 |

### 7. Admin: Health `/admin/health` — 主状态卡

**原型文件**：`design-draft/Admin - Health (Full Redesign)/code.html` 行 163-182
**实现文件**：`src/app/(console)/admin/health/page.tsx`

| # | 修复项 | 原型行号 | 改动说明 |
|---|--------|---------|---------|
| 7a | Summary Cards 上方加全宽状态大卡 | 163-182 | 加渐变背景的 Operational Status 卡（可复用 summary 数据：如 `active > 0` 显示 "Systems Operational"，否则 "Degraded"），样式参照原型渐变 |

### 8. Admin: Logs `/admin/logs` — Insight 面板

**原型文件**：`design-draft/Admin - Logs (Full Redesign)/code.html` 行 437-456
**实现文件**：`src/app/(console)/admin/logs/page.tsx`

| # | 修复项 | 原型行号 | 改动说明 |
|---|--------|---------|---------|
| 8a | 分页下方加 Insight 面板 | 437-456 | 加 `mt-8 grid grid-cols-2 gap-6`：(1) "Traffic Insight" 卡 — 占位文案描述流量趋势，(2) "Error Spike Alert" 卡 — 占位文案描述错误趋势 |

---

## 第三批：局部简化修复

### 9. Models `/models` — 统计卡 Bento

**原型文件**：`design-draft/Models (Full Redesign)/code.html` 行 171-196
**实现文件**：`src/app/(console)/models/page.tsx`

| # | 修复项 | 原型行号 | 改动说明 |
|---|--------|---------|---------|
| 9a | 统计区改为 4 列 Bento | 171-196 | 从 `grid-cols-3` 改为 `md:grid-cols-4`，首卡 "Total Models" 占 `col-span-2`，内含迷你柱状图占位条 |

---

## 不改项

| 项目 | 原因 |
|------|------|
| 装饰性图片 | Stitch 占位图，用色块替代 |
| MCP Setup Tools 名称 | 实现使用真实 MCP tool 名称（list_models/chat/generate_image 等），原型用虚构名称（get_context/token_count/verify_key），以实现为准 |
| Login 社交登录 OAuth 逻辑 | 后端不支持，按钮仅视觉占位 |
| Login Remember Me 逻辑 | 后端不支持，checkbox 仅视觉占位 |
| Login Forgot Password 逻辑 | 后端不支持，链接仅视觉占位 |

---

## 关联问题（非本计划范围，但需关注）

| 问题 | 来源 | 说明 |
|------|------|------|
| Material Symbols 图标显示为文字 | 生产/本地测试报告 | 字体文件在 build 产物中存在，疑似 standalone serve 问题或字体加载失败 |
| Key 列表分页 `pageSize` vs `limit` 参数名 | 生产测试报告 #3 | 后端 GET 路由用 `limit`，前端/Codex 测试用 `pageSize` |
| 成功调用不进 logs/usage | 生产测试报告 #4 | 后端 post-process 写 CallLog 异常 |
| `/keys/[keyId]` chunk pending | 生产测试报告 #2 | standalone 静态文件问题 |
| Settings 密码错误态 hang | 生产测试报告 #5 | apiFetch 错误处理问题 |

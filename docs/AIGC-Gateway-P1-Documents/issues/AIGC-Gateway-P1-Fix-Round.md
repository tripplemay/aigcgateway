# AIGC Gateway — P1 修复轮任务清单

> 时间：2026年3月30日
> 性质：Bug修复 + UI重构，不新增功能

---

## 一、任务总览

| 类别 | 任务数 | 优先级 |
|------|--------|--------|
| UI基础设施重建（shadcn/ui + 主题） | 3 | 最高（其他UI任务依赖它） |
| Bug修复 | 2 | 高 |
| 页面视觉对齐（逐页调整） | 4 | 中 |

---

## 二、UI 基础设施重建

### FIX-001：安装真正的 shadcn/ui 组件

**问题：** 当前使用手写的"精简版shadcn风格"组件，缺少Radix UI行为层、无障碍支持、统一设计token。

**修复：**
1. 执行 `npx shadcn@latest init`（如未初始化）
2. 安装全部需要的组件：
   ```
   npx shadcn@latest add button dialog table form input select tabs card badge
   npx shadcn@latest add dropdown-menu sheet toast alert separator skeleton
   npx shadcn@latest add popover calendar command avatar tooltip
   ```
3. 将现有页面中手写的组件替换为 shadcn/ui 官方组件
4. 删除手写的精简组件文件

**验证：** 所有组件从 `@/components/ui/` 导入，无手写UI组件残留。

---

### FIX-002：注入品牌色和语义色到主题系统

**问题：** 界面是默认的黑白灰，缺少品牌识别度和视觉层次。

**修复：** 在 `tailwind.config.ts` 和 `globals.css` 中注入以下设计token：

```
品牌色：
  brand:        #6D5DD3（主色）
  brand-light:  #EEEDFE（浅底）
  brand-dark:   #3C3489（深色文字）

语义色：
  success:      bg #EAF3DE / text #27500A
  error:        bg #FCEBEB / text #791F1F
  warning:      bg #FAEEDA / text #633806
  info:         bg #E6F1FB / text #0C447C

辅助色：
  teal:         #0F9D7A（图表第二色）
  coral:        #E85D30（图表第三色）

中性色：
  surface:      #f8f7f5（卡片背景）
  bg:           #f3f2ee（页面背景）
  border:       #e5e4e0（分割线）
  muted:        #888780（次要文字）
  subtle:       #B4B2A9（提示文字）
```

**验证：** 侧边栏选中态有品牌色标记，Badge使用语义色，整体不再是纯黑白灰。

---

### FIX-003：侧边栏视觉升级

**问题：** 侧边栏缺少品牌感，选中态不明显，分组标签不突出。

**修复：**
- Logo区域：添加品牌色图标块（紫色圆角方块 + 白色图标）
- 选中态：左侧3px品牌色边框 + 浅色背景 + 文字加深
- 未选中态：灰色文字 + 图标半透明
- 分组标签（PROJECT/OBSERVE/BILLING/HELP/ADMIN）：11px灰色字母，与导航项有间距
- 底部：用户头像（首字母圆形）+ 名称 + 项目名

**参照：** 交互规格文档 §1.1 布局结构 + HTML原型中的侧边栏实现。

---

## 三、Bug 修复

### FIX-004：空状态缺少操作按钮

**问题：** Dashboard无项目时只有文案，无"Create Project"按钮和图标。

**修复：**
- 添加居中图标（可用 lucide-react 的 FolderPlus 或 Layers 图标）
- 添加"Create Project"按钮，点击后打开创建项目对话框
- 所有空状态页面统一适用此模式

**验证：** 新注册用户看到引导性的空状态，点击按钮可创建项目。

---

### FIX-005：Logs/Usage/Balance/Keys 无项目时空白

**问题：** 4个页面在 `useProject()` 返回 null 时直接 `return null`，用户看到完全空白。

**修复：**
- 参照Dashboard的模式，添加loading状态（Skeleton）和无项目提示
- 四个文件：logs/page.tsx、usage/page.tsx、balance/page.tsx、keys/page.tsx
- 无项目时显示："No project yet. Create your first project to get started." + 创建按钮

**验证：** 新注册用户访问这4个页面不再空白，有引导提示。

---

## 四、页面视觉对齐

### FIX-006：Badge 组件样式统一

**问题：** 当前Badge样式单调，缺少语义色区分。

**修复（全局）：**

| Badge类型 | 背景色 | 文字色 | 适用场景 |
|-----------|--------|--------|---------|
| success | #EAF3DE | #27500A | status=success, active |
| error | #FCEBEB | #791F1F | status=error |
| filtered/warning | #FAEEDA | #633806 | status=filtered |
| text (modality) | #E6F1FB | #0C447C | modality=text |
| image (modality) | #FBEAF0 | #72243E | modality=image |
| free (price) | — | #3A8A1C (加粗) | price=Free |

**验证：** Models列表的Modality列、Audit Logs的Status列、Channels的状态列，Badge颜色正确区分。

---

### FIX-007：Dashboard 图表和指标卡片优化

**问题：** Dashboard的图表和指标卡片与原型差距较大。

**修复：**
- 指标卡片：surface背景色(#f8f7f5) + 10px圆角 + 趋势标签（绿色上升/红色下降）
- Recharts图表：使用品牌色(#6D5DD3)作为主色、teal(#0F9D7A)作为第二色
- 面积图：品牌色描边 + 15%透明度填充
- 柱状图：3px圆角顶部
- 环形图：5色配色（brand/teal/coral/blue/amber）+ 右侧图例
- 图表tooltip：白色背景 + 1px边框 + 8px圆角
- 图表坐标轴：灰色(#888780) 11px字号 + 隐藏轴线

**验证：** Dashboard整体视觉接近HTML原型的效果。

---

### FIX-008：表格全局样式优化

**问题：** 表格行间距大、hover效果弱、字体不统一。

**修复：**
- 表头：11px灰色 + 底部1px分割线 + 浅灰背景(#fafaf8)
- 数据行：8px padding + 底部0.5px分割线 + hover时#fafaf8背景
- 等宽字段（traceId/cost/latency/tokens）：使用 `font-mono` 类
- traceId：蓝色(#2B7BD5)
- Model名：font-weight 500
- Prompt列：flex宽度 + text-overflow ellipsis
- 最后一行无底部分割线

**验证：** Audit Logs、Models、Channels、Keys、Transactions等所有表格风格统一。

---

### FIX-009：审计日志详情面板样式

**问题：** 详情面板的代码块和指标卡片样式需要对齐原型。

**修复：**
- 指标卡片行（Model/Tokens/Cost/Latency）：4列grid + surface背景 + 6px圆角
- 参数和吞吐量：2列grid
- System prompt / User message / Response：等宽字体代码块 + surface背景 + 6px圆角 + max-height 120px 滚动
- Error状态的Response：浅红背景(#FFF5F5) + 深红文字(#791F1F)
- 关闭按钮：右上角 x

**验证：** 点击Audit Logs中的一行，展开的详情面板排版清晰，代码块可滚动。

---

## 五、不在本轮修复范围

| 事项 | 原因 |
|------|------|
| 邮箱验证流程 | P2计划，需SMTP服务 |
| 支付真实验签 | P2计划，需真实支付凭证 |
| 服务商API Key采购 | 运维操作，非代码问题 |
| SDK发布到npm | 运维操作，需包名注册 |
| .next缓存冲突 | 已知限制，`rm -rf .next` 即可 |
| curl代理绕过 | 环境配置，非代码问题 |

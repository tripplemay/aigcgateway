# P1 修复轮 — Claude Code 启动提示词

> 复制以下内容发送给 Claude Code

---

```
我们正在进行 AIGC Gateway 项目的【P1 修复轮】。这不是新功能开发，而是 Bug 修复 + UI 重构。

请先阅读：
1. CLAUDE.md（项目规则）
2. docs/AIGC-Gateway-P1-Documents/AIGC-Gateway-Console-Interaction-Spec.md（交互规格，重点看 §1.2 通用交互规范）

## 问题背景

当前前端存在两个核心问题：
1. 使用了手写的"精简版 shadcn 风格"组件，而非通过 shadcn CLI 安装的真正组件
2. 缺少品牌色和语义色，整体是默认的黑白灰

## 任务清单（按顺序执行）

### 第一步：UI 基础设施重建（最高优先级）

**FIX-001：安装真正的 shadcn/ui 组件**
1. 如果尚未执行过 `npx shadcn@latest init`，先执行初始化
2. 安装全部需要的组件：
   ```
   npx shadcn@latest add button dialog table form input select tabs card badge dropdown-menu sheet toast alert separator skeleton popover calendar command avatar tooltip
   ```
3. 将所有页面中手写的精简组件替换为 shadcn/ui 官方组件
4. 删除手写的精简组件文件（如果有的话）

**FIX-002：注入品牌色和语义色**
在 tailwind.config.ts 和 globals.css 中配置以下颜色：
- 品牌色：brand #6D5DD3 / brand-light #EEEDFE / brand-dark #3C3489
- 成功：bg #EAF3DE / text #27500A
- 错误：bg #FCEBEB / text #791F1F  
- 警告：bg #FAEEDA / text #633806
- 信息：bg #E6F1FB / text #0C447C
- 图表配色：#6D5DD3, #0F9D7A, #E85D30, #2B7BD5, #D4940E
- 页面背景：#f3f2ee，卡片/surface：#f8f7f5，边框：#e5e4e0
- 文字：主 #2C2C2A / 次 #5F5E5A / 辅 #888780 / 提示 #B4B2A9

**FIX-003：侧边栏视觉升级**
- Logo：品牌色方块(#6D5DD3 圆角6px) + 白色图标 + "AIGC Gateway" 文字
- 导航选中态：左侧3px品牌色边框 + #f3f2ee背景 + 文字 #2C2C2A + 图标 80%不透明
- 未选中态：文字 #888780 + 图标 45%不透明
- 分组标签：11px #B4B2A9 + letter-spacing 0.5px
- 底部：首字母头像(圆形 #E6F1FB 底 #2B7BD5 字) + 用户名 + 项目名

### 第二步：Bug 修复

**FIX-004：空状态缺少操作按钮**
Dashboard 无项目时添加：居中图标 + "No project yet" 文案 + "Create Project" 按钮。所有空状态统一此模式。

**FIX-005：Logs/Usage/Balance/Keys 无项目时空白**
四个文件中 `if (!current) return null` 改为显示 loading Skeleton + 无项目引导提示：
- src/app/(console)/logs/page.tsx
- src/app/(console)/usage/page.tsx  
- src/app/(console)/balance/page.tsx
- src/app/(console)/keys/page.tsx

### 第三步：视觉对齐

**FIX-006：Badge 样式统一**
- success/active: bg #EAF3DE text #27500A
- error: bg #FCEBEB text #791F1F
- filtered/warning: bg #FAEEDA text #633806
- text(modality): bg #E6F1FB text #0C447C
- image(modality): bg #FBEAF0 text #72243E

**FIX-007：Dashboard 图表和指标卡片**
- 指标卡片：#f8f7f5 背景 + 10px圆角 + 趋势标签（绿上/红下）
- Recharts 主色 #6D5DD3，第二色 #0F9D7A
- 面积图：品牌色 + 15%透明度填充
- 柱状图：3px顶部圆角
- 环形图：5色 + 右侧图例
- Tooltip：白底 + 1px边框 + 8px圆角
- 坐标轴：#888780 11px 隐藏轴线

**FIX-008：表格全局样式**
- 表头：11px灰色 + #fafaf8背景 + 底部分割线
- 数据行：8px padding + 0.5px分割线 + hover #fafaf8
- 等宽字段（traceId/cost/latency/tokens）用 font-mono
- traceId 蓝色 #2B7BD5
- Model名 font-weight 500
- Prompt列 ellipsis 截断

**FIX-009：审计日志详情面板**
- 指标卡片：4列 grid + #f8f7f5 + 6px圆角
- 代码块：font-mono + #f8f7f5 + 6px圆角 + max-h 120px 滚动
- Error响应：#FFF5F5 背景 + #791F1F 文字

## 重要约束

- 不新增任何功能，只修复和优化视觉
- 所有颜色通过 Tailwind 配置的 CSS 变量使用，不在组件中硬编码 hex 值
- 修改完成后确保 TypeScript 编译 0 错误
- 每完成一个 FIX 编号的任务后告诉我，我逐个验证

请从 FIX-001 开始。
```

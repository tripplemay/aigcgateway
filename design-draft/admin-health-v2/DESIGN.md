# Admin Health V2 — Design Notes

## 设计稿来源
Stitch 项目 "AIGC Gateway"，屏幕 "Admin: Health (Re-designed)"，2026-04-11 生成。

## 实现注意事项

### 忽略的设计稿元素（Stitch 装饰，不还原）
- **侧边栏**：设计稿包含独立侧边栏（Channel Health / Validation Logs / Alert History / Admin Panel），使用项目共享侧边栏组件
- **顶部 Tab 导航**："Overview / Deployments / Monitoring / Settings" 和 "Create Alert" 按钮不在需求范围内
- **顶部通知铃铛和用户头像**：使用共享 TopNavBar 组件

### No-Line 规则修正
设计稿两处轻微违反 No-Line 规则，实现时修正：
1. 展开行的 `border-2 border-tertiary/10` 外框 → 改为左侧 4px primary accent bar（与 model-aliases 页一致）
2. Channel 行之间的 `border-t border-surface-container-low/50` → 改为 `spacing-2` 间距替代

### 动态数据绑定
- 筛选栏下拉框选项设计稿中写死了 "OpenAI"/"Anthropic"，实现时从 API 动态获取 Provider.displayName
- 仪表盘统计卡片数字绑定 `/api/admin/health` 返回的 summary 数据

### 需补充的交互（设计稿未覆盖）
1. **API_REACHABILITY 标签**：设计稿只展示了 L1/L2/L3 三级标签。对于仅做 API_REACHABILITY 检查的通道（图片通道、未纳入别名的通道），显示单个 "API ✓" 或 "API ✗" 标签替代三级标签
2. **High Risk 标记**：设计稿未展示 High Risk 状态。已启用别名且 activeCount=0 时，别名行应显示红色警告标签

### 可实现的设计稿增强
- 孤儿通道行的 **"Assign Alias"** 按钮：设计稿新增的有价值交互，可直接在孤儿通道行关联到别名。建议实现。

### 1:1 还原区域
以下区域严格按设计稿还原（唯一允许改动：硬编码文本→i18n、硬编码数据→API 绑定、HTML→React 组件）：
- 顶部 4 列统计卡片布局和样式
- 筛选栏整体容器（`rounded-full bg-surface-container-low`）+ 搜索框 + 下拉框 + 刷新按钮
- 别名折叠行布局：图标 + 名称 + Health 状态 + Channels 统计 + Avg Latency + 展开箭头
- 展开后 Channel 列表行布局：模型 ID（mono）+ Provider + L1/L2/L3 标签 + 延迟 + 时间 + Run Check
- 孤儿通道区域布局

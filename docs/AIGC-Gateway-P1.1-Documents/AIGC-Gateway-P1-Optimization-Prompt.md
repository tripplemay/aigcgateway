# AIGC Gateway — P1 优化补丁：模型自动同步 + 管理界面重构

> 复制以下内容发送给 Claude Code

---

```
我们要对 AIGC Gateway 做一个 P1 优化补丁，包含两个关联任务：模型自动同步 + 模型/通道管理界面重构。

请先阅读 CLAUDE.md 了解项目规则。

## 任务一：模型自动同步

### 背景
目前 Model 和 Channel 数据来自 prisma/seed.ts 的手动定义，模型列表不完整且无法自动更新。需要改为从服务商 API 自动同步。

### 开发内容

1. **同步引擎（lib/sync/model-sync.ts）**
   - 遍历所有 ACTIVE 的 Provider
   - 优先调用服务商的 /models 接口获取模型列表
   - 不支持 /models 的服务商，从 ProviderConfig 中读取静态模型列表（新增 staticModels 字段）
   - 对比本地数据库，识别新增/下架的模型

2. **新模型自动创建**
   - 发现新模型时，自动创建 Model 记录（统一命名格式 provider/model）
   - 自动创建对应的 Channel 记录，status 设为 ACTIVE
   - costPrice 从服务商返回的定价信息中提取（如果服务商不返回价格，设为 0，需运营手动补充）
   - sellPrice = costPrice × 默认加价比例
   - 默认加价比例存储在系统配置中（新增配置项 DEFAULT_MARKUP_RATIO，默认 1.2，即加价 20%）
   - 运营可在控制台手动修改任意 Channel 的 sellPrice，手动修改的不会被同步覆盖

3. **模型下架处理**
   - 同步时发现服务商不再返回某个模型 → 自动将对应 Channel.status 设为 DISABLED
   - 不删除 Model 和 Channel 记录（保留历史审计数据）

4. **同步触发方式**
   - 应用启动时自动执行一次完整同步
   - 每天凌晨 4:00 定时同步（cron job）
   - 控制台手动触发按钮（Admin → 模型管理页面右上角 "Sync models" 按钮）
   - API 端点：POST /api/admin/sync-models（Admin 权限）

5. **同步日志**
   - 每次同步记录结果：新增了哪些模型、下架了哪些、失败了哪些 Provider
   - 控制台可查看最近一次同步的时间和结果

6. **去掉种子数据中的 Model/Channel 部分**
   - prisma/seed.ts 中保留 Provider + ProviderConfig + 管理员账号
   - 删除手动定义的 Model 和 Channel 种子数据
   - 首次启动时由同步引擎自动创建

7. **ProviderConfig 扩展**
   - 新增 staticModels 字段（JSON 数组），用于不支持 /models 接口的服务商
   - 格式示例：
     ```json
     [
       {
         "id": "doubao-pro-32k",
         "name": "Doubao Pro 32K",
         "modality": "text",
         "contextWindow": 32768
       }
     ]
     ```
   - 支持 /models 的服务商此字段为空，同步时优先走 API

8. **各服务商 /models 接口适配**
   - OpenAI: GET https://api.openai.com/v1/models ✅
   - Anthropic: GET https://api.anthropic.com/v1/models ✅
   - DeepSeek: GET https://api.deepseek.com/v1/models ✅
   - 智谱 AI: GET https://open.bigmodel.cn/api/paas/v4/models ✅
   - OpenRouter: GET https://openrouter.ai/api/v1/models ✅
   - 硅基流动: GET https://api.siliconflow.cn/v1/models ✅
   - 火山引擎: 不支持标准 /models → 使用 ProviderConfig.staticModels

   注意：每家服务商返回的模型列表格式不同，需要做标准化映射：
   - 提取 model id → 生成统一命名（provider/model）
   - 提取 modality（从 id 或 capabilities 推断，如含 dall-e/image 的是图片模型）
   - 提取 context_length / max_tokens
   - 提取 pricing（如果返回了的话）

## 任务二：模型/通道管理界面重构

### 背景
当前模型页面和通道页面是两个独立的扁平列表，模型多了很难管理，通道状态不直观。需要合并为一个三层折叠结构的图形化管理界面。

### 开发内容

1. **合并模型页面和通道页面为一个统一界面**
   - 路由：保留 /admin/models，去掉独立的 /admin/channels 页面（通道在模型页面内管理）
   - 侧边栏：把 "Models" 和 "Channels" 合并为 "Models & channels"

2. **三层折叠结构**

   **第一层：按服务商分组**
   - 每个 Provider 一个可折叠卡片
   - 左侧：Provider logo/首字母 + 名称
   - 右侧：健康状态汇总（绿色圆点 + active 数 / 黄色 + degraded 数 / 红色 + disabled 数）+ 模型总数
   - 点击展开/折叠

   **第二层：展开后显示该服务商下的模型列表**
   - 每行显示：健康状态圆点 + 模型名（等宽字体）+ 模态 Badge（text 蓝 / image 粉）+ 上下文窗口 + 售价
   - 模型的健康状态 = 该模型最优通道（priority 最高的 ACTIVE 通道）的健康状态
   - 点击某个模型行展开第三层

   **第三层：展开后显示该模型的所有通道**
   - 通道以卡片形式并排展示（grid 2 列）
   - 每张卡片：
     - 左边框颜色标记状态：绿色(active) / 黄色(degraded) / 红色(disabled)
     - 卡片内容：通道来源（Provider 名）+ Priority 标签
     - 4 个指标：Cost price / Sell price / Latency / Success rate
     - 底部进度条：成功率可视化（绿色填充）
   - Priority 标签可点击，弹出输入框快速修改
   - Sell price 可点击内联编辑

3. **顶部操作栏**
   - 模态筛选：All / Text / Image 按钮组
   - "Sync models" 按钮：手动触发同步
   - 搜索框：按模型名搜索

4. **底部状态栏**
   - 图例：绿色 Active / 黄色 Degraded / 红色 Disabled
   - 上次同步时间

5. **API 支持**
   - GET /api/admin/models-channels：返回按 Provider 分组的模型+通道数据，包含健康状态和统计
   - 复用现有的 PATCH /api/admin/channels/:id 接口（修改 priority / sellPrice / status）
   - POST /api/admin/sync-models：手动触发同步

## 数据库变更

1. ProviderConfig 新增字段：
   ```
   staticModels  Json?    // 不支持 /models 接口的服务商的静态模型列表
   ```

2. 新增系统配置（可放在环境变量或数据库配置表中）：
   ```
   DEFAULT_MARKUP_RATIO=1.2    // 默认加价比例
   ```

3. Channel 新增字段（可选，用于记录价格是否被手动修改过）：
   ```
   priceOverridden  Boolean  @default(false)  // true 表示运营手动定过价，同步时不覆盖
   ```

## 约束

- 不改变现有 API 网关的调用逻辑（/v1/chat/completions 等不变）
- 不改变开发者控制台的模型列表页面（开发者看到的还是扁平列表，只是数据更完整了）
- 同步引擎的错误不影响主服务——某个 Provider 同步失败只记日志，不影响其他 Provider
- 同步是幂等的——重复执行不会产生重复数据
- 手动修改的 sellPrice 不会被同步覆盖（通过 priceOverridden 标记保护）
- 完成后确保 TypeScript 编译 0 错误
- 国际化：新增的 UI 文字需要同时添加中英文翻译

## 验证清单

- [ ] 启动应用 → 自动同步 → 数据库中出现全部服务商的模型和通道
- [ ] 控制台 Models & channels 页面按服务商分组显示
- [ ] 展开 DeepSeek → 看到 deepseek/v3 等模型 → 展开看到通道卡片（含状态/价格/延迟/成功率）
- [ ] 通道卡片左边框颜色正确标记 active/degraded/disabled
- [ ] 底部进度条反映成功率
- [ ] Priority 可点击修改 → 保存成功
- [ ] Sell price 可内联编辑 → 保存成功 → priceOverridden 标记为 true
- [ ] "Sync models" 按钮 → 触发同步 → 新模型出现 → 已下架的模型被 disabled
- [ ] 服务商返回价格时 sellPrice = costPrice × 1.2（默认加价比例）
- [ ] 手动修改过 sellPrice 的通道，同步后价格不变
- [ ] 火山引擎通过 staticModels 配置同步
- [ ] 模态筛选（All/Text/Image）正常工作
- [ ] 搜索框按模型名过滤正常
- [ ] 去掉 seed.ts 中的 Model/Channel 数据后，首次启动同步自动创建
- [ ] 开发者控制台的模型列表页面数据正常（模型更完整了）
- [ ] 中英文翻译完整

请开始。
```

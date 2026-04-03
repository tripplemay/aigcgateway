# Channel Management 重构单元测试用例

## 测试目标

为 `src/app/(console)/admin/models/page.tsx` 的重构版本准备单元测试用例，覆盖以下范围：

- 数据格式化与映射逻辑
- 页面初始化与接口请求
- 搜索、筛选、展开折叠等本地状态
- 频道编辑与同步相关交互
- 统计卡片与表格的数据聚合
- 异常数据与边界场景

## 测试环境假设

- 测试框架：Vitest 或 Jest
- 组件测试：React Testing Library
- API 调用：mock `apiFetch`
- 提示消息：mock `sonner.toast`
- i18n：mock `useTranslations`

## Mock 数据建议

建议至少准备以下四组数据夹具：

1. `fixture-minimal`
- 1 个 Provider
- 1 个 Model
- 1 个 ACTIVE Channel

2. `fixture-mixed-status`
- 2 个 Provider
- 含 ACTIVE / DEGRADED / DISABLED 三种 Channel 状态
- 含 `healthy / degraded / unknown` 三种 model health

3. `fixture-large-list`
- 单个 Provider 下超过 `MODELS_PER_PAGE` 条模型
- 用于验证分页前的 `show all` 行为

4. `fixture-edge-cases`
- `successRate = null`
- `latencyMs = null`
- `contextWindow = null`
- `sellPrice = null`
- `priority` 缺失边界值
- 空 Provider、空 models、空 channels

## 单元测试用例

### 1. 价格格式化

#### UT-001 `fmtPrice` 在空值时返回占位符
- 前置条件：传入 `null`
- 操作：调用 `fmtPrice(null)`
- 预期结果：返回 `—`

#### UT-002 `fmtPrice` 能正确格式化按次计费且价格为 0
- 前置条件：传入 `{ unit: "call", perCall: 0 }`
- 操作：调用 `fmtPrice`
- 预期结果：返回 `Free`

#### UT-003 `fmtPrice` 能正确格式化按次计费的非 0 价格
- 前置条件：传入 `{ unit: "call", perCall: 0.12 }`
- 操作：调用 `fmtPrice`
- 预期结果：返回 `$0.12/call`

#### UT-004 `fmtPrice` 能正确格式化按 token 计费
- 前置条件：传入 `{ unit: "token", inputPer1M: 2, outputPer1M: 8 }`
- 操作：调用 `fmtPrice`
- 预期结果：返回 `$2 / $8 /M`

#### UT-005 `fmtPrice` 在 token 价格都为 0 时返回 `Free`
- 前置条件：传入 `{ unit: "token", inputPer1M: 0, outputPer1M: 0 }`
- 操作：调用 `fmtPrice`
- 预期结果：返回 `Free`

### 2. 页面初始化与加载

#### UT-006 首次渲染时会请求 models-channels 数据
- 前置条件：mock `apiFetch`
- 操作：render 页面
- 预期结果：调用 `apiFetch("/api/admin/models-channels")`

#### UT-007 首次渲染时会请求 sync-status
- 前置条件：mock `apiFetch`
- 操作：render 页面
- 预期结果：调用 `apiFetch("/api/admin/sync-status")`

#### UT-008 加载中显示 loading 文案
- 前置条件：让接口 Promise 挂起
- 操作：render 页面
- 预期结果：页面出现 loading 状态

#### UT-009 加载完成后渲染 Provider 列表
- 前置条件：返回包含 Provider 的 fixture
- 操作：render 页面并等待完成
- 预期结果：Provider 名称、模型数、状态摘要可见

#### UT-010 `modality` 和 `search` 会拼入查询参数
- 前置条件：设置搜索词与 modality
- 操作：触发重新加载
- 预期结果：请求 URL 包含对应 query string

### 3. 搜索与筛选状态

#### UT-011 搜索输入改变后会更新本地状态并触发重新加载
- 前置条件：mock `apiFetch`
- 操作：输入搜索词
- 预期结果：输入框值更新，后续请求包含 `search`

#### UT-012 点击 modality 过滤按钮会更新选中态并触发重新加载
- 前置条件：页面已渲染
- 操作：点击 `TEXT` 或 `IMAGE`
- 预期结果：对应按钮进入选中状态，请求参数带上 `modality`

#### UT-013 切回 `all` 时会移除 modality 参数
- 前置条件：已选中某个 modality
- 操作：点击 `all`
- 预期结果：后续请求 URL 不再包含 `modality`

### 4. Provider 和 Model 展开折叠

#### UT-014 点击 Provider Header 可展开内容
- 前置条件：返回至少 1 个 Provider
- 操作：点击 Provider Header
- 预期结果：显示其下 models 列表

#### UT-015 再次点击 Provider Header 可收起内容
- 前置条件：Provider 已展开
- 操作：再次点击同一 Header
- 预期结果：models 列表消失

#### UT-016 点击 Model Row 可展开 channels
- 前置条件：Provider 已展开
- 操作：点击某个 Model Row
- 预期结果：该模型下 channel 卡片显示

#### UT-017 再次点击 Model Row 可收起 channels
- 前置条件：Model 已展开
- 操作：再次点击同一 Model Row
- 预期结果：channel 卡片隐藏

### 5. Show All 行为

#### UT-018 模型数量超过 `MODELS_PER_PAGE` 时显示 `show all`
- 前置条件：使用 `fixture-large-list`
- 操作：展开 Provider
- 预期结果：页面出现 `show all` 按钮

#### UT-019 点击 `show all` 后显示全部模型
- 前置条件：存在超过 20 个模型
- 操作：点击 `show all`
- 预期结果：渲染条目数大于默认上限，按钮消失或状态更新

#### UT-020 模型数量不超过 `MODELS_PER_PAGE` 时不显示 `show all`
- 前置条件：使用小数据集
- 操作：展开 Provider
- 预期结果：不出现 `show all` 按钮

### 6. Priority 编辑

#### UT-021 点击 Priority 标签后进入编辑态
- 前置条件：模型已展开
- 操作：点击 `P{priority}`
- 预期结果：显示输入框，初始值等于当前 priority

#### UT-022 输入有效 priority 并失焦后发送 PATCH 请求
- 前置条件：进入 priority 编辑态
- 操作：输入正整数并触发 `blur`
- 预期结果：调用 `PATCH /api/admin/channels/{id}`，body 包含 `priority`

#### UT-023 输入有效 priority 后按 Enter 也会保存
- 前置条件：进入 priority 编辑态
- 操作：输入新值并按 Enter
- 预期结果：发送 PATCH 请求

#### UT-024 priority 非法或小于等于 0 时不发送更新请求
- 前置条件：进入编辑态
- 操作：输入 `0`、负数或非法值后失焦
- 预期结果：不调用 PATCH，退出或重置编辑态

#### UT-025 priority 保存成功后显示成功提示并重新加载
- 前置条件：mock PATCH 成功
- 操作：保存 priority
- 预期结果：调用 `toast.success` 和 `load`

### 7. Sell Price 编辑

#### UT-026 点击 Sell 价格后进入编辑态
- 前置条件：channel 可见
- 操作：点击 Sell 价格
- 预期结果：显示价格输入框，初始值来自当前 sellPrice

#### UT-027 `unit=call` 时保存为 `{ perCall, unit: "call" }`
- 前置条件：channel 的 `sellPrice.unit` 为 `call`
- 操作：修改价格并保存
- 预期结果：PATCH body 使用按次计费结构

#### UT-028 非 `call` 时保存为 token 结构
- 前置条件：channel 的 `sellPrice.unit` 为 `token`
- 操作：修改价格并保存
- 预期结果：PATCH body 使用 `{ inputPer1M, outputPer1M, unit: "token" }`

#### UT-029 输入负数或非数字时不发送更新请求
- 前置条件：进入 sellPrice 编辑态
- 操作：输入非法值并失焦
- 预期结果：不调用 PATCH，退出编辑态

#### UT-030 Sell Price 保存成功后显示成功提示并重新加载
- 前置条件：mock PATCH 成功
- 操作：保存 sellPrice
- 预期结果：调用 `toast.success` 和 `load`

#### UT-031 `sellPriceLocked=true` 时显示锁定标识
- 前置条件：fixture 中存在锁定价格 channel
- 操作：render channel
- 预期结果：页面显示锁定图标或标识

### 8. Sync 行为

#### UT-032 点击 Sync 按钮会调用同步接口
- 前置条件：mock `POST /api/admin/sync-models`
- 操作：点击同步按钮
- 预期结果：发送 POST 请求

#### UT-033 同步过程中按钮进入 disabled/loading 态
- 前置条件：让同步请求挂起
- 操作：点击同步按钮
- 预期结果：按钮 disabled，文案显示 `syncing`

#### UT-034 同步成功后显示成功提示并刷新数据与 sync-status
- 前置条件：mock 同步成功
- 操作：点击同步按钮
- 预期结果：调用 `toast.success`、重新请求模型数据和 sync-status

#### UT-035 同步失败后显示错误提示
- 前置条件：mock 同步接口抛错
- 操作：点击同步按钮
- 预期结果：调用 `toast.error`

### 9. Footer 与 Sync Result

#### UT-036 `lastSyncTime` 存在时显示最后同步时间
- 前置条件：sync-status 返回 `lastSyncTime`
- 操作：render 页面
- 预期结果：Footer 显示最后同步时间文本

#### UT-037 `lastSyncTime` 不存在时不显示时间信息
- 前置条件：sync-status 返回空值
- 操作：render 页面
- 预期结果：Footer 不显示该字段

#### UT-038 `lastSyncResult` 存在时显示同步摘要
- 前置条件：sync-status 返回 `lastSyncResult`
- 操作：render 页面
- 预期结果：显示新增、禁用、失败 provider 统计

#### UT-039 有失败 provider 时逐条显示错误信息
- 前置条件：`providers` 中存在 `success=false`
- 操作：render 页面
- 预期结果：失败 provider 名称和错误原因可见

### 10. 边界与异常数据

#### UT-040 `successRate=null` 时显示占位符且进度条宽度安全
- 前置条件：channel `successRate = null`
- 操作：render channel
- 预期结果：文本显示 `—`，进度条不会出现非法宽度

#### UT-041 `latencyMs=null` 时显示占位符
- 前置条件：channel `latencyMs = null`
- 操作：render channel
- 预期结果：显示 `—`

#### UT-042 `contextWindow=null` 时显示占位符
- 前置条件：model `contextWindow = null`
- 操作：render model
- 预期结果：显示 `—`

#### UT-043 未知 provider 名称时使用兜底缩写和默认颜色
- 前置条件：Provider 不在 `PROVIDER_COLORS / PROVIDER_ABBR` 中
- 操作：render Provider
- 预期结果：使用默认颜色与 displayName 前两位缩写

#### UT-044 未知 healthStatus 时不会导致渲染崩溃
- 前置条件：传入异常 `healthStatus`
- 操作：render model
- 预期结果：页面不崩溃，必要时走兜底展示

#### UT-045 空数据集时页面稳定
- 前置条件：`/api/admin/models-channels` 返回空数组
- 操作：render 页面
- 预期结果：页面不报错，展示空状态或空列表

## 开发后优先执行的核心用例

建议开发完成后优先落地以下 12 条自动化用例：

- UT-001
- UT-004
- UT-006
- UT-007
- UT-010
- UT-014
- UT-016
- UT-022
- UT-027
- UT-032
- UT-034
- UT-040

## 风险与备注

- 当前页面的部分格式化逻辑写在组件文件内部，若重构后提取为独立 helper，建议优先补纯函数测试。
- 若重构引入 `StatsCards`、`GlobalModelMatrix`、`priority -> level` 映射、聚合指标计算，应追加对应纯函数单测。
- 若开发阶段新增 hook 或拆分子组件，建议每个子组件至少保留 1 条渲染用例和 1 条关键交互用例。

## 产物路径

- 本文档：`docs/test-reports/channel-management-unit-test-cases.md`

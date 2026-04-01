# API Keys 前端测试用例

## 测试目标

- 验证 `docs/api-keys-frontend-spec.md` 定义的 API Keys 前端重构结果
- 覆盖本期范围内功能：
  - `src/app/(console)/keys/page.tsx`
  - Create API Key Modal
- 明确排除项：
  - `src/app/(console)/keys/[id]/page.tsx`
  - 该页在前端规格书中标注为“暂不实现，待后端就绪后实施”

## 测试环境

- 本地 Codex 测试环境
- 端口：`3099`
- 账号：`admin@aigc-gateway.local / admin123`

## 前置条件

- 本地测试环境已通过 `bash scripts/test/codex-setup.sh` 初始化
- 已有可登录用户
- 允许在本地测试环境中创建项目和 API Key 测试数据

## 用例列表

### TC-001 页面可访问

- 目标：确认 `/keys` 页面能正常进入
- 步骤：
  1. 登录控制台
  2. 进入 `/keys`
- 预期：
  - 页面返回 `200`
  - 页面标题显示 API Keys
  - 无白屏、无未处理报错

### TC-002 空项目场景边界

- 目标：确认无项目时页面边界行为正确
- 步骤：
  1. 使用无项目账号进入 `/keys`
- 预期：
  - 不直接报错
  - 出现创建项目相关空状态

### TC-003 页面骨架与原型主结构

- 目标：验证列表页主结构与规格书一致
- 步骤：
  1. 准备至少 1 个项目和若干 API Key
  2. 打开 `/keys`
- 预期：
  - 可见 Header 区
  - 可见 3 张 Stats Cards
  - 可见 Key Management Table
  - 可见 Security Best Practices
  - 可见 Footer
  - 可见右下角 FAB

### TC-004 文案与 i18n 基本渲染

- 目标：验证新增 `keys` 文案键已接入
- 步骤：
  1. 打开 `/keys`
  2. 检查标题、副标题、表头、按钮、最佳实践区文案
- 预期：
  - 不出现明显缺失 key 文本
  - 标题和表头文案符合规格书

### TC-005 列表数据渲染

- 目标：验证 `/api/projects/:id/keys` 数据已正确映射到表格
- 步骤：
  1. 准备至少 3 条 API Key 数据
  2. 打开 `/keys`
- 预期：
  - `name` 渲染为主标题
  - 当前 project name 渲染为副标题
  - `maskedKey` 正常显示
  - `createdAt` 正常格式化
  - `lastUsedAt` 为空时显示 `Never`
  - `status` 正常显示 ACTIVE / REVOKED

### TC-006 搜索

- 目标：验证表头搜索框的前端过滤
- 步骤：
  1. 输入可命中的 key 名称片段
  2. 输入不可命中的关键词
- 预期：
  - 命中时仅展示匹配项
  - 不命中时显示空结果状态
  - 搜索后页码重置到第一页

### TC-007 分页

- 目标：验证前端分页
- 步骤：
  1. 准备超过 `5` 条 key 数据
  2. 检查分页按钮并切换页码
- 预期：
  - 每页最多显示 `5` 条
  - Prev / Next 正常工作
  - 页码按钮状态正确
  - Footer 正确显示 `Showing {count} of {total}`

### TC-008 CTA 卡片打开创建弹窗

- 目标：验证 Quick Action CTA
- 步骤：
  1. 点击卡片内 `Create Key`
- 预期：
  - 打开 Create Modal
  - 进入创建表单态

### TC-009 FAB 打开创建弹窗

- 目标：验证右下角 FAB
- 步骤：
  1. 点击右下角 `+` FAB
- 预期：
  - 打开 Create Modal

### TC-010 Create Modal 表单结构

- 目标：验证弹窗结构与本期范围
- 步骤：
  1. 打开 Create Modal
  2. 检查表单字段与按钮
- 预期：
  - 可见 Key Name 输入框
  - Description 为 disabled 且带 `Coming Soon`
  - Expiration 为 disabled
  - Permissions 为 disabled 展示态
  - 可见安全提示
  - 可见 Cancel / Create Key 按钮

### TC-011 成功创建 Key

- 目标：验证创建主链路
- 步骤：
  1. 输入 Key Name
  2. 提交创建
- 预期：
  - 请求成功
  - 弹窗切换到成功态
  - 展示完整 Key 且提示仅展示一次
  - 列表刷新并新增一条 key

### TC-012 成功态复制 Key

- 目标：验证成功态复制功能
- 步骤：
  1. 在创建成功态点击复制按钮
- 预期：
  - 调用剪贴板写入
  - 出现 copied 类成功反馈

### TC-013 列表复制按钮行为

- 目标：验证列表行复制按钮行为
- 步骤：
  1. 在 ACTIVE key 行点击复制按钮
- 预期：
  - 按当前实现发生复制动作
  - 出现成功反馈

### TC-014 撤销 Key

- 目标：验证 revoke 主链路
- 步骤：
  1. 在 ACTIVE 行点击 block 图标
  2. 在确认弹窗中确认
- 预期：
  - DELETE 请求成功
  - 该 key 状态变为 REVOKED
  - 行操作按钮切换为 REVOKED 态

### TC-015 REVOKED 行操作态

- 目标：验证 REVOKED 行展示
- 步骤：
  1. 准备至少 1 条 REVOKED 数据
  2. 检查该行展示
- 预期：
  - 状态显示 REVOKED
  - access key 区域置灰
  - 不再显示 ACTIVE 行的复制按钮与 block 图标

### TC-016 编辑页边界

- 目标：验证本期范围边界
- 步骤：
  1. 检查 ACTIVE 行 edit 操作
  2. 检查是否存在 `/keys/[id]` 页面
- 预期：
  - 若未实现导航或详情页，不计入本期前端规格失败
  - 仅记录为“规格书明确延后”的未实现项

## 结果记录要求

- 每条用例记录：
  - 实际结果
  - 是否通过
  - 若失败，附复现步骤与证据

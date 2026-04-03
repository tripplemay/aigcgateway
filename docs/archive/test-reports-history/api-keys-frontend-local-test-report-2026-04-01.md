# API Keys 前端本地测试报告

## 测试目标

- 验证 Claude 按 `docs/api-keys-frontend-spec.md` 完成的 API Keys 前端重构结果
- 覆盖本期范围：
  - `src/app/(console)/keys/page.tsx`
  - Create API Key Modal
- 边界确认：
  - `src/app/(console)/keys/[id]/page.tsx` 不在本期实现范围内

## 测试环境

- 环境：本地 Codex 测试环境
- 端口：`3099`
- 启动方式：
  1. 先执行 `bash scripts/test/codex-setup.sh`
  2. 发现脚本退出后 `3099` 服务未稳定留存
  3. 改为手动以前台方式启动本地服务继续验证
- 浏览器：Chrome MCP

## 测试数据

- 管理员账号：`admin@aigc-gateway.local / admin123`
- 本地测试项目：
  - `Codex API Keys QA Project`
- 初始 API Key 测试数据：
  - `Alpha Gateway`
  - `Beta Staging`
  - `Gamma Batch`
  - `Delta Readonly`
  - `Epsilon Mobile`
  - `Zeta Internal`
- UI 测试中新增：
  - `UI Created Key`
- 空状态边界账号：
  - `codex-apikey-empty-1775042395@example.com`

## 执行步骤概述

1. 初始化本地测试数据库、迁移、seed、build
2. 以管理员账号创建测试项目和 6 条初始 Key
3. 使用 Chrome MCP 打开 `/keys`
4. 验证页面结构、列表映射、搜索、分页、Create Modal、创建、复制、撤销
5. 使用无项目账号验证空状态

## 通过项

- 页面可访问：
  - `GET /keys` 返回 `200`
  - 静态资源恢复后页面可正常渲染
- 页面主结构通过：
  - Header
  - 3 张 Stats Cards
  - Key Management Table
  - Security Best Practices
  - Footer
  - FAB
- 数据映射通过：
  - 名称、项目名、掩码 key、创建时间、`Never`、状态 badge 均正常显示
- 搜索命中通过：
  - 输入 `Gamma` 后仅显示 `Gamma Batch`
- 搜索空结果通过：
  - 输入不存在关键词后显示 `No keys found`
- 分页通过：
  - 每页最多 `5` 条
  - 第 2 页正确显示剩余数据
- Create Modal 结构通过：
  - Key Name 可编辑
  - Description / Expiration / Permissions 为 disabled
  - `Coming Soon` 显示正常
  - 警告文案存在
- 创建主链路通过：
  - 使用 UI 成功创建 `UI Created Key`
  - 成功态展示完整 key
  - 成功 toast 显示
  - 列表总数由 `6 / 6 keys` 变为 `7 / 7 keys`
- 成功态复制通过：
  - 点击复制按钮后出现“已复制！” toast
- 撤销主链路通过：
  - 吊销确认弹窗出现
  - 确认后状态切换为 `REVOKED`
  - 列表统计变为 `6 / 7 keys`
  - REVOKED 行操作切换为 `history / delete`
- 空状态边界通过：
  - 无项目账号进入 `/keys` 时显示空状态
  - 可见“暂无项目”与“创建项目”

## 失败项

### FAIL-001 清空搜索框后列表不恢复

- 复现步骤：
  1. 在 `/keys` 搜索框输入 `NoSuchKey`
  2. 页面显示 `No keys found`
  3. 将搜索框清空
- 实际结果：
  - 搜索框为空后，列表仍停留在 `No keys found`
  - 需要手动刷新页面才能恢复列表
- 预期结果：
  - 搜索框清空后应立即恢复完整列表
- 严重级别：中

### FAIL-002 ACTIVE 行 edit 按钮无行为

- 复现步骤：
  1. 在 ACTIVE key 行点击 `edit`
- 实际结果：
  - 页面无跳转
  - 无弹窗
  - 无任何可见反馈
- 预期结果：
  - 至少应有明确处理：
    - 若本期不支持详情页，应隐藏/禁用该按钮
    - 若按交互规格，应跳转到 `/keys/:id`
- 严重级别：中

### FAIL-003 列表复制按钮复制的是掩码值，不是可用 Key

- 复现步骤：
  1. 在 ACTIVE key 行点击 `content_copy`
  2. 读取浏览器剪贴板
- 实际结果：
  - 剪贴板内容为 `pk_f83eb...****`
  - 这是掩码字符串，不是可用于调用的真实 API Key
- 预期结果：
  - 若提供复制按钮，应复制有实际用途的值
  - 若后端列表接口只返回掩码，则不应提供误导性的“复制密钥”行为
- 严重级别：中

## 风险项

### RISK-001 本地测试脚本未能稳定保活服务

- `codex-setup.sh` / `codex-restart.sh` 执行后，`3099` 服务没有稳定留存
- 继续测试时需要手动以前台方式启动服务
- 该问题影响本地回归效率，但不直接证明产品页面缺陷

### RISK-002 终端代理会干扰本地测试结论

- 当前 shell 存在 `http_proxy=http://127.0.0.1:7897`
- 若未显式使用 `--noproxy '*'`，对 `localhost:3099` 的请求会被代理拦截并返回 `502`
- 已在本次接口验证中规避

### RISK-003 详情页能力仍未就绪

- 前端规格书已写明 `keys/[id]/page.tsx` 待后端就绪后实施
- 当前页面中仍保留了 `edit` 按钮
- 这会让用户误以为详情编辑已可用

## 证据

- 测试用例文件：
  - `docs/test-reports/api-keys-frontend-test-cases-2026-04-01.md`
- 本地接口验证：
  - `POST /api/auth/login`
  - `POST /api/projects`
  - `GET /api/projects/:id/keys`
  - `POST /api/projects/:id/keys`
  - `DELETE /api/projects/:id/keys/:keyId`
- 浏览器页面：
  - `http://127.0.0.1:3099/keys`
  - Chrome MCP 页面快照

## 最终结论

本轮本地验收结论：**部分通过**。

- API Keys 页面主结构、列表渲染、分页、Create Modal、创建、成功态复制、撤销、空状态都已验证通过
- 但存在 3 个明确问题：
  - 清空搜索后列表不恢复
  - ACTIVE 行 edit 按钮无行为
  - 列表复制按钮复制的是掩码值

因此，当前实现不能判定为“已完全通过前端规格书验收”。

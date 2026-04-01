# API Keys 外网手工验收报告

## Summary

- Scope:
  - 外网环境验证 `docs/api-keys-frontend-spec.md` 定义的 API Keys 页面重构结果
  - 覆盖本期范围：`/keys` 列表页与 Create API Key Modal
  - 排除项：`/keys/[id]` 详情编辑页
- Documents:
  - `docs/api-keys-frontend-spec.md`
  - `design-draft/API Keys (Framework Aligned) - AIGC Gateway/code.html`
  - `docs/test-reports/api-keys-frontend-test-cases-2026-04-01.md`
- Environment:
  - 站点：`https://aigc.guangai.ai`
  - 执行时间：`2026-04-01 23:11:04 CST` 起
  - 浏览器：Chrome MCP
  - 生产测试开关：`PRODUCTION_STAGE=RND` / `PRODUCTION_DB_WRITE=ALLOW` / `HIGH_COST_OPS=ALLOW`
  - 本轮测试账号：`codex.apikeys.20260401.2312@example.com`
  - 本轮测试项目：`Codex API Keys External QA 20260401`
- Result totals:
  - PASS: 10
  - FAIL: 1
  - NOT RUN: 0
  - BLOCKED: 0

## 覆盖摘要

- 已覆盖：
  - 未登录访问重定向到 `/login`
  - 空项目边界
  - 页面主结构与文案
  - CTA 卡片与 FAB 打开创建弹窗
  - Create Modal 表单结构和 disabled 字段
  - 创建 API Key 主链路
  - 成功态复制
  - 搜索命中与空结果
  - 分页
  - 撤销与 REVOKED 行展示
- 未覆盖：
  - `/keys/[id]` 详情页，不在本期范围

## Test Cases

- TC-001 未登录访问路由守卫 - PASS
  - Requirement Source: `docs/api-keys-frontend-spec.md`
  - Preconditions: 无登录态
  - Steps:
    1. 直接访问 `https://aigc.guangai.ai/keys`
  - Expected Result:
    - 页面跳转到 `/login`
    - 不出现白屏或未处理异常
  - Result: PASS
  - Evidence:
    - 浏览器跳转到 `https://aigc.guangai.ai/login`

- TC-002 空项目边界 - PASS
  - Requirement Source: `docs/test-reports/api-keys-frontend-test-cases-2026-04-01.md`
  - Preconditions: 新注册账号，无项目
  - Steps:
    1. 登录新账号
    2. 访问 `/keys`
  - Expected Result:
    - 显示创建项目空状态
    - 不直接报错
  - Result: PASS
  - Evidence:
    - 页面显示 `暂无项目`、`创建项目`

- TC-003 页面主结构与文案 - PASS
  - Requirement Source: `docs/api-keys-frontend-spec.md`
  - Preconditions: 已创建项目
  - Steps:
    1. 在空状态弹窗中创建项目
    2. 返回 `/keys`
  - Expected Result:
    - Header、3 张 Stats Cards、Key Table、Security Best Practices、Footer、FAB 均可见
    - 文案与规格一致，无 i18n key 泄漏
  - Result: PASS
  - Evidence:
    - 截图：`docs/test-reports/api-keys-production-2026-04-01-list.png`

- TC-004 CTA 打开 Create Modal - PASS
  - Requirement Source: `docs/api-keys-frontend-spec.md`
  - Preconditions: 已进入 `/keys`
  - Steps:
    1. 点击 Quick Action 卡片内 `创建密钥`
  - Expected Result:
    - 打开 Create Modal
  - Result: PASS
  - Evidence:
    - 截图：`docs/test-reports/api-keys-production-2026-04-01-modal.png`

- TC-005 FAB 打开 Create Modal - PASS
  - Requirement Source: `docs/api-keys-frontend-spec.md`
  - Preconditions: 列表页已加载
  - Steps:
    1. 在列表页第 2 页点击右下角 FAB
  - Expected Result:
    - 打开同一 Create Modal
  - Result: PASS
  - Evidence:
    - FAB 点击后出现 `创建新 API 密钥`

- TC-006 Create Modal 结构与 disabled 字段 - PASS
  - Requirement Source: `docs/api-keys-frontend-spec.md`
  - Preconditions: Create Modal 已打开
  - Steps:
    1. 检查 `密钥名称`
    2. 检查 `描述`、`过期时间`、`权限`
    3. 检查安全警示和按钮区
  - Expected Result:
    - `描述`、`过期时间`、`权限` 为 disabled/展示态
    - `即将推出` 文案可见
    - 有安全警示、取消、创建按钮
  - Result: PASS
  - Evidence:
    - 截图：`docs/test-reports/api-keys-production-2026-04-01-modal.png`

- TC-007 创建 API Key 主链路 - PASS
  - Requirement Source: `docs/api-keys-frontend-spec.md`
  - Preconditions: Create Modal 已打开
  - Steps:
    1. 输入 `UI External Key 01`
    2. 点击 `创建密钥`
  - Expected Result:
    - 创建成功
    - 成功态展示完整 key，且提示仅显示一次
    - 列表计数同步更新
  - Result: PASS
  - Evidence:
    - 成功态出现完整 `pk_...`
    - 列表统计更新为 `1 / 1 keys`

- TC-008 成功态复制 - PASS
  - Requirement Source: `docs/api-keys-frontend-spec.md`
  - Preconditions: 创建成功态已出现
  - Steps:
    1. 点击成功态复制按钮
    2. 读取浏览器剪贴板
  - Expected Result:
    - 出现成功反馈
    - 剪贴板中为完整 key
  - Result: PASS
  - Evidence:
    - Toast：`已复制！`
    - 剪贴板读取到完整 `pk_4888064515bbd9a181746a013a2a73749ef5596c21046cbd0ea7add61c16f9a2`

- TC-009 搜索命中与分页 - PASS
  - Requirement Source: `docs/api-keys-frontend-spec.md`
  - Preconditions: 测试项目内已有 10 条 key
  - Steps:
    1. 在搜索框输入 `Gamma`
    2. 清空后刷新页面
    3. 点击 `下一页`
  - Expected Result:
    - 搜索只保留命中项
    - 分页每页最多 5 条
    - 第 2 页展示剩余数据
  - Result: PASS
  - Evidence:
    - 搜索结果显示 `显示 2 / 2 条`
    - 分页结果显示 `显示 5 / 10 条`

- TC-010 撤销与 REVOKED 行展示 - PASS
  - Requirement Source: `docs/api-keys-frontend-spec.md`
  - Preconditions: 第 2 页存在 ACTIVE key
  - Steps:
    1. 点击 `UI External Key 01` 行的 `block`
    2. 在确认弹窗中点击 `吊销`
  - Expected Result:
    - 删除请求成功
    - 统计更新
    - 该行状态变为已吊销，操作区切换为 `history / delete`
  - Result: PASS
  - Evidence:
    - `DELETE /api/projects/cmng6ta6x038lrnkelkmltktg/keys/cmng6ug9v038srnke00xbdgu1` -> `200`
    - 页面统计更新为 `9 / 10 keys`
    - 行状态显示 `已吊销`

- TC-011 搜索无结果后清空不恢复 - FAIL
  - Requirement Source: `docs/test-reports/api-keys-frontend-test-cases-2026-04-01.md`
  - Preconditions: 列表页已加载，存在数据
  - Steps:
    1. 搜索 `NoSuchKey`
    2. 页面出现 `No keys found`
    3. 将搜索框清空
  - Expected Result:
    - 清空后应立即恢复默认列表结果
  - Result: FAIL
  - Observed Behavior:
    - 输入框已清空
    - 页面仍停留在 `No keys found`
    - 需要刷新页面才恢复列表
  - Evidence:
    - 截图：`docs/test-reports/api-keys-production-2026-04-01-search-clear-failed.png`

## Defects

- [Medium] 搜索无结果后清空输入框，列表不恢复
  - Impact:
    - 用户从空结果回到默认列表需要手动刷新，破坏列表筛选基本可用性
  - Reproduction:
    1. 进入 `/keys`
    2. 搜索 `NoSuchKey`
    3. 待出现 `No keys found`
    4. 清空输入框
  - Actual:
    - 列表不恢复
  - Expected:
    - 立即恢复默认分页列表
  - Evidence:
    - `docs/test-reports/api-keys-production-2026-04-01-search-clear-failed.png`

## 风险项

- 控制台有 1 条非阻塞前端错误
  - `GET https://aigc.guangai.ai/favicon.ico` -> `404`
  - 当前不影响 API Keys 页面主功能，但属于静态资源缺口
- 本轮为完成分页与列表验证，在一次性测试项目中创建了多条测试 key，并吊销了其中 1 条
  - 范围限定在本轮新注册账号和新建项目内
  - 未触及其它真实用户数据

## Open Questions

- 规格书将详情页排除在本期范围，但列表仍保留 disabled `edit` 按钮。
  - 当前行为不算本轮失败项。
  - 仍建议产品/前端确认是否继续保留此占位交互。

## 证据文件

- 截图：
  - `docs/test-reports/api-keys-production-2026-04-01-modal.png`
  - `docs/test-reports/api-keys-production-2026-04-01-list.png`
  - `docs/test-reports/api-keys-production-2026-04-01-search-clear-failed.png`

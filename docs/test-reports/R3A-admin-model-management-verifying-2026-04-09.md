# R3A 验收报告（verifying）

- 批次：`R3A-admin-model-management`
- 日期：`2026-04-09`
- Evaluator：`Reviewer (Codex)`
- 环境：L1 本地（`http://localhost:3099`，`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`）

## 测试目标
验证 `F-R3A-07` 验收标准，并回归检查 `F-R3A-01 ~ F-R3A-06` 的关键行为：
1. 5 个 admin 页面正常加载无报错
2. DS 组件形态正确（表格/筛选/卡片/对话框结构存在）
3. CRUD 正常（启用/禁用、配置编辑、别名增删）
4. 中英文切换无残留

## 执行范围与方法
- 页面加载/结构：浏览器实测
  - `/admin/models`
  - `/admin/model-whitelist`
  - `/admin/model-capabilities`
  - `/admin/model-aliases`
  - `/admin/providers`
- CRUD：Admin API 实测 + 回滚
  - `PATCH /api/admin/models/:id`（enabled toggle）
  - `PATCH /api/admin/providers/:id`（status toggle）
  - `GET/PATCH /api/admin/providers/:id/config`
  - `POST/DELETE /api/admin/model-aliases`
- i18n：页面右上角 `CN` 切换后检查 admin 区文案

## 通过项
- P1：5 个 admin 页面均可打开，未出现运行时崩溃或 5xx 页面。
- P2：关键 DS 结构存在（header + stats/table/filter/search/dialog/card 等）。
- P3：CRUD 主链路通过，详见证据文件：
  - `docs/test-reports/R3A-admin-model-management-crud-api-2026-04-09.json`

## 失败项
- F1（FAIL，关联 `F-R3A-06`）：中文切换后 `/admin/providers` 仍存在明显英文残留，不满足“切换中文后无英文残留”。
  - 复现步骤：
    1. 登录 admin
    2. 打开 `/admin/providers`
    3. 点击顶部语言切换 `CN`
  - 实际结果（示例）：
    - 副标题仍为 `Manage AI service providers, endpoints, and configurations.`
    - 表头存在 `CHANNELS`
    - 区块文案存在 `Operational Status` / `View Status Page` / `active / total providers operational`
  - 预期结果：中文模式下页面 UI 文案应为中文（业务数据名词除外）。

## 风险项
- R1：`scripts/test/_archive_2026Q1Q2/p4-1c-admin-pages-e2e-2026-04-08.ts` 在当前库环境执行失败（`models.supportedSizes` 列缺失），本轮改用页面+API 实测覆盖验收点。该问题不阻塞本次结论，但需后续统一脚本与测试库 schema。

## 结论
- 本轮结论：`未通过`
- 建议状态流转：`verifying -> fixing`
- 建议待修复后进入 `reverifying`。

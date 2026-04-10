# N1 UI Navigation Polish — Signoff (2026-04-10)

## 结论
- 批次：`N1-ui-navigation-polish`
- 阶段：`reverifying -> done`
- 结果：**PASS / 签收通过**

## 本轮复验范围
1. Save 按钮关键阻断链路（Settings Project tab）
2. Sidebar 分组与 Docs 入口
3. Topbar 旧文档链接移除
4. Keys 页面精简（无顶部统计卡，创建按钮在表格区）
5. i18n 抽查（CN/EN）

## 核心证据
- 严格环境流程已执行：
  - `git pull --ff-only origin main`
  - `rm -rf .next`
  - `npm run build`
  - `bash scripts/test/codex-setup.sh`
  - `bash scripts/test/codex-wait.sh`
- E2E 脚本（用户提供）执行结果：
  - `npx tsx scripts/test/n1-save-verify.ts`
  - 输出：`=== PASS ===`
  - 关键断言通过：点击 Save 后发出 `PATCH /api/projects/:id`，并可通过 API 读到更新后的名称
- UI 抽查结果：
  - Sidebar 存在 Core/Develop/Data/Model Mgmt/Operations/Users 分组
  - Docs 入口在 Sidebar，`/docs` 可访问
  - Topbar 无 Documentation/API Reference/Support
  - `/keys` 无旧统计卡，创建按钮在列表标题区域
  - CN 文案抽查正常（侧栏分组、Docs、Keys、Settings）

## 风险备注
- 本轮对 DS token 一致性采用视觉/结构抽查，未做像素级比对。

## 签收意见
- N1 验收项满足，解除阻断，批次可置 `done`。

# project-switcher-ui Local Verification 2026-04-07

## 1. 检查范围
- 批次：`project-switcher-ui`（F-PS-01~06）
- 关注功能：ProjectProvider Context、Sidebar 项目切换、新建项目自动选中、余额展示、刷新持久化
- 运行环境：macOS + `bash scripts/test/codex-setup.sh` 本地 L1 服务（http://localhost:3099）

## 2. 输入材料与脚本
- 规格/验收：`features.json` F-PS-01~06、`docs/test-cases/project-switcher-ui-local-test-cases-2026-04-07.md`
- 自动化脚本：`tests/e2e/project-switcher.spec.ts`（Playwright + WebKit）
- 报告产物：`docs/test-reports/project-switcher-ui-playwright-report.json`

## 3. 测试方法
1. 启动测试环境：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
2. 通过 API 注册临时账号 → Playwright 在 Web 控制台完成：
   - 空态创建首个项目并校验 localStorage/project 列表（PS-L1-01）
   - 新建第二个项目，admin 充值项目 A，项目 B 保持空；比对 Sidebar dropdown + Dashboard/Keys/Actions（PS-L1-02）
   - 切换项目后刷新页面两次，验证 localStorage 记忆（PS-L1-03）
3. 关键断言：Sidebar 高亮、`/keys`/`/actions` 列表内容、钱包余额 `$25.00` vs `$0.00`、刷新后 `projectId` 持久化

## 4. 结果总览
| 场景 | 结果 | 证据 |
| --- | --- | --- |
| PS-L1-01 创建项目自动选中 | PASS | Playwright 日志（`docs/test-reports/project-switcher-ui-playwright-report.json` step `selectProject`）
| PS-L1-02 项目下拉切换 + 数据隔离 + 余额更新 | PASS | `tests/e2e/project-switcher.spec.ts` 断言 `API Keys`/`Actions` 文案与余额 `$25.00 → $0.00`
| PS-L1-03 刷新后保持选中项目 | PASS | 测试脚本 `assertSelection` 针对项目 A/B 切换后的 `localStorage.projectId`

## 5. 发现与结论
- 本轮 L1 验证全通过，未复现生成端提出的“创建后不切换”“余额不同步”问题。
- Sidebar dropdown 的 UI 行为、CreateProjectDialog 的 `onCreated → refresh + auto-select`、`localStorage.projectId` 落盘均符合预期。
- 无新增缺陷，F-PS-06 可记为 PASS，批次可进入 signoff。

## 6. 后续建议
- 若后续在 Staging/L2 需要真实 Provider 验证余额或 Actions/Keys API，可复用本脚本（通过 `BASE_URL` 环境变量指向对应环境）。

# bugfix-fork-and-project-switch Signoff 2026-04-10

> 状态：**Evaluator 验收通过（verifying）**
> 触发：F-BF-01 / F-BF-02 修复完成后执行 F-BF-03 验收，结果全 PASS。

---

## 测试环境
- 本地 L1：`http://localhost:3099`
- 启动方式：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- 验收脚本：`scripts/test/bf-fork-project-switch-verifying-e2e-2026-04-10.ts`
- 结果文件：`docs/test-reports/bf-fork-project-switch-verifying-e2e-2026-04-10.json`

## 结果摘要
- PASS：4
- FAIL：0

## 验收项
- AC1（PASS）：fork 公共模板后，拷贝到目标项目的 Action 均设置 `activeVersionId`，且在版本列表中可解析。
- AC1-UI（PASS）：Action 详情页按 `activeVersionId` 渲染活跃版本区块。
- AC2（PASS）：项目切换器执行 `select(p.id)` 后跳转 `/dashboard`，并以 `current project` 触发 Dashboard 数据重拉。
- AC3（PASS）：`/v1/models` 冒烟通过。

## 结论
本批次通过验收，准予签收，状态可流转至 `done`。

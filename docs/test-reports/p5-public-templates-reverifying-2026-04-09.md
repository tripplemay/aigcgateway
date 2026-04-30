# P5 Public Templates Reverifying Report (2026-04-09)

## 测试目标

- 对 P5 修复后的版本执行复验（reverifying）。
- 重点复核上轮失败项：DS token 审计与 i18n 残留。

## 测试环境

- L1 Local：`http://localhost:3099`
- 启动：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- 执行脚本：
  - `BASE_URL=http://localhost:3099`
  - `OUTPUT_FILE=docs/test-reports/p5-public-templates-reverifying-e2e-2026-04-09.json`
  - `npx tsx scripts/test/_archive_2026Q1Q2/p5-public-templates-verifying-e2e-2026-04-09.ts`

## 结果概览

- 结论：**FAIL（回退 fixing）**
- 自动化步骤：7
- 通过：6
- 失败：1
- 证据：`docs/test-reports/p5-public-templates-reverifying-e2e-2026-04-09.json`

## 通过项

1. 公共模板链路（Admin 标记 → User 列表/详情/fork）通过。
2. fork 深拷贝完整性通过。
3. 私有模板 fork 404 通过。
4. MCP tools（list_public_templates / fork_public_template）通过。
5. UI 结构抽检通过。
6. DS token 审计通过（`legacy=0, hardcodedColor=0`）。

## 失败项

1. i18n 审计未完全通过（AC7）
   - 审计结果：`keys=true, hardcoded=detail-drawer.mode-suffix`
   - 证据：
     - [template-detail-drawer.tsx](/Users/yixingzhou/project/aigcgateway/src/app/(console)/templates/template-detail-drawer.tsx:33) 仍拼接硬编码后缀 `Mode`

## 状态机回写

- `progress.json.status`：`reverifying` → `fixing`
- 回退 `pending`：
  - `F-P5-06`（i18n）
  - `F-P5-07`（全量验收）
- `docs.signoff` 保持 `null`

# BL-MCP-PAGE-REVAMP 验收失败报告（2026-04-28）

- 批次：BL-MCP-PAGE-REVAMP
- 阶段：verifying
- 结论：PARTIAL（1 项未通过）
- 证据目录：`docs/test-reports/artifacts/bl-mcp-page-revamp-2026-04-28-codex-verifying/`

## 已通过
1. 静态：`tsc` / `build` / `vitest` 全 PASS（`554 tests`）
2. API：`GET /api/mcp/tools` 返回 29 条，字段完整（`name/category/descriptionKey/icon`）
3. API：`embed_text` 存在于 registry，category=`ai_call`
4. 页面：`/mcp-setup` 展示 7 个 category 且每组有 tools
5. 页面：步骤顺序为 Step 1/Step 2，无 Step 3 错位
6. 页面：`embed_text` 显示在“AI 调用”分组
7. 页面：每个 category 均有 example prompt 区块
8. Try-it：下拉仅 4 个安全 tool（`list_models/get_balance/get_usage_summary/embed_text`）
9. Try-it：`get_balance`、`get_usage_summary` 复用项目接口可正常返回 JSON
10. Try-it：`embed_text` 错误处理正常（可显示错误信息，不崩溃）

## 未通过
1. F-MR-05 #11（Try-it embed_text 成功返回 1024 维）FAIL
- 复现：
  1) 登录 `admin@aigc-gateway.local`，进入 `/mcp-setup`
  2) 在 Step 1 输入有效本地 API Key（本轮创建：`pk_62c99...`）
  3) Try-it 选择 `embed_text`，输入 `hello`，点击“运行”
- 实际：响应区返回错误（本轮为 `Insufficient balance`；此前为 `Invalid API key`）
- 期望：返回 `dimensions=1024` + 向量前 5 维

## 判定
- 该失败直接阻断 F-MR-05 全 PASS，因此本轮不签收，状态应回 `fixing`。
- 说明：其余功能（动态 registry / 分组 / i18n / 页面结构 / try-it 面板本身）已落地并可验证。

# mcp-dx-round2 Local Signoff 2026-04-06

## 测试目标
验证 `mcp-dx-round2` 批次的 MCP DX 相关变更，重点覆盖 F-DX2-10（E2E + 错误场景）。

## 测试环境
- 环境：本地 L1（`http://localhost:3099`）
- 启动方式：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- 测试脚本：`scripts/test/mcp-dx-round2-e2e-2026-04-06.ts`
- 结果文件：`docs/test-reports/mcp-dx-round2-local-e2e-2026-04-06.json`

## 测试范围
- `list_models` 去重与输出质量门禁（数量、重复、capabilities、价格噪音）
- MCP Tools 总数与可调用性（13 个）
- 新增工具：
  - `get_action_detail`
  - `get_template_detail`
- `generate_image` Tool 描述中的模型尺寸说明
- 错误场景：余额不足、模型不存在、参数类型错误、rate limit

## 执行步骤概述
1. 启动本地测试环境并等待 3099 就绪。
2. 以测试用户创建 project/key，创建 action/template 测试数据。
3. 执行脚本对 13 个 MCP 工具进行 smoke + 关键断言。
4. 执行四类错误场景并校验错误信息可读性。
5. 输出 JSON 证据并汇总结论。

## 通过项
- `tools/list` 返回工具总数 13，且包含所有目标工具。
- `list_models` 默认去重通过，大小写重复校验通过。
- `list_models(show_all_channels=true)` 返回 channels 信息。
- `get_action_detail` 返回 activeVersion.messages / variables / versions。
- `get_template_detail` 返回 executionMode、steps、reservedVariables。
- `generate_image` description 含模型尺寸说明（`1024x1024`、`1536x1024`、`1792x1024` 等）。
- 错误场景 4/4 全部返回清晰错误信息。

## 失败项
- 无。

## 风险项
- 本次为 L1 本地验收，AI 上游调用由本地 mock provider 隔离，不代表生产侧第三方服务可用性与真实计费表现。

## 证据
- E2E JSON：`docs/test-reports/mcp-dx-round2-local-e2e-2026-04-06.json`

## 最终结论
本轮 `mcp-dx-round2` 本地验收通过，结论：**PASS**（11/11）。

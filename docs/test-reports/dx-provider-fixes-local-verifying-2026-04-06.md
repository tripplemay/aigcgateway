# dx-provider-fixes Local Verifying Report (2026-04-06)

## 测试目标
验证 `dx-provider-fixes` 批次（F-DPF-01 ~ F-DPF-05）在本地环境的验收达成情况。

## 测试环境
- Base URL: `http://localhost:3099`
- 启动方式：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- 阶段：`verifying`

## 测试范围
- F-DPF-01：上游错误脱敏
- F-DPF-02：4 个 Provider sync 修复
- F-DPF-03：capabilities unknown 清理
- F-DPF-04：MCP chat/generate_image 示例模型名与 list_models 一致性
- F-DPF-05：E2E 验证（脱敏、可调用性、unknown、示例一致性）

## 执行步骤概述
1. 创建测试用户/项目/API Key，执行 MCP `initialize`、`tools/list`、`list_models`。
2. 调用 `/api/admin/sync-status` 抽样验证 deepseek/zhipu/anthropic/siliconflow 同步结果。
3. 对 list_models 返回模型做可调用性检查（要求无 404/503）。
4. 运行 `sanitizeErrorMessage` 核心脱敏探针（构造 URL + sk + pk_ + QQ + 邮箱 + IP）。

## 通过项
- F-DPF-03（PASS）：`list_models` 返回能力字段不含 `unknown`。
- F-DPF-05 子项（PASS）：`list_models` 返回模型的可调用性检查中未出现 404/503（本轮 4 个模型均为 402）。

## 失败项
- F-DPF-01（FAIL）：
  - 脱敏逻辑未覆盖 `pk_` 前缀 Key 片段。
  - 探针结果中 `pk_abcdef1234567890` 原样保留（`hasLeak=true`）。
- F-DPF-02（FAIL）：
  - `/api/admin/sync-status` 中 deepseek/zhipu/anthropic/siliconflow 的 `modelCount` 仍为 0。
  - 错误仍为 `... /models returned 401`，本地未形成“为这 4 个 provider 创建 channel”的验收闭环。
- F-DPF-04（FAIL）：
  - `tools/list` 中 `chat`/`generate_image` description 示例模型名与当前 `list_models` 返回不一致（存在多条缺失）。
- F-DPF-05（FAIL）：
  - 因 F-DPF-01 与 F-DPF-04 失败，E2E 总体验收不通过。

## 风险项
- 错误脱敏仍有漏网（`pk_`），存在向用户暴露敏感片段风险。
- MCP 工具 description 示例与实际模型集不一致，会误导开发者调用。
- 4 个 Provider 同步仍未达“可创建 channel”目标，生产配置/逻辑需继续排查。

## 证据
- E2E 结果：
  - [dx-provider-fixes-local-e2e-2026-04-06.json](/Users/yixingzhou/project/aigcgateway/docs/test-reports/dx-provider-fixes-local-e2e-2026-04-06.json)
- 脱敏探针：
  - [dx-provider-fixes-sanitize-check-2026-04-06.json](/Users/yixingzhou/project/aigcgateway/docs/test-reports/dx-provider-fixes-sanitize-check-2026-04-06.json)

## 最终结论
本轮 `verifying` 结论：**FAIL**。  
建议状态流转到 `fixing`，优先修复 F-DPF-01（pk_ 脱敏）与 F-DPF-04（示例模型一致性），并补齐 F-DPF-02 的同步闭环证据后再复验。

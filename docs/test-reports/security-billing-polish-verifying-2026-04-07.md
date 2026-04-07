# security-billing-polish 验收报告（verifying）

- 测试目标：执行 F-SB-04 E2E，并验收 F-SB-01~F-SB-03
- 测试环境：L1 本地 `http://localhost:3099`
- 执行脚本：`scripts/test/security-billing-polish-e2e-2026-04-07.ts`
- JSON 证据：`docs/test-reports/security-billing-polish-reverifying-local-e2e-2026-04-07.json`

## 结果

- 通过：1
- 失败：4（含基础初始化）
- 结论：`verifying -> fixing`

## 主要失败

1. F-SB-01：REST 图片生成错误返回仍包含 `Request ID` 与 `volcengine` 端点信息（脱敏不完整）
2. F-SB-01：MCP 无效尺寸场景未落入错误路径（脚本期望错误但返回成功）
3. F-SB-03：chat 空 content 未在网关层拦截（未返回 `[invalid_request]`）
4. F-SB-02：最低扣费保护未观测到生效（1 token 调用后余额 delta=0）

## 风险

- 当前批次仍有 3 个 generator 功能待修复，无法进入 signoff

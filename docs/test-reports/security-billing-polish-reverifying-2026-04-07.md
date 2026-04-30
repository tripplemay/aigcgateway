# security-billing-polish 复验报告（reverifying）

- 测试目标：复验 F-SB-01/F-SB-02/F-SB-03 修复结果并完成 F-SB-04 E2E 验证
- 测试环境：本地 `http://localhost:3099`
- 执行脚本：`scripts/test/_archive_2026Q1Q2/security-billing-polish-e2e-2026-04-07.ts`
- JSON 证据：`docs/test-reports/security-billing-polish-reverifying-local-e2e-2026-04-07.json`

## 执行结果

- 通过：5 项
- 失败：0 项

### 关键通过点

1. F-SB-01：REST 空 prompt 错误响应已脱敏，不透传供应商敏感信息
2. F-SB-01：MCP 无效尺寸错误路径已脱敏，消息中无联系人/Request ID/区域信息泄露
3. F-SB-03：chat 空 content 在网关层返回 `[invalid_request]`，未转发上游
4. F-SB-02：1-token 调用触发最低扣费，余额变化为 `delta=0.00000001`

## 结论

- 本轮复验通过，`security-billing-polish` 批次达到签收条件。

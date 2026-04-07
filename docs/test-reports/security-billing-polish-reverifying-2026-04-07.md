# security-billing-polish 复验报告（reverifying）

- 测试目标：复验 F-SB-01/F-SB-02/F-SB-03 修复结果
- 测试环境：本地 `http://localhost:3099`
- 执行脚本：`scripts/test/security-billing-polish-e2e-2026-04-07.ts`
- JSON 证据：`docs/test-reports/security-billing-polish-reverifying-local-e2e-2026-04-07.json`

## 执行结果

- 通过：1 项（MCP initialize）
- 失败：4 项

### 失败项

1. F-SB-01：MCP `generate_image(size=999x999)` 未触发预期错误（脚本返回 success）
2. F-SB-01：REST 空 prompt 返回体为脱敏占位文案（`[[endpoint removed]]`、`[[request ID removed]]`），当前自动检测规则误判为泄漏
3. F-SB-03：chat 空 content 仍未稳定返回 `[invalid_request]`
4. F-SB-02：1-token 调用后余额未下降（`delta=0`），MIN_CHARGE 未观测生效

## 结论

- 本轮复验未通过，状态回退为 `fixing`。
- 说明：`progress.json.fix_rounds` 当前仍为 `0`，与 `reverifying` 阶段不一致，建议 Generator 下一轮切换阶段时同步递增。

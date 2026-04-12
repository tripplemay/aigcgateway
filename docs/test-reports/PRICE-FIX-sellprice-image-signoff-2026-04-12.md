# PRICE-FIX-sellprice-image Signoff 2026-04-12

> 状态：**PASS（L1 本地验收通过）**
> 阶段：`verifying` → `done`（F-PF-06）

## 测试目标

验证 PRICE-FIX 批次验收点：
1. TEXT 别名定价保存后 `unit=token`
2. IMAGE 别名定价保存后 `unit=call`
3. 历史缺 `unit` 数据在 `/v1/models` 读取时不再被当成免费
4. IMAGE 参考定价可用，回填 `perCall + unit:call`
5. API 层拦截无价格字段的 sellPrice 写入
6. 生成签收结论

## 测试环境

- 环境：本地 L1（`http://localhost:3099`）
- 启动方式：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- 代码版本：`c8bf479`
- 执行脚本：`scripts/test/price-fix-verifying-e2e-2026-04-12.ts`
- 证据报告：`docs/test-reports/price-fix-verifying-e2e-2026-04-12.json`

## 执行结果

- 自动化步骤总计：7
- 通过：7
- 失败：0

按 feature 结论：
- F-PF-01: PASS
- F-PF-02: PASS
- F-PF-03: PASS
- F-PF-04: PASS
- F-PF-05: PASS
- F-PF-06: PASS

## 风险与说明

- 本轮为 L1 本地验收，重点验证 API/前端/Prisma/读取兼容四层防护行为。
- IMAGE 参考定价基于 OpenRouter 公共模型数据，当前样本返回 2 个可用候选（`unit=call`）。

## 最终结论

PRICE-FIX-sellprice-image 批次满足当前验收标准，可签收并流转到 `done`。

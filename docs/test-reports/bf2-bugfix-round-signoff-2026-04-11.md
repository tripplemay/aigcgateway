# BF2 签收报告（verifying）

- 批次：BF2-bugfix-round
- 签收日期：2026-04-11
- 执行人：Codex Reviewer
- 环境：L1 本地（http://localhost:3099）
- 备注：本轮为 bugfix 验收，无独立 spec 文档

## 测试目标
验证 BF2 七项缺陷修复：参考定价回填、千位分隔展示、生效价格 placeholder、LLM 分类规则、MiniMax sync、Layer1 warning 可见化、"引擎类型"标签。

## 执行摘要
- 执行脚本：`scripts/test/bf2-verifying-e2e-2026-04-12.ts`
- 结构化结果：`docs/test-reports/bf2-verifying-e2e-2026-04-12.json`
- 结果：8 PASS / 0 FAIL（含 tsc）
- 结论：通过签收

## 通过项
- F-BF2-01 onApply 一次性写入 sellPrice（含 unit=token），模型列表定价非免费
- F-BF2-02 contextWindow/maxTokens 点击编辑 + 千位分隔显示
- F-BF2-03 fallbackPrice API 回传与输入框 placeholder 生效
- F-BF2-04 alias-classifier 代际区分规则与误挂载清理脚本
- F-BF2-05 MiniMax 同步返回模型
- F-BF2-06 Layer1 失败时同步结果可见 WARNING 且错误信息可见
- F-BF2-07 添加服务商页标签改为“引擎类型”（中英文）
- TypeScript 编译通过

## 风险与说明
- 本轮为 L1 验收。生产环境的数据修复脚本（`scripts/fix-alias-sell-price-unit.ts`、`scripts/fix-alias-mislinked-models.ts`）未在本地替代生产执行。

## 最终结论
BF2-bugfix-round 满足验收标准，允许流转 `done`。

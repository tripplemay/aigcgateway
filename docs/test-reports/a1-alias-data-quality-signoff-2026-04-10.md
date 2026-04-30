# A1 别名数据质量修复 Signoff 2026-04-10

> 状态：**PASS**
> 触发：`reverifying` 阶段生产只读复验通过，`F-A1-04` 签收完成

---

## 测试目标

验证 A1 批次在“本地 L1 已通过”的前提下，生产存量 alias 数据已满足最终验收标准：
- `dall-e` / `seedream` / `cogview` 等图片 alias 的 `modality=IMAGE`
- 主流启用模型的 `contextWindow` / `maxTokens` 已补齐
- 品牌重复变体已清理完成
- 生产修复脚本已部署，且再次 `--dry-run` 不再发现待修正数据

---

## 测试环境

- 本地 L1 证据：`localhost:3099`
- 生产复验环境：`34.180.93.185:/opt/aigc-gateway`
- 复验方式：SSH 只读查询 + 生产脚本 `--dry-run`
- 证据：
  - [a1-alias-data-quality-verifying-2026-04-10.json](/Users/yixingzhou/project/aigcgateway/docs/test-reports/a1-alias-data-quality-verifying-2026-04-10.json)
  - [a1-alias-data-quality-reverifying-2026-04-10.json](/Users/yixingzhou/project/aigcgateway/docs/test-reports/a1-alias-data-quality-reverifying-2026-04-10.json)
  - [a1-alias-data-quality-verifying-2026-04-10.md](/Users/yixingzhou/project/aigcgateway/docs/test-cases/a1-alias-data-quality-verifying-2026-04-10.md)
  - [a1-alias-data-quality-verifying-e2e-2026-04-10.ts](/Users/yixingzhou/project/aigcgateway/scripts/test/_archive_2026Q1Q2/a1-alias-data-quality-verifying-e2e-2026-04-10.ts)

---

## 执行步骤概述

1. 复用首轮 L1 结果，确认 `classifyNewModels`、`inferMissingBrands`、本地清理脚本逻辑均已通过。
2. SSH 到生产服务器，核对 `/opt/aigc-gateway` 是否已部署 A1 修复脚本。
3. 只读查询 `cogview-3`、`dall-e-2`、`seedream-3`、`claude-3.5-sonnet`、`deepseek-r1`、`deepseek-v3` 当前 alias 数据。
4. 只读统计 `Arcee/Arcee AI`、`智谱AI/智谱 AI` 品牌变体。
5. 只读查询主流 enabled alias 的 `contextWindow/maxTokens` 空值。
6. 在加载 PM2 环境变量后执行：
   - `scripts/fix-alias-modality.ts --dry-run`
   - `scripts/fix-brand-duplicates.ts --dry-run`
   - `scripts/fix-alias-context-window.ts --dry-run`
7. 确认三条脚本的 dry-run 输出均为 `0` 待修正。

---

## 通过项

- `F-A1-01` modality 修复：
  - `cogview-3`、`dall-e-2`、`seedream-3` 当前均为 `IMAGE`
  - `imageTextMismatches=[]`，生产已无这三条 alias 的 `TEXT` 残留
  - `fix-alias-modality.ts --dry-run` 返回 `Total: 0 aliases would be fixed`
- `F-A1-02` contextWindow/maxTokens 补齐：
  - `claude-3.5-sonnet.contextWindow=1000000`
  - `deepseek-r1.contextWindow=maxTokens=163840`
  - `deepseek-v3.contextWindow=maxTokens=163840`
  - 主流 enabled alias 空值查询结果为空
  - `fix-alias-context-window.ts --dry-run` 返回 `Total: 0 contextWindow + 0 maxTokens would be fixed`
- `F-A1-03` brand 锚定与历史清理：
  - 只剩 `Arcee=5`、`智谱AI=13`
  - `Arcee AI`、`智谱 AI` 统计已归零
  - `fix-brand-duplicates.ts --dry-run` 返回 `Total: 0 aliases would be fixed`
- `F-A1-04` 全量验收：
  - 本地 L1 与生产只读复验证据闭环
  - 生产修复脚本已部署到 `/opt/aigc-gateway`
  - A1 五项验收标准全部满足

---

## 失败项

无。

---

## 风险项

- 本轮生产复验严格限定为只读查询与 `--dry-run`，未再次执行正式写入；正式写入结果依赖 generator 阶段已完成的生产脚本执行。
- `dall-e-2`、`seedream-3` 仍为 disabled alias，`contextWindow/maxTokens` 为 `null` 不影响 `F-A1-04` 的“主流启用模型已补齐”验收口径。
- 生产脚本直接运行时默认不会自动加载 `DATABASE_URL`；本次通过 PM2 环境包装后可正常 dry-run，后续若需手工执行，需沿用相同环境加载方式。

---

## 最终结论

本批次复验结果为：

- `4 PASS`
- `0 PARTIAL`
- `0 FAIL`

`A1 — 别名数据质量修复（modality 继承 + contextWindow 补充 + brand 去重）` 通过签收，可将状态推进到 `done`。

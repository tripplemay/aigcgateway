# A1 别名数据质量修复 验收报告 2026-04-10

> 状态：**FAIL**
> 触发：`verifying` 首轮验收

---

## 测试目标

验证 A1 批次是否满足以下验收标准：
- 图片模型别名 `modality=IMAGE`
- 主流模型 `contextWindow` 已填充
- 品牌无重复变体
- 新 sync 后新模型自动继承正确 `modality/contextWindow`

---

## 测试环境

- L1 本地：`localhost:3099`
- 本地启动：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- 本地动态脚本：
  - [a1-alias-data-quality-verifying-e2e-2026-04-10.ts](/Users/yixingzhou/project/aigcgateway/scripts/test/a1-alias-data-quality-verifying-e2e-2026-04-10.ts)
  - [a1-alias-data-quality-verifying-2026-04-10.json](/Users/yixingzhou/project/aigcgateway/docs/test-reports/a1-alias-data-quality-verifying-2026-04-10.json)
- 生产只读核对：
  - 通过 SSH 到 `/opt/aigc-gateway` 执行只读 Prisma 查询
  - 尝试执行 `scripts/fix-alias-modality.ts --dry-run` / `scripts/fix-brand-duplicates.ts --dry-run` 失败：远端部署目录缺少这两个脚本文件

---

## 执行步骤概述

1. 在本地 mock DeepSeek provider 下执行 `classifyNewModels()` / `inferMissingBrands()`。
2. 在本地测试库执行 `fix-alias-modality.ts --dry-run`、`fix-alias-modality.ts`、`fix-brand-duplicates.ts --dry-run`、`fix-brand-duplicates.ts`。
3. 用 Admin alias API 复核本地修正结果。
4. 远端只读查询当前生产 alias 数据，核对图片 alias modality、主流模型 `contextWindow`、品牌重复变体。

---

## 通过项

- `F-A1-01` 局部通过：
  - 本地 `classifyNewModels()` 新建 image alias 时正确继承 `Model.modality=IMAGE`
  - image model 归入 text alias 时被 `modality mismatch` 正确跳过
  - 本地 `fix-alias-modality.ts` `--dry-run` 与实跑均符合预期
- `F-A1-02` 局部通过：
  - 新建 alias 优先继承 `Model.contextWindow/maxTokens`
  - `Model` 为 null 时回退使用 LLM `context_window/max_tokens`
  - 归入已有 alias 时，空 `contextWindow/maxTokens` 可从 `Model` 补齐
- `F-A1-03` 局部通过：
  - `classifyNewModels` prompt 含已有品牌列表锚定
  - `inferMissingBrands` prompt 含已有品牌列表锚定
  - 本地 `fix-brand-duplicates.ts` `--dry-run` 与实跑均符合预期

---

## 失败项

- `F-A1-01` FAIL：
  - 生产只读查询显示图片 alias 仍为 `TEXT`
  - 证据：
    - `cogview-3` → `modality=TEXT`
    - `dall-e-2` → `modality=TEXT`
    - `seedream-3` → `modality=TEXT`
  - 说明：生成器已提供一次性修复脚本，但远端部署目录尚无脚本文件，且当前生产数据未完成修正

- `F-A1-02` FAIL：
  - 生产只读查询显示主流 text alias 仍存在 `contextWindow=null`
  - 证据：
    - `claude-3.5-sonnet`
    - `deepseek-r1`
    - `deepseek-v3`
  - 说明：新逻辑可保障后续继承，但当前存量数据未补齐

- `F-A1-03` FAIL：
  - 生产只读查询显示品牌重复变体仍并存
  - 证据：
    - `Arcee=4`, `Arcee AI=1`
    - `智谱AI=10`, `智谱 AI=3`
  - 说明：品牌清理脚本未在生产完成执行

- `F-A1-04` FAIL：
  - 由于生产存量数据仍不满足 1/2/3，整体验收不通过

---

## 风险项

- 本地 L1 已证明代码路径正确，但 A1 的关键目标之一是修正现有存量 alias 数据；这部分当前生产尚未落地。
- 远端部署目录缺少两个修复脚本，说明“代码合入 main”和“服务器可执行修复脚本”之间仍有发布缺口。

---

## 最终结论

本轮首轮验收结果为：

- `0 PASS`
- `0 PARTIAL`
- `4 FAIL`

A1 当前应流转到 `fixing`，至少需要：
1. 将修复脚本部署到生产可执行目录
2. 在生产先执行 `--dry-run` 核对，再执行正式修复
3. 修复后重新做只读抽样复验

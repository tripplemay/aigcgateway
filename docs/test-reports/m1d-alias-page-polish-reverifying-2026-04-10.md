# M1d 复验报告（reverifying）

## 测试目标
复验 M1d 批次在修复 migration 阻塞后的全量验收，重点覆盖：
- 别名管理页单列布局 + 搜索筛选排序
- 别名层售价写入与 `/v1/models` 返回
- capabilities 自动推断（仅填充空值，不覆盖已有）
- DS token / i18n 检查

## 测试环境
- L1 本地：`http://localhost:3099`
- 启动：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- 复验脚本：`scripts/test/m1d-alias-page-polish-reverifying-e2e-2026-04-10.ts`
- 结果文件：`docs/test-reports/m1d-alias-page-polish-reverifying-e2e-2026-04-10.json`
- 本次执行时间：`2026-04-10T00:33:37.819Z`

## 结果概览
- PASS：5
- FAIL：1
- 结论：未通过，回到 `fixing`

## 通过项
- AC1：单列列表 + accordion 展开结构存在
- AC2：搜索/筛选/排序逻辑存在，enabled 优先排序实现存在
- AC3：别名层 sellPrice 可编辑，`/v1/models?modality=text` 返回 alias pricing 正确
- AC5：未发现硬编码色值/原始色阶 class
- AC6：页面走 i18n key，en/zh key 同步，无中文硬编码残留

## 失败项
### F-M1d-06 / AC4 — capabilities 推断未填充空值
- 严重级别：High
- 稳定复现：是

现象：
- 创建 `capabilities = null` 的别名后，调用 `inferMissingCapabilities()` 仍未被填充；
- 已有 capabilities 的别名未被覆盖（该行为正确）。

证据：
- 动态结果：`infer_updated=0, fill_caps=null, keep_caps={"vision":false,"streaming":false}`
- 最新实现已包含 `DbNull + JsonNull`（`src/lib/sync/alias-classifier.ts:386-392`），但在本次复验中仍未命中空值别名。
- 问题推断：空值匹配条件仍有遗漏（可能需要 `Prisma.AnyNull` 或进一步区分写入语义），当前实现仍无法覆盖实际数据。

## 结论
本轮复验未通过，建议 Generator 修复 `inferMissingCapabilities` 的空值匹配逻辑（覆盖 DbNull/NULL 场景）后再次进入 `reverifying`。

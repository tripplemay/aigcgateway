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
- 本次执行时间：`2026-04-10T01:01:52.808Z`

## 结果概览
- PASS：6
- FAIL：0
- 结论：通过，可进入 `signoff`

## 通过项
- AC1：单列列表 + accordion 展开结构存在
- AC2：搜索/筛选/排序逻辑存在，enabled 优先排序实现存在
- AC3：别名层 sellPrice 可编辑，`/v1/models?modality=text` 返回 alias pricing 正确
- AC5：未发现硬编码色值/原始色阶 class
- AC6：页面走 i18n key，en/zh key 同步，无中文硬编码残留

## AC4 修复复验说明
- 复验脚本已改为调用 HTTP 端点：`POST /api/admin/model-aliases/infer-capabilities`（admin JWT）。
- 不再在 tsx 进程里直接 `import inferMissingCapabilities()`，避免与 3099 服务进程隔离导致的 mock/provider 配置不一致。
- 动态结果：`infer_updated=2, infer_errors=[]`，`fill_caps` 已成功填充，`keep_caps` 保持原值（未覆盖）。
- 服务日志证据：
  - `[alias-classifier] Total aliases: 5, without caps: 2`
  - `[callInternalAI] provider=deepseek, baseUrl=http://127.0.0.1:3343, hasKey=true, proxyUrl=none`
  - `[alias-classifier] Capabilities inference done: updated=2, errors=0`

## 结论
本轮复验全 PASS（6/6），M1d 可进入签收。

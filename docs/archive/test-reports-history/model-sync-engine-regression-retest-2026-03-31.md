# 模型同步引擎二次回归测试报告

Summary
- Scope:
  - 多通道聚合回归
  - `sellPriceLocked` 锁价保护回归
- Documents:
  - `docs/test-reports/model-sync-engine-regression-test-report-2026-03-31.md`
- Environment:
  - 本地测试环境 `http://localhost:3099`
  - 通过 `bash scripts/test/codex-setup.sh` 重建
- Result totals:
  - PASS：0
  - FAIL：2
  - BLOCKED：1

## 结果

### FAIL-001 多通道聚合仍未形成
- `GET /api/admin/models-channels` 返回：
  - `count=328`
  - `multiChannelCount=0`
- SQL 校验：
  - `having count(*) > 1` 返回 `0 rows`
- 结论：
  - “同一模型跨服务商只创建一个 Model + 多个 Channel”仍未通过

### FAIL-002 锁价保护仍失效
- 复现：
  1. 对 `openai/gpt-4o` 的 channel 执行 PATCH，设置卖价为 `9.99 / 19.99`
  2. PATCH 返回 `sellPriceLocked=true`
  3. 调用 `POST /api/admin/sync-models`
  4. 再查 `GET /api/admin/models-channels`
- 实际：
  - 同步后卖价被恢复为 `3 / 12`
  - `sellPriceLocked=false`
- 结论：
  - 锁价字段和手工卖价仍被同步覆盖

### BLOCKED-001 5 家直连服务商仍因 401 无法完整验收
- `POST /api/admin/sync-models` 返回 `failedProviders=5`
- 影响：
  - OpenAI / Anthropic / DeepSeek / Zhipu / SiliconFlow 的真实远程抓取仍无法在当前环境完成

## 结论

- 上轮剩余的两个失败项在本轮复测中都仍然存在，暂无修复迹象。

# API Keys 生产环境回归报告（Round 4）

- 测试目标：验证生产环境最新更新后，`/keys` 搜索输入清空恢复逻辑是否修复
- 测试环境：`https://aigc.guangai.ai`
- 执行时间：`2026-04-03 16:08:38 CST`
- 生产测试开关：
  - `PRODUCTION_STAGE=RND`
  - `PRODUCTION_DB_WRITE=ALLOW`
  - `HIGH_COST_OPS=ALLOW`

## 执行步骤概述

1. 刷新 `/keys` 并等待默认列表加载
2. 确认默认列表仍为 `5 / 7 keys`
3. 在 `Search keys...` 输入 `NoSuchKey`
4. 页面进入 `No keys found`
5. 直接清空输入框内容
6. 观察是否自动恢复默认列表
7. 点击 `close` 作为对照，确认页面可恢复

## 通过项

- 默认列表可加载并稳定显示 `5 / 7 keys`
- `close` 按钮仍可恢复默认列表

## 失败项

- 手动清空输入框后，列表仍不自动恢复
  - 输入框已为空
  - 页面仍显示 `No keys found`
  - 必须额外点击 `close` 才能恢复
  - 结论：稳定复现，仍未修复

## 风险项

- 本轮后半段出现生产连通性波动
  - Chrome MCP 出现 `ERR_EMPTY_RESPONSE` / 导航超时
  - 同时 shell 侧部分 `curl` 请求出现 20 秒超时
  - 该波动不影响本轮核心失败结论，因为失败复现发生在波动前且已留证

## 证据链接或文件路径

- 本轮失败截图：[api-keys-production-revalidation-2026-04-03-round4-search-clear-failed.png](/Users/zhouyixing/project/aigcgateway/docs/test-reports/api-keys-production-revalidation-2026-04-03-round4-search-clear-failed.png)
- 本轮报告：[api-keys-production-revalidation-report-2026-04-03-round4.md](/Users/zhouyixing/project/aigcgateway/docs/test-reports/api-keys-production-revalidation-report-2026-04-03-round4.md)
- 上一轮报告：[api-keys-production-revalidation-report-2026-04-03-round3.md](/Users/zhouyixing/project/aigcgateway/docs/test-reports/api-keys-production-revalidation-report-2026-04-03-round3.md)

## 最终结论

本轮结论保持不变：`部分通过`。  
已修复项未回退，但“手动清空搜索框后自动恢复列表”仍未修复。

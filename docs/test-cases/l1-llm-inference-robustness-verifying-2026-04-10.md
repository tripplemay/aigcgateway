Summary
- Scope: `F-L1-04` L1 本地验收，覆盖 `classifyNewModels`、`inferMissingBrands`、`inferMissingCapabilities` 的分批、即时持久化、失败跳过与补处理。
- Documents: `features.json`, `progress.json`, [alias-classifier.ts](/Users/yixingzhou/project/aigcgateway/src/lib/sync/alias-classifier.ts), [model-sync.ts](/Users/yixingzhou/project/aigcgateway/src/lib/sync/model-sync.ts#L505)
- Environment: localhost `:3099` via `bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`

Scenario Coverage
- Smoke: 服务启动、匿名 `/v1/models`、管理员登录、管理员读取 providers
- Classification robustness: 65 个未挂载模型，模拟第 2 批连续失败 3 次，确认第 1/3 批已落库、第 2 批跳过，二次执行补处理剩余批次
- Brand robustness: 65 个 `brand=null` 别名，模拟第 2 批连续失败 3 次，确认第 1/3 批已落库、第 2 批跳过，二次执行补处理剩余批次
- Capabilities bulk: 105 个 `capabilities=null` 别名，确认按 30/30/30/15 分批成功完成且无超时
- Capabilities persistence/resume: 65 个 `capabilities=null` 别名，模拟第 2 批连续失败 3 次，确认已完成批次不丢失，二次执行补处理剩余批次
- Sync reinvocation audit: 静态核对 `model-sync.ts` 每轮 sync 后都会再次调用三条推断函数

ID: F-L1-04-SMOKE
Title: 本地 3099 验收环境 smoke
Priority: Critical
Requirement Source: `features.json` / F-L1-04
Preconditions:
- 已在持久 PTY 运行 `bash scripts/test/codex-setup.sh`
- `bash scripts/test/codex-wait.sh` 返回 ready
Request Sequence:
1. GET `/v1/models`
   Expected Status: `200`
   Assertions:
   - 返回 JSON
2. POST `/api/auth/login`
   Payload:
   - `{"email":"admin@aigc-gateway.local","password":"admin123"}`
   Expected Status: `200`
   Assertions:
   - 返回 `token`
3. GET `/api/admin/providers`
   Expected Status: `200`
   Assertions:
   - 可读出 `deepseek` provider
State Assertions:
- 本地服务可用，管理员鉴权正常
Cleanup:
- 无
Notes / Risks:
- 如 smoke 失败，后续验收应直接判环境阻塞

ID: F-L1-04-CLASSIFY
Title: 分类链路失败跳过并在下次执行补处理
Priority: Critical
Requirement Source: `features.json` / F-L1-04 / `inferMissingCapabilities/classifyNewModels/inferMissingBrands` acceptance
Preconditions:
- 将 `deepseek` provider 指向本地 mock `/chat/completions`
- 造 65 个未挂载且带 ACTIVE channel 的模型
Request Sequence:
1. 执行 `classifyNewModels()`，mock 计划为 `success -> 500 -> 500 -> 500 -> success`
   Expected Status:
   - 函数返回
   Assertions:
   - `classified=35`
   - `skipped=30`
   - 第 1/3 批链接已落库
2. 再执行 `classifyNewModels()`，mock 计划为 `success`
   Expected Status:
   - 函数返回
   Assertions:
   - `classified=30`
   - 所有 65 个模型均已挂到 alias
State Assertions:
- 重试失败的第 2 批不会阻塞第 3 批
- 下次执行可补处理上次跳过项
Cleanup:
- 删除测试前缀数据
Notes / Risks:
- 重试间隔固定为 3s/10s，首轮执行耗时会高于纯成功路径

ID: F-L1-04-BRAND
Title: Brand 推断失败跳过并在下次执行补处理
Priority: High
Requirement Source: `features.json` / F-L1-04
Preconditions:
- 造 65 个 `brand=null` 的 alias
Request Sequence:
1. 执行 `inferMissingBrands()`，mock 计划为 `success -> 500 -> 500 -> 500 -> success`
2. 再执行 `inferMissingBrands()`，mock 计划为 `success`
Expected Status:
- 首轮 `updated=35`, `skipped=30`
- 二轮 `updated=30`, `skipped=0`
State Assertions:
- 已完成批次在失败后仍保留
- 剩余空品牌 alias 会在下次执行被补齐
Cleanup:
- 删除测试前缀数据
Notes / Risks:
- 品牌写入只验证空值填充路径，不覆盖已有值路径

ID: F-L1-04-CAPS-BULK
Title: 100+ capabilities 推断按批成功且无超时
Priority: Critical
Requirement Source: `features.json` / F-L1-04
Preconditions:
- 造 105 个 `capabilities=null` 的 alias
Request Sequence:
1. 执行 `inferMissingCapabilities()`，mock 计划为 `success x4`
Expected Status:
- `updated=105`
- `errors=[]`
State Assertions:
- 4 次 LLM 请求分别处理 `30/30/30/15`
- 总耗时明显低于单批 60s 超时阈值
Cleanup:
- 删除测试前缀数据
Notes / Risks:
- 本项验证函数级 L1，不覆盖真实外部 LLM 可用性

ID: F-L1-04-CAPS-RESUME
Title: capabilities 推断即时持久化与补处理
Priority: Critical
Requirement Source: `features.json` / F-L1-04
Preconditions:
- 造 65 个 `capabilities=null` 的 alias
Request Sequence:
1. 执行 `inferMissingCapabilities()`，mock 计划为 `success -> 500 -> 500 -> 500 -> success`
2. 查询数据库验证仅 35 个 alias 已写入 capabilities
3. 再执行 `inferMissingCapabilities()`，mock 计划为 `success`
Expected Status:
- 首轮 `updated=35`, `skipped=30`
- 二轮 `updated=30`, `skipped=0`
State Assertions:
- 中途失败不回滚已成功批次
- 下次执行可补处理剩余批次
Cleanup:
- 删除测试前缀数据
Notes / Risks:
- “中途中断”以批次失败模拟；未做进程级强杀

# 生产环境回归报告（Round 2）

## 测试目标

验证生产部署后以下关键点：

1. `doc_urls` 字段是否已在生产生效
2. seed 是否已重跑，使火山引擎 `14` 个 `staticModels` 生效
3. 手动同步后火山引擎模型数是否达到预期
4. DeepSeek / 硅基流动的 AI 文档提取是否已使用生产环境 DeepSeek API key

## 生产测试开关

- `PRODUCTION_STAGE=RND`
- `PRODUCTION_DB_WRITE=ALLOW`
- `HIGH_COST_OPS=ALLOW`

## 测试环境

- 生产地址：`https://aigc.guangai.ai`
- 测试时间：`2026-04-01`
- 管理员账号：`test-agent@aigc-gateway.local`

## 执行步骤概述

1. 访问生产首页与公开接口，确认应用层可用
2. 管理员登录
3. 读取 `sync-status`
4. 读取 provider 配置，核对 `docUrls` / `staticModels`
5. 触发一次手动同步
6. 复查 `sync-status`、`/api/v1/models`、`/api/admin/channels`

## 通过项

### PASS-001 生产站点当前可用

- `HEAD /` 返回 `200`
- `HEAD /api/v1/models` 返回 `200`
- 管理员登录成功

### PASS-002 `doc_urls` 字段在生产上已生效

- 证据：
  - `GET /api/admin/providers/:id/config`
  - `deepseek` 配置中已返回：
    - `docUrls=["https://api-docs.deepseek.com/quick_start/pricing"]`
- 结论：
  - 无法直接证明使用的是 `prisma migrate dev` 还是 `db push`
  - 但可以确认迁移结果已在生产数据库中生效

### PASS-003 火山引擎 seed 已生效

- 证据：
  - `GET /api/admin/providers/:id/config`
  - `volcengine` 配置中 `staticModels` 长度为 `14`
- 结论：
  - 火山引擎 `14` 个静态模型配置已经落到生产

### PASS-004 手动同步后火山引擎同步统计达到 14

- 证据：
  - `GET /api/admin/sync-status`
  - `volcengine` 当前结果：
    - `apiModels=14`
    - `modelCount=14`
    - `error=null`
- 结论：
  - 从同步引擎统计角度，火山引擎已经按 `14` 个模型处理

### PASS-005 DeepSeek 的 AI 文档提取已生效

- 证据：
  - 手动同步后 `sync-status` 显示：
    - `deepseek.apiModels=2`
    - `deepseek.aiEnriched=2`
  - `/api/v1/models` 中：
    - `deepseek/v3` 价格为 `0.336 / 0.504`
    - `deepseek/reasoner` 价格为 `0.336 / 0.504`
  - 同步前这两个模型价格是 `0 / 0`
- 结论：
  - 生产环境 DeepSeek 内部 AI key 至少已对 DeepSeek 自身文档提取路径生效

## 失败项

### FAIL-001 火山引擎开发者可见模型数不是 14

- 现象：
  - `/api/admin/channels` 中 `providerName="火山引擎方舟"` 共 `16` 条记录，但其中有 `4` 条为 `DISABLED`
  - `/api/v1/models` 中 `provider_name="火山引擎方舟"` 仅有 `12` 个模型
- 具体可见模型：
  - `volcengine/deepseek-r1-ark`
  - `volcengine/deepseek-v3-ark`
  - `volcengine/doubao-1.5-lite-256k`
  - `volcengine/doubao-1.5-lite-32k`
  - `volcengine/doubao-1.5-pro-256k`
  - `volcengine/doubao-1.5-pro-32k`
  - `volcengine/doubao-1.5-vision-pro-32k`
  - `volcengine/doubao-lite-128k`
  - `volcengine/doubao-lite-32k`
  - `volcengine/doubao-pro-256k`
  - `volcengine/doubao-pro-32k`
  - `volcengine/seedream-3.0`
- 被禁用样本：
  - `volcengine/doubao-lite`
  - `volcengine/doubao-pro`
  - `volcengine/seedream-4.0`
  - `volcengine/seedream-4.5`
- 结论：
  - “seed 生效”已经通过
  - 但“开发者实际可见 / active 的火山引擎模型应为 14”这一点未通过

### FAIL-002 硅基流动 AI 文档提取未体现补全结果

- 现象：
  - 手动同步后 `sync-status` 显示：
    - `siliconflow.apiModels=95`
    - `siliconflow.aiEnriched=0`
  - `/api/v1/models` 中：
    - `provider_name="硅基流动"` 共 `95` 个模型
    - 其中价格仍为 `0` 的有 `95` 个
- 结论：
  - 当前生产上未观察到硅基流动 AI 文档提取成功补全价格
  - 这项不满足“DeepSeek/硅基流动的 AI 文档提取需要生产环境的 DeepSeek API key”所隐含的验收预期

## 风险项

### RISK-001 手动同步接口响应不稳定

- 现象：
  - 一次 `POST /api/admin/sync-models` 返回了 nginx `504 Gateway Time-out`
  - 再次请求返回 `200`，但 body 是空同步结果：
    - `durationMs=0`
    - `providers=[]`
  - 随后 `sync-status` 实际更新为新的同步结果
- 推断：
  - 同步任务可能已在服务端执行，但请求链路或响应链路不稳定

### RISK-002 OpenAI / Anthropic 直连仍不可用

- `sync-status` 仍显示：
  - `openai /models returned 401`
  - `anthropic /models returned 401`
- 这会继续阻塞跨服务商聚合的完整验收

## 关键证据

- `GET /api/admin/providers/:id/config`
  - `deepseek.docUrls` 已存在
  - `volcengine.staticModels` 已有 `14` 条
- `GET /api/admin/sync-status`
  - `deepseek: apiModels=2, aiEnriched=2, modelCount=2`
  - `volcengine: apiModels=14, aiEnriched=0, modelCount=14`
  - `siliconflow: apiModels=95, aiEnriched=0, modelCount=95`
- `GET /api/v1/models`
  - `DeepSeek` 价格已从 `0` 变为非零
  - `硅基流动` 共 `95` 个模型价格仍为 `0`
  - `火山引擎方舟` 对外可见模型数为 `12`
- `GET /api/admin/channels`
  - `火山引擎方舟` 共 `16` 条通道记录，其中部分 `DISABLED`

## 最终结论

这轮生产回归结论是：**部分通过。**

已确认通过：

- `doc_urls` 迁移结果已在生产生效
- seed 已重跑并让火山引擎 `14` 个 `staticModels` 生效
- 手动同步后的引擎统计中，火山引擎已按 `14` 个模型处理
- DeepSeek 的 AI 文档提取已成功生效

仍未通过：

- 火山引擎对开发者实际可见的 active 模型数只有 `12`，不是 `14`
- 硅基流动未体现 AI 文档提取补全价格，`aiEnriched=0`

补充说明：

- 本轮无法把“DeepSeek/硅基流动 AI 文档提取”整体判为通过，只能判为：
  - `DeepSeek` 通过
  - `SiliconFlow` 未通过

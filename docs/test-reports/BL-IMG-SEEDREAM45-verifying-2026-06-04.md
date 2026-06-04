# BL-IMG-SEEDREAM45 首轮验收报告

- 日期：2026-06-04
- 批次：`BL-IMG-SEEDREAM45`
- 功能：`F-SD45-02`
- 角色：Codex / Reviewer / Evaluator
- 结论：`FAIL`（生产主链路通过；L1 本地门槛未通过，不能签收）

## 范围

- 验证 `scripts/add-seedream-45.ts` 幂等 apply 到生产 DB
- 验证生产 `/v1/models`、真实 `seedream-4-5` 图片生成、同源代理、GCS 持久化、日志回看、计费
- 验证本地 `codex-setup` / `codex-wait` / `tsc` / `build` / `test`

## 执行记录

### L1 本地

1. `git pull --ff-only origin main`
   - 结果：`Already up to date.`
2. `bash scripts/test/codex-setup.sh`
   - 结果：完成依赖安装、migrate、seed、build 和本地服务启动
3. `bash scripts/test/codex-wait.sh`
   - 结果：返回 ready
4. `curl http://localhost:3199/v1/models | jq '.data | length'`
   - 结果：`0`
5. `npx tsc --noEmit`
   - 结果：`FAIL`
   - 关键报错：`TS6053`，`tsconfig.json` 包含的 `.next/types/**/*.ts` 指向大量不存在文件
6. `npm run build`
   - 结果：`PASS`
7. `npm test`
   - 结果：`PASS`，`77 files / 602 passed / 4 skipped`

### 生产 apply / 幂等

1. 生产 VM 当前部署不含 `scripts/add-seedream-45.ts`
   - 证据：`/opt/aigc-gateway/scripts/add-seedream-45.ts` 初始不存在
2. 将当前仓库脚本临时传到生产机同名路径执行 dry-run
   - 结果：`seedream-4-5 → volcengine/ep-20260604162024-k2sbk (CREATE)`
3. 执行 `--apply`，清 `models:list*` Redis 缓存，再次 `--apply`
   - 第一次：`created`
   - 第二次：`updated`
   - `enabled IMAGE aliases`：`3 -> 4 -> 4`
4. 生产 DB 核对
   - `ProviderConfig.imageViaChat=true`
   - `ProviderConfig.currency=CNY`
   - `model.enabled=true`
   - `channel.realModelId=ep-20260604162024-k2sbk`
   - `channel.costPrice={"perCall":0.2}`
   - `channel.sellPrice={"perCall":0.24}`
   - `alias.enabled=true`
   - `alias.deprecated=false`
   - `alias_model_link` 存在

### 生产 E2E

1. `GET https://aigc.guangai.ai/v1/models`
   - image 列表：`gemini-3-pro-image` / `gpt-image` / `gpt-image-mini` / `seedream-4-5`
2. 真实生成
   - 请求：`POST /v1/images/generations`
   - model：`seedream-4-5`
   - traceId：`trc_p3fgsec90ehv49svi1mcyimr`
   - HTTP：`200`
   - 返回 URL：`https://aigc.guangai.ai/v1/images/proxy/trc_p3fgsec90ehv49svi1mcyimr/0?...`
3. 代理回源
   - `GET` 代理 URL：`200 image/jpeg`
   - 文件识别：`JPEG 2048x2048`
   - 大小：`781802 bytes`
4. GCS 持久化
   - `call_logs.responseSummary.original_urls[0]`：
     `images/cmnj295c90003rny7hsd0li9l/trc_p3fgsec90ehv49svi1mcyimr/0.jpg`
   - `gsutil stat gs://aigc-gateway-images/images/cmnj295c90003rny7hsd0li9l/trc_p3fgsec90ehv49svi1mcyimr/0.jpg`
   - 结果：对象存在，`Content-Type=image/jpeg`，`Content-Length=781802`
5. 计费
   - `call_logs.status=SUCCESS`
   - `costPrice=0.02740000`
   - `sellPrice=0.03288000`
   - 计算核对：
     - 成本：`0.20 CNY * 0.137 = 0.0274 USD`
     - 售价：`0.24 CNY * 0.137 = 0.03288 USD`
   - 余额变化：
     - 生成前：`5.70107297`
     - 一次成功生成后：`5.66819297` 之前已发生一次同价成功调用，单次扣费与 `0.03288` 对齐
6. 日志回看
   - `GET /api/projects/cmnj295c90003rny7hsd0li9l/logs/trc_p3fgsec90ehv49svi1mcyimr`
   - 结果：`images[0]` 为生产同源代理 URL，可直接回看
7. 失败不收费
   - 坏请求：`POST /v1/images/generations`，body 仅传 `{"model":"seedream-4-5"}`
   - 结果：`400 invalid_parameter`
   - 余额前后：`5.66819297 -> 5.66819297`，未扣费

## 判定

- `AC2 / AC3 / AC4 / AC5 / AC6`：`PASS`
- `AC1`：`PARTIAL`
  - `codex-setup` / `codex-wait` 能跑通，但本地 `/v1/models` 返回空列表
- `AC7`：`FAIL`
  - `npx tsc --noEmit` 未通过
  - `npm run build` / `npm test` 通过
- `AC8`：本报告已产出

## 失败项

1. `npx tsc --noEmit` 在当前主分支失败
   - 现象：`.next/types/**/*.ts` include 命中大量不存在文件
   - 影响：不满足 spec 对本地门槛的硬性要求
2. 本地 `http://localhost:3199/v1/models` 返回空列表
   - 现象：服务可响应，但 `data.length=0`
   - 影响：L1 无法本地验证 `seedream-4-5` 列表暴露

## 结论

生产接入本身已经生效：`seedream-4-5` 可见、可生成、代理可读、GCS 落桶、日志可回看、成本和售价换算正确、脚本幂等成立。

本轮不能签收，原因是 acceptance 明确要求的本地门槛未全通过，尤其是 `npx tsc --noEmit` 失败。状态应回到 `fixing`，等待 Generator 修复 L1 问题后再复验。

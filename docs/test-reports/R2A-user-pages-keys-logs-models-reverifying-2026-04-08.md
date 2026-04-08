# R2A 复验报告（reverifying）

- 批次: `R2A-user-pages-keys-logs-models`
- 阶段: `reverifying`
- 执行时间: `2026-04-08`
- 环境: `L1 本地` (`http://localhost:3099`)
- 执行者: `codex: Reviewer`

## 复验范围

基于上轮 verifying 的 5 FAIL + 2 PARTIAL 进行回归：`F-R2A-02/04/05/06/07/08`，并复核 `F-R2A-09`。

## 复验结果

- PASS: 7
- PARTIAL: 1
- FAIL: 1

## 各功能判定

- `F-R2A-01` PASS
- `F-R2A-02` PASS
  - CreateKeyDialog 过期项已为 `Never / 30d / 60d / 90d`。
- `F-R2A-03` PASS
- `F-R2A-04` PASS
  - `/keys/[keyId]` 已包含过期日期设置控件。
- `F-R2A-05` PASS
  - `/logs` 已有模型筛选下拉；行点击跳转 `/logs/[traceId]`。
- `F-R2A-06` PASS
  - `/logs/[traceId]` 已提供质量评分按钮；触发 `PATCH /api/projects/:id/logs/:traceId/quality` 返回 200。
- `F-R2A-07` PASS
  - 通过注入测试模型数据完成验证：Provider 分组、展开/收起、Text/Image 切换均正常。
- `F-R2A-08` FAIL
  - 仍存在硬编码英文用户文案（未完全 i18n 化）。
- `F-R2A-09` PARTIAL
  - 页面加载、DS 组件与关键 CRUD 链路可用；但受 `F-R2A-08` 影响，不能签收。

## 关键证据

### 运行时证据

- `/keys`：创建 Key 成功，吊销成功（状态 `ACTIVE -> REVOKED`）。
- `/logs`：模型下拉可用；日志行点击跳转详情页成功。
- `/logs/[traceId]`：质量评分按钮可用，网络请求命中 `/quality`（200）。
- `/models`：注入测试模型后，Provider 分组与 modality 过滤（Text/Image）正常。

### 代码证据（F-R2A-08）

- `src/app/(console)/models/page.tsx:122`
  - `Browse available models and pricing across all providers.`
- `src/app/(console)/models/page.tsx:162-166`
  - `Active Infrastructure`, `Total Models`
- `src/app/(console)/logs/page.tsx:272-277`
  - `Avg P95`, `Median`
- `src/app/(console)/logs/page.tsx:296-305`
  - `Save up to 32%`, `Apply Savings`
- `src/app/(console)/logs/[traceId]/page.tsx:149-150`
  - `Model`
- `src/app/(console)/logs/[traceId]/page.tsx:160-161`
  - `Tokens`
- `src/app/(console)/logs/[traceId]/page.tsx:173-174`
  - `Cost`
- `src/app/(console)/logs/[traceId]/page.tsx:186-187`
  - `Throughput`
- `src/app/(console)/logs/[traceId]/page.tsx:207`
  - `{promptCount} Messages`

## 结论

- 当前批次仍不满足 signoff 条件。
- 状态应回退 `fixing`，优先修复 `F-R2A-08` 的硬编码文案后再进入下一轮复验。


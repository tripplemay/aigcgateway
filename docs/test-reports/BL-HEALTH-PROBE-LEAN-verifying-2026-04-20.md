# BL-HEALTH-PROBE-LEAN Verifying Report（2026-04-20）

- 批次：`BL-HEALTH-PROBE-LEAN`
- 阶段：`verifying`
- 执行人：Codex / Reviewer
- 环境：L1 本地（`127.0.0.1:3099`）

## 结论

- 本地验收结论：**PASS**
- `F-HPL-05` 第 1-9 项全部通过。
- 第 10-13 项为“生产部署后 48h 观察项”，本轮登记为 **DEFERRED**（观察窗未满足，不阻断本批次签收）。

## 验收明细（F-HPL-05）

1. `npm run build`：PASS
2. `npx tsc --noEmit`：PASS
3. `npx vitest run`：PASS（`30 files, 216/216`）
4. `runTextCheck` 返回仅 1 条 CONNECTIVITY：PASS
5. `runTextCheck` 调用参数含 `max_tokens:1`：PASS
6. `isExpensiveModel` 对 search/reasoning/o1/o3 匹配：PASS
7. scheduler 对 expensive ACTIVE aliased text 跳过 probe/call probe：PASS
8. `/admin/providers` 编辑弹窗不含 `name` 输入框：PASS
9. 编辑 provider 仅改 `apiKey` 保存成功（PATCH 200 + 保存 toast）：PASS
10. chatanywhere 日调用数降幅 >95%：DEFERRED（需生产 48h）
11. OpenRouter 日 token 成本 `< $0.5`：DEFERRED（需生产 48h）
12. `gpt-4o-mini-search-preview` 日 probe 调用数 = 0：DEFERRED（需生产 48h）
13. 生产 `/admin/providers` 用户重试更新成功：DEFERRED（需生产复测）
14. 生成 signoff 报告：PASS

## 关键证据

- 质量闸门：
  - `npm run build` 通过（仅既有 lint warning）
  - `npx tsc --noEmit` 通过
  - `npx vitest run` 输出：`216 passed (216)`
- 定向测试：
  - `npx vitest run src/lib/health/__tests__/checker-lean.test.ts src/lib/health/__tests__/expensive-models.test.ts src/lib/health/__tests__/scheduler.test.ts --reporter=verbose`
  - 输出确认：
    - `runTextCheck lean ... single CONNECTIVITY row`
    - `invokes adapter with max_tokens:1`
    - `isExpensiveModel ... matches ... search/reasoning/o1/o3`
    - `expensive model ... checkMode='skip'` 且 `shouldCallProbeChannel returns false`
- UI 动态证据（Chrome DevTools / 127.0.0.1）：
  - 登录后进入 `/admin/providers`，点击 OpenAI 行 `edit`。
  - 编辑弹窗字段为：`displayName / baseUrl / apiKey / adapter`，**无 `name` 输入框**。
  - 点击保存后出现 toast：`已保存`。
  - Network：`PATCH /api/admin/providers/{id}` 状态 `200`（reqid=56）。

## 风险与后续

- 生产观测项（10-13）尚未执行，需在目标代码部署并运行满 48h 后补证：
  1. 抓取 chatanywhere `day_usage_details`
  2. 抓取 OpenRouter activity API
  3. 核对 `gpt-4o-mini-search-preview` probe 调用计数
  4. 在生产 `/admin/providers` 复测一次 apiKey 编辑

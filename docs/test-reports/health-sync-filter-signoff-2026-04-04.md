# 健康检查与同步优化批次 Signoff 2026-04-04

> 状态：**PASS**
> 触发：`reverifying` 阶段复验通过，4/4 功能闭环

---

## 变更背景

本批次目标是降低图片健康检查成本、修复白名单清理在 API 失败时被安全防护跳过的问题，并收紧硅基流动与智谱的模型同步范围，只保留 `TEXT/IMAGE`。

---

## 变更功能清单

### F-HEALTH-01：图片通道健康检查改为 `/models` 轻量探测

**文件：**
- `src/lib/health/checker.ts`

**验收结果：**
- 图片健康检查不再调用 `imageGenerations()`
- 本地手动触发图片通道检查时，仅返回 `CONNECTIVITY` / `FORMAT` 两级，且均为 `PASS`

### F-SYNC-01：修复白名单清理被安全防护提前返回跳过的问题

**文件：**
- `src/lib/sync/model-sync.ts`

**验收结果：**
- 在 provider `/models` 返回空或失败时，cleanup 仍执行，reconcile 跳过
- 本地注入测试 channel 后触发 sync，非白名单 channel 会被禁用

### F-FILTER-SL：硅基流动只保留 `TEXT/IMAGE`

**文件：**
- `src/lib/sync/adapters/base.ts`
- `src/lib/sync/adapters/siliconflow.ts`

**验收结果：**
- `inferModality()` 现已正确区分：
  - `BAAI/bge-*` → `EMBEDDING`
  - `*reranker*` → `RERANKING`
  - `CosyVoice` / `SenseVoice` / `IndexTTS` / `whisper` → `AUDIO`
- `siliconflow` 非聊天模型在 sync 后会被禁用

### F-FILTER-ZP：智谱 AI 只保留 `TEXT/IMAGE`

**文件：**
- `src/lib/sync/adapters/zhipu.ts`

**验收结果：**
- `zhipu` 适配器已使用扩展后的 `inferModality()`
- 非 `TEXT/IMAGE` channel 在 sync 后会被禁用

---

## 未变更范围

| 事项 | 说明 |
|---|---|
| 真实 provider L2 调用 | 本轮仍基于本地 `3099`，未进行 Staging/生产全链路验证 |
| 产品实现之外的基础设施 | 未修改部署、数据库结构、依赖配置 |

---

## 类型检查

```text
codex-restart.sh 构建通过
Next.js build 成功
存在历史 ESLint warning，但无阻断错误
```

---

## Harness 说明

本批改动经 `verifying -> fixing -> reverifying` 流程完成复验。
Codex 作为 Evaluator 完成最终签收，`progress.json` 已更新为 `status: "done"`。

---

## 最终结论

本地 `3099` 复验结果为：

- `4 PASS`
- `0 PARTIAL`
- `0 FAIL`

本批次通过签收。

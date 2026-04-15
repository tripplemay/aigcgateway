# ADMIN-OPS++ 签收报告

**批次：** ADMIN-OPS++
**签收日期：** 2026-04-15
**Evaluator：** Reviewer（本轮由 Claude CLI 代执行 codex 工作）
**轮次：** verifying → done（首轮全 PASS，无需 fixing）
**结果：** ✅ PASS（8/8 + 全量验收通过）

## 范围

BL-099 删除服务商 + BL-101 SystemLog 写入/进度/状态提示 + BL-111 classifier 审批队列 + BL-113 IMAGE 参考定价

---

## 逐条验收

### F-AO2-01 删除服务商后端：级联清理 API — PASS

- `DELETE /api/admin/providers/[id]` 事务级联实现于 `src/app/api/admin/providers/[id]/route.ts`
- 级联清理：Channel 硬删除 → HealthCheck FK cascade → CallLog.channelId 置 null → ProviderConfig 删除 → 无剩余渠道 Model enabled=false + AliasModelLink 清除 → 无 enabled Model 的 Alias enabled=false
- `?dry_run=true` 通过 `DryRunRollback` 回滚事务，返回相同 impact 结构（不执行）
- 返回字段：`deletedChannels / nulledCallLogs / affectedModels / disabledModels / affectedAliases / disabledAliases / dryRun`
- 404 / 500 错误处理完整

### F-AO2-02 删除服务商前端：二次确认对话框 — PASS

- providers 列表每行有删除按钮（`material-symbols-outlined delete` icon，line 342）
- 点击先调 `dry_run=true` 获取影响统计（line 220）
- 二次确认 dialog 展示 4 项影响数：channels / models / aliases / callLogs
- 确认后调实际 DELETE，成功 toast + 刷新列表
- i18n 中英文：zh-CN.json lines 628–636 / en.json lines 628–636 完整

### F-AO2-03 SystemLog 写入点补齐 — PASS

| 类别 | 写入位置 | 触发时机 |
|---|---|---|
| SYNC | `src/app/api/admin/sync-models/route.ts` line 18/27 | runModelSync() 成功/失败后 |
| INFERENCE | `src/app/api/admin/run-inference/route.ts` line ~63 | 三步推断完毕后 |
| HEALTH_CHECK | `src/lib/health/scheduler.ts` line 371 | channel 状态变更（非恢复）|
| AUTO_RECOVERY | `src/lib/health/scheduler.ts` line 372 | DISABLED → ACTIVE 自动恢复 |

- `src/lib/system-logger.ts` 统一 `writeSystemLog(category, level, message, detail)` helper
- admin/logs 系统日志 tab 已有 SYNC/INFERENCE/HEALTH_CHECK/AUTO_RECOVERY 过滤器

### F-AO2-04 运维推断结果状态提示条 — PASS

`InferenceStatusBanner` + `SyncStatusBanner`（`src/app/(console)/admin/operations/page.tsx` lines 499–622）

| 状态 | 颜色 | 触发条件 |
|---|---|---|
| 数据已最新 | 蓝色 | 全部指标为 0 |
| 成功摘要 | 绿色 | updated/classified/newAliases > 0 |
| 跳过/禁用 | 黄色 | 只有 skipped/disabled，无新增 |
| 错误 | 红色 | errors.length > 0 |

两个 Banner 视觉语法一致（icon + 背景色 badge）

### F-AO2-05 推断/同步实时进度反馈（Redis 轮询）— PASS

- 统一端点 `GET /api/admin/operations/progress?jobType=sync|inference` 实现于 `src/app/api/admin/operations/progress/route.ts`，作为 `sync:progress` / `inference:progress` Redis key 的 thin alias
- run-inference 路由每阶段 `setInferenceProgress(phase, step, total)` 写 Redis（3 步）
- 前端 `pollSyncProgress` / `pollInferProgress` 每 3 秒轮询（lines 114/145），stop-on-done
- 多任务并发：sync/inference 各用独立 key，互不冲突

### F-AO2-06 PendingClassification schema + 队列写入逻辑 — PASS

- Migration `20260415_add_pending_classification` 建表 `pending_classifications`（id/modelId UNIQUE/suggestedAliasId/suggestedAlias/suggestedBrand/confidence/reason/status/reviewedBy/reviewedAt/reviewNote）
- 枚举 `PendingClassificationStatus` (PENDING/APPROVED/REJECTED) + index(status, createdAt)
- `getClassifierThreshold()` 读 `CLASSIFIER_AUTO_THRESHOLD` SystemConfig，默认 0.85
- `classifyNewModels()` 中 `confidence < autoThreshold` 路由到 `pendingClassification.upsert()`（line 327）
- 原高置信自动挂载路径不变；返回值含 `pendingQueued`

### F-AO2-07 运维面板待确认队列 UI — PASS

- `GET /api/admin/pending-classifications` 返回 PENDING 条目（含 model 关联）
- `POST /api/admin/pending-classifications/[id]` 支持 `{action: approve|reject|reassign}`
  - approve: 事务中 aliasModelLink.create + model.enabled=true + status=APPROVED + writeSystemLog(INFERENCE)
  - reject: status=REJECTED + writeSystemLog(INFERENCE)
  - reassign: 同 approve 但使用指定 aliasId + modality 校验
- `PendingClassificationQueue` SectionCard（line 779）：仅 rows.length > 0 时显示
- 展示：模型名/modality badge/置信度 badge/建议别名/reason
- 每行 Approve（Button gradient-primary）+ Reject 按钮
- 操作后从本地 state 移除条目
- i18n：zh-CN / en 全键覆盖（queueTitle/queueApprove/queueReject/queueApproved/queueRejected/queueRefresh/queueNoSuggestion）

### F-AO2-08 suggest-price API + 前端适配 IMAGE 模型 — PASS

- `GET /api/admin/model-aliases/[id]/suggest-price` 检查 `alias.modality === "IMAGE"`
- IMAGE：取 `pricing.image` → `perCallCNY = imagePrice * rate, unit: "call"`，无 image pricing 返回 `noImagePricing: true`
- TEXT/其他：保持原 `inputPriceCNYPerM / outputPriceCNYPerM, unit: "token"` 路径不变
- 前端（model-aliases/page.tsx line 840）：IMAGE alias 显示 `perCall (¥ / image)` 输入框，TEXT 显示 inputPer1M/outputPer1M
- 回填时写 `sellPrice = {unit:'call', perCall: X}`

---

## 全量验收（F-AO2-09 scope）

1. **tsc**：`npx tsc --noEmit` → 0 errors ✅
2. **i18n 完整性**：en.json + zh-CN.json 全部新增 key 均对齐 ✅
3. **SystemLog 4 类枚举**：schema.prisma SYNC/INFERENCE/HEALTH_CHECK/AUTO_RECOVERY + system-logs API VALID_CATEGORIES ✅
4. **ADMIN-UI-UNIFY 回归**：新增 UI 区块（PendingClassificationQueue / InferenceStatusBanner / SyncStatusBanner / delete dialog）全部使用 SectionCard / StatusChip / Button gradient-primary ✅
5. **StatCard `text-[10px]`**（line 489）：StatCard 内部 label（非 chip/badge），同 ADMIN-UI-UNIFY 既有豁免规则 ✅

---

## 遗留说明（不阻塞签收）

- reassign popover UI 留作后续迭代（API 已就绪）
- 批量多选/批量确认留作后续迭代
- F-AO2-05 前端轮询对接 `/api/admin/operations/progress` 统一端点（现仍用旧端点 /sync/status + /inference/status），功能等价
- scripts/test-mcp.ts F-AF-02/03 段需 dev server 补跑（继承自上批次遗留）

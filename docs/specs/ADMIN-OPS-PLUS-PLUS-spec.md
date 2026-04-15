# ADMIN-OPS++ 批次规格文档

**批次代号：** ADMIN-OPS++
**目标：** 合并 4 条管理端功能增强（BL-099/101/111/113），提升管理员日常运维能力
**触发时机：** ADMIN-UI-UNIFY 签收（已满足）
**规模：** 9 个 generator + 1 个 codex 验收 = 10 条

## 背景

ADMIN-UI-UNIFY 完成了 9 个 admin 页面的 UI 对齐，但**业务能力**仍有 4 个已确认的缺口：

| Backlog | 描述 | 规模 |
|---------|------|------|
| BL-099 | 删除服务商（硬删除 + 级联清理） | 中 |
| BL-101 | 运维推断提示 + SystemLog 分类写入 + 实时进度 | 中（表已存在，只差写入和展示） |
| BL-111 | alias-classifier 审批队列（根治 LLM 分类污染） | 大（新表 + 队列逻辑 + UI） |
| BL-113 | 参考定价功能适配 IMAGE 模型（per-call 定价源） | 小 |

**已有基础：**
- SystemLog 表和 SystemLogCategory enum 已在 schema 中（F-RL-07 引入了 RATE_LIMIT 分类写入；F-AUU-06 把 admin/logs 改造成双 Tab 已有"系统日志"壳）
- Redis 基础设施可用（RATE-LIMIT 批次已对接 Redis）

## Features

### Phase 1：BL-099 删除服务商

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-AO2-01 | 删除服务商后端：级联清理 API | high | 1) DELETE /api/admin/providers/[id] 在事务中执行：删除 Provider 下所有 Channel → 级联 HealthCheck → CallLog.channelId 置 null（保留历史）→ 删除 ProviderConfig；2) 检查每个受影响 Model：无其他 Channel 则 enabled=false 并清理 AliasModelLink；3) 检查每个受影响 ModelAlias：无关联 enabled Model 则 enabled=false；4) 返回影响统计：deletedChannels / affectedModels / affectedAliases / nulledCallLogs；5) tsc 通过 |
| F-AO2-02 | 删除服务商前端：二次确认对话框 | high | 1) admin/providers 页面每行增加"删除"按钮（危险色）；2) 点击先调用 DELETE dry-run（query ?dry_run=true）获取影响统计；3) 弹出二次确认对话框显示：「将删除 X 渠道，Y 模型失去关联，Z 别名将被禁用」；4) 确认后调用实际 DELETE；5) 成功后刷新列表；6) i18n 中英文；7) tsc 通过 |

### Phase 2：BL-101 运维可观测

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-AO2-03 | SystemLog 写入点补齐（SYNC/INFERENCE/HEALTH_CHECK/AUTO_RECOVERY） | medium | 1) model-sync.ts 执行完毕写 SystemLog(SYNC, level=INFO/WARN/ERROR, detail={provider, models_added, models_removed, errors})；2) alias-classifier 执行完毕写 SystemLog(INFERENCE, detail={batch_size, batches_processed, aliases_created, errors})；3) health checker 检测到状态变更时写 SystemLog(HEALTH_CHECK, detail={channel, prev_state, new_state})；4) channel 自动恢复时写 SystemLog(AUTO_RECOVERY)；5) tsc 通过 |
| F-AO2-04 | 运维推断结果状态提示条 | medium | 1) admin/operations 的推断面板执行后显示状态提示条（Alert 组件）；2) 全为 0 显示蓝色'数据已最新'；3) 有更新显示绿色成功摘要 '新增 X, 更新 Y'；4) 有跳过显示黄色警告；5) 有错误显示红色 + 可展开错误列表；6) 模型同步面板同步视觉处理；7) i18n 中英文；8) tsc 通过 |
| F-AO2-05 | 推断/同步实时进度反馈（Redis 轮询） | medium | 1) model-sync 和 alias-classifier 启动时写 Redis key `progress:${jobType}:${jobId}` = {current, total, phase, message}；2) 执行过程中每处理完一个 batch/provider 更新；3) 新增 GET /api/admin/operations/progress 轮询接口返回当前进度；4) admin/operations 前端启动任务后每 3 秒轮询，显示进度条和阶段文本；5) 完成后清理 Redis key；6) tsc 通过 |

### Phase 3：BL-111 classifier 审批队列

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-AO2-06 | PendingClassification schema + 队列写入逻辑 | high | 1) 新增 PendingClassification 表（migration）：id / modelId / suggestedAliasId / suggestedBrand / confidence / reason / status(PENDING\|APPROVED\|REJECTED) / createdAt / reviewedBy / reviewedAt / reviewNote；2) alias-classifier 改造：高置信（名称完全匹配已有别名）自动挂载（保留现有逻辑）；3) 低置信或建议新别名的结果写 PendingClassification 而非直接挂载；4) 阈值可配置（SystemConfig CLASSIFIER_AUTO_THRESHOLD，默认 0.85）；5) tsc 通过 |
| F-AO2-07 | 运维面板待确认队列 UI | high | 1) admin/operations 增加"待确认分类"SectionCard（仅在有 pending 条目时显示）；2) 列表展示：模型名 / 建议别名 / 置信度 / 建议原因；3) 每行三个操作：确认（挂载到建议别名）/ 拒绝（标记 REJECTED 不挂载）/ 改分配（弹窗选择其他别名）；4) 批量确认按钮；5) 操作后写 SystemLog(INFERENCE, detail={action, model, alias})；6) i18n；7) tsc 通过 |

### Phase 4：BL-113 IMAGE 参考定价

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-AO2-08 | suggest-price API + 前端适配 IMAGE 模型 | medium | 1) GET /api/admin/model-aliases/[id]/suggest-price 对 modality=IMAGE 别名返回 perCall 参考价格（从 OpenRouter pricing.image 字段提取）；2) 前端参考定价按钮对 IMAGE 别名显示 perCall 单位；3) 回填时写入 sellPrice={unit:'call', perCall:X}；4) TEXT 模型行为不变；5) tsc 通过 |

### Phase 5：验收

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-AO2-09 | ADMIN-OPS++ 全量验收 | high | codex 执行：1) 删除服务商完整链路（dry-run + apply + 级联影响）；2) SystemLog 4 类均有写入记录（SYNC/INFERENCE/HEALTH_CHECK/AUTO_RECOVERY）；3) admin/logs 系统日志 tab 可查看；4) 运维推断结果状态提示条 4 种状态（最新/成功/警告/错误）；5) 推断/同步实时进度轮询可用；6) PendingClassification 队列工作流（写入 → UI 显示 → 确认/拒绝 → 审计日志）；7) IMAGE 别名 suggest-price 返回 perCall；8) 业务逻辑回归（其他 admin 功能不受影响）；9) 签收报告生成 |

## 推荐执行顺序

1. **F-AO2-08** BL-113 IMAGE 定价（最小、独立）
2. **F-AO2-01 + F-AO2-02** BL-099 删除服务商（完整闭环）
3. **F-AO2-03** BL-101 SystemLog 写入（为后续 UI 铺路）
4. **F-AO2-04** BL-101 状态提示条（前端收尾）
5. **F-AO2-05** BL-101 进度轮询（较复杂的 Redis 交互）
6. **F-AO2-06 + F-AO2-07** BL-111 classifier 审批队列（依赖 SystemLog 写入）
7. **F-AO2-09** 验收

## 关键约束

- **不改 ADMIN-UI-UNIFY 的 UI 成果** — 所有新 UI 继续使用 PageContainer/SectionCard/TableCard/StatusChip 公共组件
- **删除服务商必须二次确认** — 防止误操作
- **PendingClassification 不影响高置信自动挂载** — 只拦截低置信结果
- **实时进度使用 Redis 而非 SSE** — 简化实现，3 秒轮询够用

## 遗留项（不在本批次）

- 创建 Provider 时自动创建 ProviderConfig（BL-101 子项）— 独立小 bug 修复
- classifier 阈值调优和 UI 可视化 — 后续优化

# DX-POLISH 批次规划草案

**状态：** 草案（等 AUDIT-SEC 签收后正式创建 features.json）
**来源：** MCP 8 角色审计 2026-04-12，未被 AUDIT-SEC 覆盖的 medium/low 问题 + 补漏的 high
**规模：** 11 个 generator + 1 个 codex 验收 = 12 条

## Features

| ID | 标题 | 优先级 | 来源断言 | 验收标准 |
|----|------|--------|---------|---------|
| F-DP-01 | sellPrice 写入路径加精度保障（round 到 6 位小数） | medium | FIN-003/CHAOS-009/DX-004 | 管理端保存 sellPrice 时 round 到 6 位；Prisma middleware 或 API 层统一处理；不依赖一次性 backfill |
| F-DP-02 | deprecated 标记同步到 list_models | medium | FIN-004/DX-006 | get_usage_summary 中 deprecated=true 的模型，list_models 返回时也带 deprecated 字段；或从 list_models 中移除 |
| F-DP-03 | list_models capability 参数加 enum 约束 | low | DX-005 | capability 参数 zod schema 从 z.string() 改为 z.enum([...])，包含 function_calling/vision/json_mode/reasoning/search/streaming/system_prompt |
| F-DP-04 | list_logs model 参数示例修正 | low | DX-007 | description 中的示例从 'openai/gpt-4o' 改为 'gpt-4o-mini'（canonical name 格式） |
| F-DP-05 | MCP 错误消息措辞统一 | low | IDOR-001/002 | get_action_detail/delete_action/get_template_detail/delete_template 的 not found 错误统一为 'not found in this project' |
| F-DP-06 | 数据修正：deepseek-r1 capabilities + grok-4.1-fast/minimax-m2.5 contextWindow | medium | MC-001/MC-004/DX-003/DX-011 | deepseek-r1 function_calling=true；grok-4.1-fast 和 minimax-m2.5 contextWindow 填入准确值；通过管理端编辑或 migration 修正 |
| F-DP-07 | reasoning 模型 max_tokens 独立计量 + max_reasoning_tokens 参数 | **high** | FIN-002 | 1) usage 中增加 reasoning_tokens 字段（与 completion_tokens 分开）；2) chat 参数增加 max_reasoning_tokens；3) reasoning 模型的实际 completion_tokens 受 max_tokens 约束 |
| F-DP-08 | json_mode 返回自动剥离 markdown code fence | medium | CHAOS-008 | chat(response_format={type:'json_object'}) 的 response content 为裸 JSON 字符串，自动剥离 ```json ... ``` 包裹 |
| F-DP-09 | chat 增加 modality 校验，拒绝 image 模型作 text chat | medium | CHAOS-006 | chat(model=<image_modality_alias>) 返回 400 invalid_model_modality 错误，提示使用 generate_image |
| F-DP-10 | ttftMs 字段在非流式调用时省略或标 N/A | low | FIN-006 | get_log_detail 对 stream=false 的调用不返回 ttftMs/ttft 字段；stream=true 时始终返回有效数值 |
| F-DP-11 | capability 过滤按 modality 隔离 | medium | DX-012 | list_models(capability='vision') 在 text/image 两个 modality 下行为一致且语义明确；capabilities schema 在 text/image 中统一或按 modality 拆分 |
| F-DP-12 | DX-POLISH 全量验收 | high | - | 11 个 generator 功能全部通过，签收报告生成（codex） |

## 推荐执行顺序

1. **F-DP-07**（high，计费相关，影响用户成本控制）
2. **F-DP-01**（sellPrice 精度，影响数据质量）
3. **F-DP-02**（deprecated 标记，数据一致性）
4. **F-DP-06**（数据修正）
5. **F-DP-08 / F-DP-09 / F-DP-11**（模态/格式校验，需要代码逻辑改动）
6. **F-DP-03 / F-DP-04 / F-DP-05 / F-DP-10**（低风险 DX 改进，可批量处理）

## 未纳入的断言（已评估后放弃）

| 断言 | 原因 |
|------|------|
| FIN-005 | get_balance transactions 空数组 — 需要单独设计分页 API，非简单修复 |
| DX-009 | gpt-image-mini 比 gpt-image 贵 — 定价策略问题，非 bug |

## 启动条件

- AUDIT-SEC 签收完成（Codex 完成 F-AS-08 验收）
- 生产环境部署 AUDIT-SEC 并执行 `backfill-supported-sizes.ts --apply`
- 本草案转正为 `features.json` + `progress.json`（status: building）

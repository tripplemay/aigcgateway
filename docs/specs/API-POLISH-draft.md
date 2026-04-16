# API-POLISH 批次草案

**批次代号：** API-POLISH
**目标：** 最终打磨 — 覆盖 reports-20260416 剩余的 medium/low DX 改进
**触发时机：** AUDIT-FOLLOWUP-2 签收后
**规模：** 8 个 generator + 1 个 codex 验收 = 9 条
**来源：** reports-20260416 的 medium/low 断言中未被覆盖的

## Features

| ID | 标题 | 来源 | 验收要点 |
|----|------|------|---------|
| F-AP-01 | get_balance transactions 分页（limit/offset/hasMore） | FIN-006 | get_balance(include_transactions=true, limit=20, offset=0) 支持分页；返回 hasMore 字段 |
| F-AP-02 | list_logs 增加 action_id / template_id 过滤参数 | DX-012 | list_logs(action_id='xxx') 只返回该 Action 触发的日志；与 get_usage_summary 过滤维度对齐 |
| F-AP-03 | list_actions 增加 totalVersions 字段 | DX-013 | list_actions 返回每个 Action 的 totalVersions，无需进入 get_action_detail 即可感知版本数量 |
| F-AP-04 | create_api_key 增加 expiresAt 参数 | DX-015 | create_api_key(name, expiresAt?) 支持可选过期时间；过期后 Key 自动标记 REVOKED |
| F-AP-05 | rate_limit 错误增加 retryAfterSeconds 字段 | RL-001 | 429 错误响应体包含 retryAfterSeconds 数值字段，客户端可据此实现退避 |
| F-AP-06 | image 模型 usage_summary totalTokens 修正 | DX-009 | modality=image 的模型在 get_usage_summary 中 totalTokens 显示为 0（不展示 token 计量）|
| F-AP-07 | max_tokens 校验引用 maxOutputTokens + 错误语言统一 | RL-007 + DX-014 | max_tokens 超限时引用 model.maxTokens（而非 contextWindow）；所有错误消息统一为英文 + error_code 枚举 |
| F-AP-08 | generate_image size 参数增加 enum 提示 | DX-008 | generate_image schema 的 size 字段 description 列出常见合法值；或运行时对传入 size 与 supportedSizes 做交叉校验（已有 invalid_size 逻辑，本条确认 schema 层面也有提示） |
| F-AP-09 | 余额显示从 USD 转换为 CNY | 用户反馈 | 侧边栏/dashboard/balance 页面的余额显示从 `$49.93` 改为 `¥364.49`（按 SystemConfig USD_TO_CNY_RATE 或 env EXCHANGE_RATE 换算）；所有前端 `$` 前缀替换为 `¥`；API 层 balance 字段仍返回 USD 原值（不改后端），前端展示层做转换 |
| F-AP-10 | API-POLISH 全量验收 | — | codex 执行全部 9 项验证 + 签收报告 |

## 不在本批次

- stop 序列不生效（上游行为，文档说明即可）
- JSON mode prompt injection（文档说明即可）
- function calling 函数名过滤（安全建议，优先级低）
- supportedSizes 含 'auto' 说明（文档即可）

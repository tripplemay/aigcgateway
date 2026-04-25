---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-IMAGE-PRICING-OR-P2：`building`**（4 features，启动 @ 2026-04-25 12:30）
- 上一批次 BL-BILLING-AUDIT-EXT-P2：done @ 2026-04-25 12:15（15/15 PASS / fix_rounds=0）
- 上上一批次 BL-BILLING-AUDIT-EXT-P1：done @ 2026-04-25 01:35

## 本批次 OR-P2 范围
- F-BIPOR-01 critical: 6 条 OR image channel token 定价 UPDATE（dry-run/--apply/幂等）
- F-BIPOR-02 high: PL/pgSQL trigger 校验 IMAGE channel costPrice 必须有效（call 或 token 至少一个非零）
- F-BIPOR-03 high: OR token 计价 call_logs.costPrice 反算单测（最外层 fetch mock）+ smoke 脚本
- F-BIPOR-04 critical codex: 12 项验收

## 决策（继承 P1）
- USD 口径 + sellPrice = costPrice × 1.2
- 数据源 OR /api/v1/models canonical
- 不修 gpt-image-2 / -ca（保守填值沿用）
- 不回填历史 call_logs

## 6 条 OR channel 定价（spec § 3.1）
- google/gemini-2.5-flash-image: 0.30/2.50（输入/输出 per 1M USD）
- google/gemini-3-pro-image-preview: 2.00/12.00
- google/gemini-3.1-flash-image-preview: 0.50/3.00
- openai/gpt-5-image: 10.00/10.00
- openai/gpt-5-image-mini: 2.50/2.00
- openai/gpt-5.4-image-2: 8.00/15.00

## Framework v0.9.4 应用自检
- spec § 6 已逐条勾选铁律 1/1.1/1.2/1.3/2/2.1
- F-BIPOR-03 强制要求最外层 fetch mock（v0.9.4 测试 mock 层级铁律）
- 阈值 1.19-1.21 显式 + ±1e-6 浮点容差（v0.9.4 铁律 1.3）

## 后续 backlog（按 order）
- BL-SEC-* (1-4): 安全加固（按"接支付前启动"延后）
- BL-FE-PERF-01 (5) / BL-FE-QUALITY (6) / BL-DATA-CONSISTENCY (7) / BL-INFRA-RESILIENCE (8) / BL-SEC-POLISH (9) / BL-INFRA-ARCHIVE (10)

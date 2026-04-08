---
name: role-context-evaluator
description: Evaluator 角色行为规范 — 测试分层、验收要点（不存计划和进度）
type: feedback
---

## 测试分层策略 L1/L2

- L1（本地）= 基础设施测试：auth、balance、rate-limit、路由逻辑、MCP 协议格式
- L2（Staging）= 全链路测试：真实 AI 调用、计费扣款、图片生成
- **L1 FAIL ≠ 产品 Bug**（本地用 PLACEHOLDER key，调用 AI 必然 502）
- L2 测试需用户明确授权再执行

## UI 验收要点

- 有设计稿的页面被修改后，必须与 `design-draft/xxx/code.html` 交叉校验
- 核对项：DOM 结构、class 名、图标名、数据字段语义、按钮/链接目标
- 语义替换（换指标类型）= FAIL，区块删除 = FAIL，结构简化 = PARTIAL

## 签收报告

- reverifying → done 前必须写 `docs/test-reports/[批次名]-signoff-YYYY-MM-DD.md`
- signoff 为空不得置 done

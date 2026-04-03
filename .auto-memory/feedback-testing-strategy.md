---
name: feedback-testing-strategy
description: 分层测试策略：L1（本地基础设施）vs L2（Staging 全链路），L1 FAIL 不等于产品 Bug
type: feedback
---

采用两层测试策略，L1 和 L2 职责分离。

**Why:** L1 本地环境使用 PLACEHOLDER provider key，调用真实 AI 服务商必然 502，这是预期行为而非产品 Bug。混在一起测会产生大量误报。

**How to apply:**
- L1（本地）= 基础设施测试：auth、balance、rate-limit、路由逻辑、MCP 协议格式，不依赖真实 provider key
- L2（Staging）= 全链路测试：真实 AI 调用、计费扣款、图片生成、日志全文搜索
- L1 FAIL 不代表 L2 FAIL；L2 测试需要用户明确授权再执行
- 相关文档：`AGENTS.md` §17、`docs/test-cases/mcp-integration-test-cases.md`（已标注 [L1]/[L2] 列）

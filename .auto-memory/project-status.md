---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- SUP1-security-ui-polish：`fixing`（Evaluator 首轮：4 PASS / 1 PARTIAL / 1 FAIL）
- 安全加固：BL-070 邮箱验证防伪造 / BL-071 JWT 启动拦截 / BL-072 限流回滚修复
- UI 打磨：BL-105 假数据清理(10处) / BL-103 千位分隔符 / BL-094 重名校验
- 当前阻塞：BL-072 templates/run 失败请求后第二次触发 429（回滚缺口）；BL-103 在 admin/model-aliases 与 models 缺少 toLocaleString 格式化

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1

## Backlog（9 条）
- BL-065(支付验签,延后) / BL-068(Keys Insights) / BL-073(高风险测试)
- BL-104(项目切换) / BL-102(别名数据质量二期) / BL-101(运维提示+系统日志)
- BL-099(删除服务商) / BL-090(用户文档更新) / BL-080(项目文档更新)

## 后续批次规划
- ADMIN-OPS(BL-099+101) → DQ2(BL-102) → DOCS(BL-090+080) → INSIGHTS(BL-068+104)

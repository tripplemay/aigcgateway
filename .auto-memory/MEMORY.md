# Memory Index

## T0 — 每次启动必读
- [项目状态快照](project-status.md) — 当前批次、重构计划、backlog、遗留问题（覆盖写，≤30 行）
- [环境信息](environment.md) — 生产地址、服务器配置、测试账号

## T1 — 按当前角色加载
- [Generator 行为规范](role-context/generator.md) — 设计稿还原规则、编码约定、设计系统 | 加载：角色为 Generator 时
- [Evaluator 行为规范](role-context/evaluator.md) — 测试分层 L1/L2、UI 验收、签收报告 | 加载：角色为 Evaluator 时
- [Planner 行为规范](role-context/planner.md) — 需求处理、角色分配、done 收尾、框架维护 | 加载：角色为 Planner 时

## T2 — 触发条件命中时加载
- [用户角色与工作方式](user-role.md) — 独立开发者，中文沟通，偏好直接结论 | 加载：需要调整沟通风格时
- [文档结构与查阅入口](reference-docs.md) — specs/、provider/、design-draft/ 用途 | 加载：需要查找文档时

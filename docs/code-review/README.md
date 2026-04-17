# Code Review

本目录存放两类审查报告，二者互为补充。

## 目录结构

```
docs/code-review/
├── README.md              # 本文件
├── TEMPLATE-daily.md      # 日审模板
├── batch-*.md             # 全量批次审查（按模块切分，一次性完成）
└── daily/
    └── YYYY-MM-DD.md      # 每日增量审查（由 Claude 桌面端 routine 生成）
```

## 两类报告的差异

| 维度 | 全量批次审查（batch-*.md） | 每日增量审查（daily/*.md） |
|---|---|---|
| 触发方式 | 手动，按模块一次性跑 | Claude 桌面端 routine，每晚自动跑 |
| 范围 | 整个模块的所有代码 | 最近 24 小时 main 分支的新 commit |
| 产出 | 发现历史遗留问题 | 发现新增代码中的风险 |
| 修复 | Planner 评估后进入 backlog | 阻断项立即反馈，关注项可进 backlog |

## 严重级别

统一使用四档，和批次报告保持一致：

- **Critical（阻断）**：资金安全 / 鉴权绕过 / 数据泄露 / 生产级崩溃
- **High（高）**：有明确利用路径的漏洞、性能回退、一致性破坏
- **Medium（中）**：代码质量、潜在风险、违反项目规约
- **Low / Info（低 / 提示）**：命名、注释、可读性、可选优化

## 审查人遵循的边界

- **不修改源码、不触发部署、不改状态机文件**（progress.json / features.json / .auto-memory/ 等）
- **只产出报告**，修复由 Planner 分发给 Generator 走状态机流程
- 发现 Critical 级别问题时，在报告顶部加 `[URGENT]` 标记

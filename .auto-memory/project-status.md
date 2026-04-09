---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- M1c-models-page-topbar-cleanup：`done`（reverifying 6 PASS / 0 FAIL）
- spec：`docs/specs/M1-models-page-rework-spec.md`
- signoff：`docs/test-reports/m1c-models-page-topbar-cleanup-signoff-2026-04-10.md`

## M1c 修复摘要
- models/page.tsx: MODALITY_STYLES + Vision badge + Free + 装饰圆 → DS tokens
- top-app-bar.tsx: 全面替换 slate/hex → DS tokens
- BRAND_COLORS 保留 hex（外部品牌标识）；复验脚本已按该例外校验，其余颜色均满足 DS token

## 已完成批次
- R1~R4：UI 重构全部签收
- P5：公共模板库（签收）
- M1a/M1b：别名后端核心 + 自动化 + Admin UI（签收）

## Backlog
- 5 条待处理（BL-065~073，含 2 条 high 安全修复）

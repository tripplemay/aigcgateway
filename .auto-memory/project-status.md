---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-IMAGE-PRICING-OR-P2：`done` @ 2026-04-26 08:40 UTC**（Codex signoff PASS）
- 上一批次 BL-BILLING-AUDIT-EXT-P2：done @ 2026-04-25 12:15

## OR-P2 签收结论
- 生产 HEAD `278b18c`，PM2 `aigc-gateway` 在线
- 本地 `npm run build` PASS；`npx tsc --noEmit` PASS；`npx vitest run` 390 PASS
- 生产 migration transaction dry-run PASS；DB trigger IMAGE zero update blocked / TEXT zero update passed
- P1 image pricing restore script PASS：30 channels inspected，exit 0
- OR 6 条 token-priced image channel PASS：costPrice/sellPrice 匹配 spec，脚本幂等 exit 0
- 全库 IMAGE scan PASS：`imageCount=39`，`invalidImageCount=0`
- 真实 image smoke PASS：`google/gemini-2.5-flash-image` costPrice=0.0032368，公式 diff=0
- model-sync 回归 PASS：`POST /api/admin/sync-models` 后 6 OR + 全部 IMAGE channel costPrice 保持有效

## 状态文件
- `progress.json`: status=`done`，docs.signoff 已填
- `features.json`: F-BIPOR-01~05 全部 completed
- Signoff: `docs/test-reports/BL-IMAGE-PRICING-OR-P2-signoff-2026-04-26.md`
- Artifacts: `docs/test-reports/artifacts/bl-image-pricing-or-p2-2026-04-26-codex/`

## 后续 backlog
- BL-IMAGE-LOG-DISPLAY-FIX (103)：base64 转存对象存储 + 前端图片预览（OR-P2 done 后启动）
- BL-SEC-* (1-4): 安全加固（接支付前启动）

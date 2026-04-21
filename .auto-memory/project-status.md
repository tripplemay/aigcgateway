---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-IMAGE-PARSER-FIX：`fixing`**（reverifying 2026-04-21 未通过）
- 主因：`F-IPF-03` #7 FAIL，#10 BLOCKED，未满足 signoff

## 本轮复验结果（Reviewer）
- 本地门禁 PASS：`npm run build` / `npx tsc --noEmit` / `npx vitest run (224/224)`
- 定向测试 PASS：`image-via-chat.test.ts + image-via-chat-e2e.test.ts = 8/8`
- 生产已部署目标版本：`5acfa2b`
- 生产 smoke：
  - gemini-3-pro-image：HTTP 200，但返回 proxy URL（非 data URI 直返）→ #7 FAIL
  - gpt-image：HTTP 200 + b64_json 图片
  - gpt-image-mini：HTTP 200 + proxy URL（call_log 原始 URL 为 data URI）

## 阻塞与待修
- #7 口径冲突：当前实现返回 proxy URL，不满足验收“data:image/png;base64 直返”
- #10 量化阻塞：pm2 logs 无时间戳，无法计算“部署前后 1h 降幅 >80%”
- `docs.signoff` 仍为 `null`，批次不可置 `done`

## 证据目录
- `docs/test-reports/BL-IMAGE-PARSER-FIX-reverifying-2026-04-21.md`
- `docs/test-reports/artifacts/bl-image-parser-fix-prod-reverify-2026-04-21/`

---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-IMAGE-PARSER-FIX：`fixing`**（reverifying round4 失败）
- 生产与本地版本一致：`e9e8963`

## round4 复验结果（Reviewer）
- L1 全通过：`npm run build` / `npx tsc --noEmit` / `npx vitest run` = `228/228`
- 定向全通过：`image-via-chat` 8/8；`image-proxy` 14/14
- 生产 smoke：
  - `gemini-3-pro-image`：HTTP 200 + data URI 直返
  - `gpt-image`：HTTP 200 + b64_json
  - `gpt-image-mini`：HTTP 200 + data URI 直返

## 未通过项
- #10（Round3 裁决 SQL 口径）失败：`before_count=0, after_count=0, assertion_pass=false`
- #11 signoff 因 #10 FAIL 被阻断，`docs.signoff` 仍为 `null`

## 证据目录
- `docs/test-reports/BL-IMAGE-PARSER-FIX-reverifying-2026-04-21.md`
- `docs/test-reports/artifacts/bl-image-parser-fix-prod-reverify-2026-04-21/`

---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-IMAGE-LOG-DISPLAY-FIX：`building`**（4 features，启动 @ 2026-04-26 09:00）
- 上一批次 BL-IMAGE-PRICING-OR-P2：done @ 2026-04-26 08:40（13/13 PASS / fix_rounds=2 含 mid-impl 裁决）
- 上上一批次 BL-BILLING-AUDIT-EXT-P2：done @ 2026-04-25 12:15

## 本批次 X 方案范围
- F-ILDF-01 critical: 后端 base64 strip（post-process.ts processImageResultAsync 落库前 summarizeImageUrl 转 metadata `[image:fmt, NKB]`，http(s) URL 透传）
- F-ILDF-02 high: 前端 logs/[traceId]/page.tsx 识别 http(s) image URL → `<img>` 预览；其他文本走 div
- F-ILDF-03 medium: 历史 30d 回填脚本 strip-image-base64-2026-04-26.ts（dry-run/--apply/幂等）
- F-ILDF-04 critical codex: 12 项验收（OR/volcengine smoke + 客户端 API 透传保护 + 浏览器秒开）

## 决策（用户 2026-04-26 拍板）
- 简化 X：strip base64 + 前端识别 http(s)，不接对象存储
- 客户端 API 响应不变（OR base64 透传给调用方）
- 30d 回填（与 P2 call_logs TTL 对齐）
- 保留未来升 C 方案（GCS/TOS）路径不阻塞

## Framework v0.9.5 应用（spec § 6 自检）
- 铁律 1.4 ✓ 同步路径写入，不涉及周期任务
- 铁律 1.2 ✓ 不依赖运维
- 测试 mock 层级 ✓ F-ILDF-01 集成测试最外层 fetch mock
- CLI 脚本退出 ✓ F-ILDF-03 close prisma + redis

## 生产前置
- 无（不需新凭证 / 不接外部服务）

## 后续 backlog
- BL-SEC-* (1-4): 安全加固（接支付前启动）
- BL-FE-PERF-01 (5) / BL-FE-QUALITY (6) / BL-DATA-CONSISTENCY (7) / BL-INFRA-RESILIENCE (8) / BL-SEC-POLISH (9) / BL-INFRA-ARCHIVE (10)

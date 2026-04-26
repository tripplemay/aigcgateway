---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-IMAGE-LOG-DISPLAY-FIX：`verifying`**（3/4 generator 完成 → 等 Codex 12 项验收）
- 上一批次 BL-IMAGE-PRICING-OR-P2：done @ 2026-04-26 08:40（13/13 PASS / fix_rounds=2）
- 上上一批次 BL-BILLING-AUDIT-EXT-P2：done @ 2026-04-25 12:15

## 本批次 X 方案已交付
- F-ILDF-01: post-process.ts summarizeImageUrl（RFC 2397，多 param mime 兼容） + processImageResultAsync 在 responseContent + original_urls 应用
- F-ILDF-02: logs/[traceId]/is-image-url.ts 独立 helper + page.tsx 识别 http(s) image URL → `<img>`；i18n responseImage 双语
- F-ILDF-03: scripts/maintenance/strip-image-base64-2026-04-26.ts 30d 回填；planBackfillRow 解耦 + try/finally 保证 prisma+redis close

## 验证（本地）
- vitest 414 PASS（+24 from 390）/ tsc / build 全过

## Codex F-ILDF-04 12 项验收
- 构建 4 + OR/volcengine smoke 5 + 浏览器 2 + signoff 1
- 关键 #5：OR image → call_log.responseContent ≤ 200B 形如 `[image:fmt, NKB]`
- 关键 #7：客户端 API 响应 OR 仍透传完整 base64（不影响调用方）
- 关键 #8/#9：strip 脚本 --apply 退出 0 + 重跑 0 rows would update（幂等）
- 关键 #11：浏览器 OR traceId 详情页秒开，无 base64 乱码

## 生产部署链
1. GitHub Actions deploy
2. ssh: npx tsx scripts/maintenance/strip-image-base64-2026-04-26.ts → dry-run 看 X rows
3. --apply 实际写入
4. 触发 OR/volcengine image smoke + 浏览器查看 logs 详情页

## 决策（用户 2026-04-26 拍板）
- 简化 X：strip + 前端识别 http(s)，不接对象存储
- 客户端 API 响应不变（OR base64 透传给调用方）
- 30d 回填（与 P2 call_logs TTL 对齐）
- 保留未来升 C 方案路径不阻塞

## 后续 backlog
- BL-SEC-* (1-4): 安全加固（接支付前启动）
- BL-FE-PERF-01 (5) / BL-FE-QUALITY (6) / BL-DATA-CONSISTENCY (7) / BL-INFRA-RESILIENCE (8) / BL-SEC-POLISH (9) / BL-INFRA-ARCHIVE (10)

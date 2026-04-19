---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-SEC-POLISH：`verifying`**（Generator 3/3 done，等 Codex F-SP-04 18 项）
- Path A 进度 9/11

## 上一批次（BL-INFRA-RESILIENCE done）
- 15/15 PASS，fix_rounds=1
- 产物：fetchWithTimeout 双 API + rpmCheck Lua + reconcile batch

## 本批次交付（Generator）
- **AUTH**：login 总 bcrypt.compare 恒定时长 + cost 10→12 + rehash + 2 级 rate limit（IP 10 / account 5）
- **SSRF+CT**：url-safety.ts（https + RFC1918/loopback/metadata/ULA 黑名单）+ dispatcher/test-webhook/image-proxy 接入 + CT 白名单 + nosniff
- **脚本**：e2e-errors fatal / stress-test 动态日期 / setup-zero-balance 合法 bcrypt / alipay TODO / run-template rateCheck 提前
- 本地 checks：tsc / vitest 165/165（+17）/ build 全过

## Framework 提案池（1 条未消化）
- Next.js App Router 私有目录约定（等 Path A 全部完成后批量同步）

## Framework 铁律（v0.7.3 已采纳）
1. Planner spec 涉及代码细节 Read 源码 + file:line 引用
1.1. acceptance 的"实现形式"与"语义意图"分离
2. Code Review 断言按线索，源码+生产数据双路核实
2.1. 协议返回形式断言标明协议层

## 生产状态
- HEAD `3646270`（BL-INFRA-RESILIENCE signoff 后）
- 9 批 Path A 代码待用户触发 deploy

## Path A 剩余路线
- P2：SEC-POLISH ← verifying / INFRA-ARCHIVE 1d / FE-DS-SHADCN 2d
- 延后候选：INFRA-GUARD-FOLLOWUP / BL-FE-QUALITY-FOLLOWUP
- 延后：PAY-DEFERRED 1-2d

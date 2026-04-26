---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-DEV-PORT-3199：`verifying`**（dev-chore 微批次：解决本机两项目 :3099 端口冲突）
- F-DP-01（generator）：✅ done @ commit 319ebbc — 82 文件 sed 替换；F-DP-02（codex）：待 Codex 走 codex-setup.sh + codex-wait.sh + curl :3199/login + 写 signoff
- Spec：`docs/specs/BL-DEV-PORT-3199-spec.md`
- Generator 验证：tsc 0 / vitest 414 PASS / build PASS / curl :3199 /login 200 + /v1/models 200
- 已知 untracked：`scripts/test/bl-fe-quality-round7-dynamic-evidence-2026-04-19.tsx`（BL-FE-QUALITY round7 漏推，不属本批次 scope）
- Codex 验收注意：本机走 http_proxy 时需 `curl --noproxy '*'` 绕过代理

## 上一批次（已 done）
- **BL-FE-QUALITY：done @ round6**（5/5 features，fix_rounds=4）
- Signoff：`docs/test-reports/BL-FE-QUALITY-signoff-2026-04-26-round6.md`
- 收尾：tsc / vitest 414 / PATCH 400 / Lighthouse A11y=100 / TC10-12 全 PASS
- proposed-learnings 待确认区已空（无新条目沉淀）

## 后续 backlog（按 order）
- BL-SEC-CRED-HARDEN (1) / BL-SEC-AUTH-SESSION (2) / BL-SEC-BILLING-AI (3) / BL-SEC-BILLING-CHECK-FOLLOWUP (3.5) / BL-SEC-INFRA-GUARD (4)
- BL-DATA-CONSISTENCY (7) / BL-INFRA-RESILIENCE (8) / BL-SEC-POLISH (9) / BL-INFRA-ARCHIVE (10)
- BL-FE-DS-SHADCN (98) / BL-SEC-PAY-DEFERRED (99) deferred

## 生产前置
- 无（纯本机 dev-chore）

---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-SEC-CRED-HARDEN：`verifying`**（3/4 完成，F-CH-04 待 Codex 验收）
- 混合批次：F-CH-01/02/03 为 generator（已完成），F-CH-04 为 codex

## 生产状态（2026-04-17 后）
- HEAD 即将推 BL-SEC-CRED-HARDEN 完成；生产部署版本 `59868a8`（RR2 fix round 2）
- zhipu glm-4.7-flash 通道四向状态机闭环
- 12 个公共营销模板上线
- 安全：CRIT-5/CRIT-6/L5 代码侧清零（生产 env 已注入，admin 密码由用户轮换）

## 下一批次候选（按优先级）
1. **BL-SEC-AUTH-SESSION**（1d，critical）— JWT HttpOnly + middleware 验签
2. **BL-SEC-BILLING-AI**（2d，critical）— AI 调用扣费原子性
3. **BL-SEC-INFRA-GUARD**（2d，critical）— admin 白名单 + 分布式锁 + shell + 依赖升级
4. **告警噪声**（0.5d）— long-term 限流 DISABLED↔DEGRADED 反复跳动（RR2 遗留）
5. BL-SEC-PAY-DEFERRED（延后到支付接入前）

## 已知 gap（非阻塞）
- 5 个图片模型 supportedSizes 规则不匹配
- `get-balance.ts(74)` tsc TS2353 batchId pre-existing
- `landing.html` 4 个 href="#" 占位
- CI 需在 GitHub Actions secrets 注入 ADMIN_TEST_PASSWORD/E2E_TEST_PASSWORD/ADMIN_SEED_PASSWORD

## Backlog（延后）
- BL-065 (被 BL-SEC-PAY-DEFERRED 取代) / BL-104 (Settings 项目切换)

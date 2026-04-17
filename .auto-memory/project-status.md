---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **ROUTING-RESILIENCE-V2：`done`**（fix_rounds=2，4/4 完成，Round 3 复验 PASS）
- 等待用户指定下一批次（候选见 backlog.json）

## 生产状态（2026-04-17 后）
- HEAD=`caf6d48`，本地最新；生产部署版本 `59868a8`（fix round 2）
- zhipu glm-4.7-flash 通道四向状态机闭环：ACTIVE↔DEGRADED↔DISABLED↔ACTIVE
- Redis cooldown 写入路径已验证
- 12 个公共营销模板上线（BL-128b 6 + BL-128c 3 + BL-128d 3）
- 安全：CRIT-6 生产 env hotfix 完成（IMAGE_PROXY_SECRET/AUTH_SECRET/NEXTAUTH_SECRET 注入）

## 下一批次候选（按优先级）
1. **BL-SEC-CRED-HARDEN**（0.5d，critical）— 硬编码密码 + image-proxy fallback 移除
2. **BL-SEC-AUTH-SESSION**（1d，critical）— JWT HttpOnly + middleware 验签
3. **BL-SEC-BILLING-AI**（2d，critical）— AI 调用扣费原子性
4. **BL-SEC-INFRA-GUARD**（2d，critical）— admin 白名单 + 分布式锁 + shell + 依赖升级
5. **告警噪声**（0.5d）— long-term 限流 DISABLED↔DEGRADED 反复跳动（RR2 遗留）
6. BL-SEC-PAY-DEFERRED（延后到支付接入前）

## 已知 gap（非阻塞）
- 5 个图片模型 supportedSizes 规则不匹配
- `get-balance.ts(74)` tsc TS2353 batchId pre-existing
- `landing.html` 4 个 href="#" 占位

## Backlog（延后）
- BL-065 (被 BL-SEC-PAY-DEFERRED 取代) / BL-104 (Settings 项目切换)

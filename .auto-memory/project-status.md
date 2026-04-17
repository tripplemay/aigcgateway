---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- ONBOARDING-ENHANCE：`building`（7 条功能，0/7，6 generator + 1 codex）
- 合并 WELCOME-BONUS + BL-128a + LANDING-LINKS-FIX
- F-OE-01: TransactionType 新增 BONUS
- F-OE-02: 注册赠送逻辑（SystemConfig WELCOME_BONUS_USD）
- F-OE-03: 管理端配置 + 前端 BONUS 标签
- F-OE-04: 模板分类扩展 seed migration（+ 4 营销分类）
- F-LL-01: landing.html 4 处 console 链接改 /login?redirect=<path>
- F-LL-02: login 页 redirect 支持 + 白名单（拒 open-redirect）+ 已登录自动跳
- F-OE-05: codex 全量验收（含 landing 部分）

## 生产状态
- 生产 /landing.html 404 已 hotfix（手动 cp public/* → standalone + pm2 restart），deploy.yml 已补 cp 防回归（commit d8d8190）
- TEMPLATE-LIBRARY-UPGRADE + TEMPLATE-TESTING 待部署

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配
- get-balance.ts(74) tsc TS2353 batchId pre-existing
- landing.html 4 个 href="#" 占位（关于/定价/服务条款/隐私政策）—— 后续批次做真页面

## Backlog（延后）
- BL-065(支付验签) / BL-104(Settings 项目切换) / BL-128b(6 个营销模板录入)

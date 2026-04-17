---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- ONBOARDING-ENHANCE：`verifying`（7 条，6/7 generator 已完成，F-OE-05 待 Reviewer）
- 合并 WELCOME-BONUS + BL-128a + LANDING-LINKS-FIX

## 本批次产物
- Migrations: `20260417_add_transaction_type_bonus`、`20260417_welcome_bonus_seed`、`20260417_template_categories_marketing`
- register 事务内注入 BONUS + defaultProject + notificationPreference 之后
- admin/operations 新增 WelcomeBonusCard（PUT /api/admin/config）
- balance 页 BONUS 绿色 chip + i18n 双语 + admin/users/[id] chip 同步
- src/lib/safe-redirect.ts + 9 条 vitest 单测（/ 开头、拒 //、javascript:、backslash、控制字符、>256）
- login 页 Suspense + useSearchParams + JWT exp 校验 hasLiveToken 自动跳 + authChecked 防闪烁
- landing.html 4 链接改 /login?redirect=<path>

## 生产状态
- 生产 /landing.html 404 已 hotfix（手动 cp + pm2 restart）+ deploy.yml 补 cp 防回归
- TEMPLATE-LIBRARY-UPGRADE + TEMPLATE-TESTING 待部署
- 本批次 3 个 migration 未部署（dev/prod 均需）

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配
- get-balance.ts(74) tsc TS2353 batchId pre-existing
- landing.html 4 个 href="#" 占位（关于/定价/服务条款/隐私政策）—— 后续批次做真页面

## Backlog（延后）
- BL-065(支付验签) / BL-104(Settings 项目切换) / BL-128b(6 个营销模板录入)

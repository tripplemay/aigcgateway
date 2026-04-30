# ONBOARDING-ENHANCE Signoff 2026-04-17

> 状态：**验收通过（L1 本地）**
> 触发：用户要求先完成本地验收，生产暂不执行新代码验证。

---

## 测试目标

验证 ONBOARDING-ENHANCE 批次交付项：
- WELCOME-BONUS 注册赠送与关闭行为
- BL-128a 模板分类扩展（10 分类 + 4 个营销分类）
- LANDING-LINKS-FIX（landing 私有链接重定向参数 + login redirect 安全）

---

## 测试环境

- 层级：L1 本地
- 地址：`http://localhost:3099`
- 启动：`scripts/test/codex-setup.sh` + `scripts/test/codex-wait.sh`
- 用例：`docs/test-cases/onboarding-enhance-verifying-cases-2026-04-17.md`
- 脚本：`scripts/test/_archive_2026Q1Q2/onboarding-enhance-verifying-e2e-2026-04-17.ts`
- 报告：`docs/test-reports/onboarding-enhance-verifying-local-e2e-2026-04-17.json`

---

## 执行结果

- 总计：10 PASS / 0 FAIL
- 关键通过项：
  - 注册赠送：当 `WELCOME_BONUS_USD=1.00` 时，新用户余额与 BONUS 交易均正确。
  - 关闭赠送：将 `WELCOME_BONUS_USD=0` 后，新用户无 BONUS 交易且余额不增长。
  - 模板分类：`TEMPLATE_CATEGORIES` 共 10 分类，新增 4 个营销分类及 icon 映射正确。
  - landing：私有入口链接为 `/login?redirect=<path>`（URL 编码形式），锚点导航保持正常。
  - login redirect：`sanitizeRedirect` 白名单逻辑存在，恶意 redirect 单测通过（9/9）。
  - balance：`BONUS` 类型映射为绿色 `StatusChip` 并有 i18n 文案。

---

## 结论

ONBOARDING-ENHANCE 本地验收通过，批次可签收。


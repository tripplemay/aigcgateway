# ONBOARDING-ENHANCE 本地验收用例（L1）

- 批次：`ONBOARDING-ENHANCE`
- 阶段：`verifying`
- 环境：`http://localhost:3099`
- 脚本：`scripts/test/_archive_2026Q1Q2/onboarding-enhance-verifying-e2e-2026-04-17.ts`

## 覆盖点

1. 注册赠送：新用户注册后余额=配置值，且存在 `BONUS` 交易。
2. 关闭赠送：管理端将 `WELCOME_BONUS_USD` 设为 `0` 后新用户不再赠送。
3. 模板分类：`TEMPLATE_CATEGORIES` 含原 6 + 新增 4 分类。
4. 模板页分类标记：`/templates` 页面源码包含新增 4 分类 id。
5. landing 链接：私有入口链接改为 `/login?redirect=<path>`。
6. landing 锚点：同页锚点未移除。
7. login redirect：`sanitizeRedirect` + `router.push/replace` 逻辑存在。
8. register 保持：`register` 页未引入 redirect 逻辑。
9. 恶意 redirect：`safe-redirect` 单测通过。
10. balance 展示：`BONUS` 类型为绿色 `StatusChip`。

## 说明

- 本轮按用户指令仅做本地验收，不执行生产链路验证。
- 客户端“已登录直跳”在 L1 采用源码行为标记 + redirect util 单测联合验证。

# M1b Alias Automation + Admin UI Verifying E2E (2026-04-10)

## Scope
- Batch: `M1b-alias-automation-admin-ui`
- Feature: `F-M1b-06` (`executor: codex`)
- Env: L1 local (`http://localhost:3099`)

## Acceptance Mapping
1. Sync 后触发 LLM 分类与 brand 推断，生成别名并挂载模型。
2. Admin 别名管理页存在并可作为主入口。
3. 白名单页/能力页删除，侧边栏入口同步移除。
4. DS token 一致，零硬编码颜色（对 M1b 改动页审计）。
5. i18n 无残留（对 M1b 改动页审计）。
6. 设计稿关键区块一致性（`design-draft/admin-model-aliases/code.html` 对照）。

## Execution Method
- Script: `scripts/test/m1b-alias-admin-verifying-e2e-2026-04-10.ts`
- Command:

```bash
npx tsx scripts/test/m1b-alias-admin-verifying-e2e-2026-04-10.ts
```

## Notes
- 脚本使用本地 mock DeepSeek 服务（`/models` + `/chat/completions`）实现可重复 L1 验证。
- 只修改测试产物，不修改产品实现代码。

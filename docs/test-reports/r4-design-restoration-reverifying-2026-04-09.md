# R4 Design Restoration Reverifying Report (2026-04-09)

## 测试目标

- 执行 `F-R4-08`（executor: codex）修复后复验。
- 复核 7 个目标页面在 L1 环境的可访问性、结构还原、DS token 与 i18n。

## 测试环境

- L1 Local：`http://localhost:3099`
- 启动：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- 执行脚本：
  - `BASE_URL=http://localhost:3099`
  - `OUTPUT_FILE=docs/test-reports/r4-design-restoration-reverifying-e2e-2026-04-09.json`
  - `npx tsx scripts/test/r4-design-restoration-verifying-e2e-2026-04-09.ts`

## 结果概览

- 结论：**FAIL（回退 fixing）**
- 自动化步骤：5
- 通过：4
- 失败：1
- 证据：`docs/test-reports/r4-design-restoration-reverifying-e2e-2026-04-09.json`

## 通过项

1. AC1 smoke endpoint 通过：`/api/v1/models` 返回 200。
2. AC1 目标页面全部可加载。
3. AC2 结构还原 spot check 全通过。
4. AC4 i18n 审计通过：`hardcoded=none`。

## 失败项

1. AC3 DS token / 颜色规范未通过
   - 审计结果：`legacy=0, hardcodedColor=8`
   - 触发位置（8 处，均为登录/注册页 Google 图标硬编码 fill）
     - [page.tsx](/Users/yixingzhou/project/aigcgateway/src/app/(auth)/login/page.tsx:248)
     - [page.tsx](/Users/yixingzhou/project/aigcgateway/src/app/(auth)/login/page.tsx:252)
     - [page.tsx](/Users/yixingzhou/project/aigcgateway/src/app/(auth)/login/page.tsx:256)
     - [page.tsx](/Users/yixingzhou/project/aigcgateway/src/app/(auth)/login/page.tsx:260)
     - [page.tsx](/Users/yixingzhou/project/aigcgateway/src/app/(auth)/register/page.tsx:259)
     - [page.tsx](/Users/yixingzhou/project/aigcgateway/src/app/(auth)/register/page.tsx:263)
     - [page.tsx](/Users/yixingzhou/project/aigcgateway/src/app/(auth)/register/page.tsx:267)
     - [page.tsx](/Users/yixingzhou/project/aigcgateway/src/app/(auth)/register/page.tsx:271)

## 状态机回写

- `progress.json.status`：`reverifying` → `fixing`
- 回退 `pending`：
  - `F-R4-07`（Register 左侧终端与 Login 统一，关联登录/注册页）
  - `F-R4-08`（R4 全量验收）
- `docs.signoff` 维持 `null`（未达到全 PASS）

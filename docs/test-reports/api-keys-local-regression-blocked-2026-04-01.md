# API Keys 本地回归阻塞报告

## Summary

- Scope:
  - 在本地测试环境 `http://localhost:3099` 回归验证上一轮 API Keys 报告中的 3 个遗留问题
  - 仅验证：
    - 搜索无结果后清空是否恢复
    - `edit` 按钮是否仍为 disabled 占位
    - 列表是否仍存在误导性复制按钮
- Documents:
  - `docs/test-reports/api-keys-frontend-retest-report-2026-04-01-round2.md`
  - `docs/test-reports/api-keys-production-manual-test-report-2026-04-01.md`
  - `docs/api-keys-frontend-spec.md`
- Environment:
  - 本地 Codex 测试环境
  - 站点：`http://localhost:3099`
  - 启动方式：按最新 `AGENTS.md`，在持久 PTY 会话中前台执行 `bash scripts/test/codex-setup.sh`
  - 管理员账号：`admin@aigc-gateway.local / admin123`
  - 测试项目：`Codex API Keys Local Regression`
- Result totals:
  - PASS: 0
  - FAIL: 0
  - BLOCKED: 3

## 覆盖摘要

- 已完成：
  - 本地测试环境启动验证
  - 管理员登录接口验证
  - 项目与 API Key 测试数据准备
  - `/keys` 页面 HTML 返回验证
  - 浏览器资源加载与控制台错误检查
- 未完成：
  - 3 个 UI 回归点的实际交互验证
  - 原因：页面静态资源加载失败，无法进入真实可操作 UI

## Test Cases

- TC-RG-001 `edit` 按钮占位状态回归 - BLOCKED
  - Preconditions:
    - 本地项目与 key 数据已创建
    - 浏览器打开 `/keys`
  - Expected Result:
    - ACTIVE 行 `edit` 为 disabled，占位文案保持 `Coming soon`
  - Result: BLOCKED
  - Observed Behavior:
    - 页面停留在 `Loading...`
    - 无法渲染列表行，无法验证按钮状态

- TC-RG-002 列表误导性复制按钮回归 - BLOCKED
  - Preconditions:
    - 本地项目与 key 数据已创建
  - Expected Result:
    - ACTIVE 行不出现误导性的复制按钮
  - Result: BLOCKED
  - Observed Behavior:
    - 页面未进入可操作列表态

- TC-RG-003 搜索清空恢复回归 - BLOCKED
  - Preconditions:
    - 本地 `/keys` 页面可正常渲染列表
  - Expected Result:
    - 搜索 `NoSuchKey` 后清空输入框，应恢复默认列表
  - Result: BLOCKED
  - Observed Behavior:
    - 页面仅显示 `Loading...`
    - 无法执行搜索输入与结果观察

## Defects

- [High] 本地 `/keys` 页面静态资源加载失败，导致页面无法完成 hydration
  - Impact:
    - API Keys 页面在本地测试环境无法进入真实 UI
    - 本轮 3 个回归点全部被环境阻塞
  - Reproduction:
    1. 按最新 `AGENTS.md` 启动本地测试环境
    2. 登录管理员账号
    3. 浏览器访问 `http://localhost:3099/keys`
  - Actual:
    - 页面只显示 `Loading...`
    - 浏览器网络面板中 `_next/static/*` 资源全部 `404`
    - 控制台连续报 `Failed to load resource: the server responded with a status of 404`
  - Expected:
    - `_next/static/*` 资源正常返回
    - 页面完成 hydration 并进入 API Keys 列表
  - Evidence:
    - `GET http://localhost:3099/keys` -> `200`
    - `GET http://localhost:3099/_next/static/chunks/app/(console)/keys/page-7a45897fd635d209.js` -> `404`
    - 截图：`docs/test-reports/api-keys-local-regression-blocked-2026-04-01-loading.png`

## Open Questions

- 当前 `exec node .next/standalone/server.js` 启动方式已能让 API 服务监听 `3099` 并返回 `/v1/models`，但浏览器侧静态资源仍全部 `404`。
- 需要开发侧确认：
  - 是否缺少 `.next/static` 到 standalone 运行目录的拷贝/挂载
  - 或当前 standalone 启动路径与静态资源服务路径不一致

## 证据文件

- 报告：
  - `docs/test-reports/api-keys-local-regression-blocked-2026-04-01.md`
- 截图：
  - `docs/test-reports/api-keys-local-regression-blocked-2026-04-01-loading.png`

# frontend-audit 验收报告（verifying）

- 测试目标：执行 `frontend-audit` 批次（F-FA-01 ~ F-FA-05）
- 测试环境：本地 `http://localhost:3099`（`--noproxy '*'`）
- 执行方式：代码静态审查 + Playwright 截图走查 + 鉴权/错误探针

## 测试范围与已执行项

1. **20 页响应式走查（已执行）**
   - 覆盖路由：`/dashboard` 到 `/admin/templates` 共 20 页
   - 视口：`1366x768`、`1024x768`、`390x844`
   - 产物目录：`docs/test-reports/frontend-audit-screens/`
   - 执行结果：三组视口页面均可渲染截图（desktop 额外多 1 张 dev 403 场景截图）

2. **403 场景注入（已执行）**
   - Developer token 调用 `/api/admin/users` 返回 `403`：`{"code":"forbidden"}`
   - Developer 访问 `/admin/users` 时 HAR 记录显示被前端路由切换到 dashboard RSC 请求
   - 证据：`docs/test-reports/frontend-audit-screens/admin-users-dev.har`

3. **断网场景注入（已执行，链路级）**
   - 通过 Playwright `--proxy-server=http://127.0.0.1:9` 触发 `ERR_PROXY_CONNECTION_FAILED`
   - 结论：浏览器在文档加载前失败，无法进入应用层 error boundary 验证

4. **500 场景注入（部分）**
   - 已覆盖 404/405 错误响应探针（多个 API）
   - 当前未拿到可稳定触发前端业务页 API `500` 的注入点（不修改产品实现前提下）

## 失败项（按严重度）

1. **高｜权限边界可被前端本地 token payload 伪造影响**
   - 文件：`src/app/(console)/layout.tsx:31`
   - 问题：前端直接 `atob` 解析 token 并信任 `payload.role` 控制 admin 前端可见性。
   - 影响：可伪造本地 payload 进入 admin 前端路径（虽然后端 API 仍会 403，但页面边界判断不严谨）。

2. **高｜未登录访问控制台路由未在服务端硬拦截**
   - 现象：`/dashboard` 可返回 200（客户端再处理跳转），不是服务端直接 302/401。
   - 影响：边界依赖客户端执行，禁 JS/异常时行为不稳。

3. **中｜死链与无动作交互**
   - 文件：`src/app/(console)/keys/page.tsx:477`、`src/app/(console)/keys/page.tsx:480`、`src/app/(console)/keys/page.tsx:483`
   - 文件：`src/components/sidebar.tsx:84`
   - 问题：3 处 `href="#"`；New Project CTA 无 `onClick/href`。

4. **中｜i18n 硬编码残留**
   - 文件：`src/app/(console)/models/page.tsx:293`（`No models found`）
   - 文件：`src/app/(console)/balance/page.tsx:279`（`No transactions`）
   - 问题：中英文词典 key 已同步，但页面仍有硬编码英文。

5. **中｜Hook 依赖风险（lint 已报警）**
   - 文件：`src/app/(console)/admin/logs/page.tsx:49`
   - 文件：`src/app/(console)/admin/users/[id]/page.tsx:30`
   - 文件：`src/app/(console)/balance/page.tsx:71`
   - 文件：`src/app/(console)/keys/page.tsx:74`
   - 问题：`useEffect` 缺失 `load` 依赖，存在陈旧闭包风险。

## 通过项

- `en.json` / `zh-CN.json` key 完整同步（593/593，互无缺失）。
- 20 页在 3 个视口均成功产出截图，未出现整页渲染失败。

## 风险与未完成

- “应用层 500 注入后 error boundary 文案与交互”仍缺少稳定复现实验（当前只完成链路级断网注入）。
- 设计稿 1:1 逐页视觉差异结论仍需人工逐图比对（本轮已补齐截图证据）。

## 最终结论

- 本轮 `frontend-audit` 仍不通过，建议维持 `fixing`。
- 优先修复顺序：权限边界 → 死链/无动作交互 → i18n 硬编码 → Hook 依赖。 

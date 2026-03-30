# AIGC Gateway — Known Issues

## P1 已知问题清单

### [UI] 空状态缺少操作按钮

**状态：** 待修复
**发现时间：** 2026-03-30
**严重程度：** Medium
**影响范围：** 开发者控制台 — Dashboard 及其他空状态页面

**现象：** Dashboard 在无项目时显示"No project yet / Create your first project to get started"，但缺少"Create Project"操作按钮。

**依据：** 交互规格文档 §1.2 通用交互规范明确要求：
> 空状态：居中图标 + 文案 + **操作按钮**（如"创建第一个项目"）

**当前行为：** 只有文案，无按钮，无图标。

**修复方案：** 添加"Create Project"按钮（调用 POST /api/projects 或打开创建对话框），同时补充居中图标。所有空状态页面统一适用。

---

### [UI] 无项目时 Logs / Usage / Balance / Keys 页面空白

**状态：** 待修复
**发现时间：** 2026-03-30
**严重程度：** Medium
**影响范围：** 开发者控制台

**现象：**
新注册用户登录后，访问 Logs、Usage、Balance、Keys 页面看到完全空白，无任何提示或引导。

**根因：**
四个页面在 `useProject()` 返回 `current = null`（用户无项目）时直接 `return null`，没有处理空状态。

| 文件 | 问题行 |
|------|--------|
| `src/app/(console)/logs/page.tsx` | `if (!current) return null;` |
| `src/app/(console)/usage/page.tsx` | `if (!current) return null;` |
| `src/app/(console)/balance/page.tsx` | `if (!current \|\| !info) return null;` |
| `src/app/(console)/keys/page.tsx` | `if (!current) return null;` |

**对比：** Dashboard 页面已正确处理，显示"No project yet. Create your first project to get started."

**修复方案：**
参照 Dashboard 的模式，为四个页面添加 loading 状态和无项目提示，引导用户创建项目。

---

### [P1 简化] 邮箱验证流程未实现

**状态：** P2 计划
**严重程度：** Low（P1 阶段）

**现象：** 注册后无需验证邮箱即可直接登录。

**原因：** P1 无 SMTP 邮件服务，`emailVerified` 字段已预留但登录不检查。代码中有明确 TODO 注释。

**影响：** 不影响功能使用，但不符合文档中"注册→验证→登录"的完整旅程描述。

---

### [P1 简化] 支付回调未实现真实验签

**状态：** P2 计划
**严重程度：** High（生产环境部署前必须修复）

**现象：** 支付宝和微信回调未做签名验证，伪造回调可以入账。

**原因：** P1 无真实支付渠道凭证（`ALIPAY_PUBLIC_KEY`、`WECHAT_API_KEY_V3`），代码中有 TODO 注释。幂等处理已实现。

**影响：** 开发/测试环境无影响，**生产部署前必须实现验签**。

---

### [环境] 7 家服务商全量验证依赖真实 API Key

**状态：** 配置问题
**严重程度：** High（验收阻塞）

**现象：** `verify-providers.ts` 只能验证已配置真实 Key 的服务商通道。当前 placeholder key 的通道会被健康检查自动降级。

**当前已配置的服务商：**

| 服务商 | Key 状态 |
|--------|---------|
| DeepSeek | 真实 Key ✅ |
| OpenRouter | 真实 Key ✅ |
| 智谱 AI | 真实 Key ✅ |
| OpenAI | PLACEHOLDER ❌ |
| Anthropic | PLACEHOLDER ❌ |
| 火山引擎 | PLACEHOLDER ❌ |
| 硅基流动 | PLACEHOLDER ❌ |

**解决：** 配置各服务商真实 API Key 后，通道会在下一轮健康检查中自动恢复 ACTIVE。

---

### [环境] dev server 与 npm run build 的 .next 缓存冲突

**状态：** 已知限制
**严重程度：** Low

**现象：** 执行 `npm run build` 后再启动 `npx next dev`，或反过来，可能出现 `Cannot find module './xxxx.js'` 错误。

**原因：** dev 和 production 模式共用 `.next` 目录，编译产物格式不同。

**解决：** 切换模式前执行 `rm -rf .next`。

---

### [环境] curl 请求本地实例需要绕过 HTTP proxy

**状态：** 已知限制
**严重程度：** Low

**现象：** 如果系统配置了 `http_proxy`，curl 请求 `localhost` 会走代理导致 502。

**解决：** 使用 `no_proxy=localhost,127.0.0.1` 前缀，或在 `.bashrc` 中永久设置。

---

### [SDK] 未发布到 npm registry

**状态：** 待执行
**严重程度：** Medium

**现象：** `npm install aigc-gateway-sdk` 返回 404。

**原因：** `npm publish` 是运维操作，需要 npm 账号和包名注册。SDK 构建产物（CJS + ESM + .d.ts）已验证可用。

**解决：** 注册 npm 账号后执行 `cd sdk && npm publish`。

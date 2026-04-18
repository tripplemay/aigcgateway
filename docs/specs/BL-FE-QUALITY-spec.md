# BL-FE-QUALITY Spec

**批次：** BL-FE-QUALITY（合并批次，P1-quality 第 1 批）
**负责人：** Planner = Kimi / Generator = 默认映射 / Evaluator = Reviewer
**创建：** 2026-04-18
**工时：** 3.5 day
**源：** 合并原 BL-FE-UX-QUALITY（HIGH-33/34/35 + M1-M3）+ BL-FE-A11Y-I18N-DS（HIGH-37/38/40/41 + DS-1 Critical 3）

## 背景

3 组前端质量向改动合并批次，同 Generator 上下文复用，减少 2 次 plan/verify/deploy。

spec 按三组分节（UX / A11y-i18n / DS-Critical），Evaluator 可独立验证子任务。

### 组 A — UX 交互

**HIGH-33：9 处 `window.location.reload()` 破坏 SPA 状态**（`[已核实]`）

```
src/app/(console)/balance/page.tsx:129
src/app/(console)/usage/page.tsx:111
src/app/(console)/dashboard/page.tsx:125
src/app/(console)/logs/[traceId]/page.tsx:78
src/app/(console)/logs/page.tsx:104
src/app/(console)/actions/page.tsx:81
src/app/(console)/templates/page.tsx:115
src/app/(console)/keys/[keyId]/page.tsx:119
src/app/(console)/keys/page.tsx:106
```

全部同一模式：`<EmptyState onCreated={() => window.location.reload()} />`

**HIGH-34：settings 双事件**（`[已核实 settings/page.tsx:197]`）

`btn.addEventListener("click", handler)` 同时元素还有 React `onClick`，点击触发两次。

**HIGH-35：keys 复制按钮复制脱敏 key**（`[待 Generator 核实 keys/page.tsx:173]`）

**MEDIUM-1：notification-center 30s 轮询无可见性门控**（`[待核实]`）

**MEDIUM-2：admin/usage+models+operations 并发 useAsyncData 无 batch**（`[待核实]`）

### 组 A (续) — template-testing polish

**daily M1：admin templates PATCH 缺 try/catch → 500**（`[待核实 src/app/api/admin/templates/[templateId]/route.ts:52-54]`）

**daily M2：test-runner Decimal 精度丢失**（`[待核实 src/lib/template/test-runner.ts:200-207]`）

**daily M3：waitForCallLog 串行轮询 3s×N**（`[待核实 src/lib/template/test-runner.ts:247-262]`）

### 组 B — A11y + i18n

**HIGH-38：数十个图标按钮无 aria-label**（`[批量审查]`）

**HIGH-40：error.tsx 硬编码英文**（`[待核实 src/app/(console)/error.tsx]`）

**HIGH-41：admin/models "Free" / "Degraded" 硬编码**（`[已核实 admin/models/page.tsx:65/70/282]`）

**HIGH-37：notification-center timeAgo 英文 + 汇率 7.3**（`[已核实 components/notification-center.tsx:40 timeAgo 函数 + :53 NOTIF_CNY_RATE=7.3]`）

### 组 C — DS Critical 3 文件

**DS-1 token 违规 590+（3 个 Critical 文件）**（`[待核实]`）

| 文件 | 违规数 |
|---|---|
| `src/app/(console)/admin/operations/page.tsx` | 33 |
| `src/app/(console)/dashboard/page.tsx` | 24 |
| `src/app/(console)/admin/logs/page.tsx` | 24 |

硬编码 hex/rgb / 非 ds Tailwind 色类 → ds-* token。

其余 28 个 High 级 DS-1 文件留给 BL-FE-DS-SHADCN 批次。

## 目标

1. **UX**：SPA 状态保持、无重复事件、复制真 key 或明确提示、轮询对用户不可见时暂停、admin 页请求批合并
2. **template-testing**：API 返 400 代替 500、Decimal 精度保真、异步等待优化
3. **A11y+i18n**：aria-label 全覆盖、无英文硬编码、汇率本地化
4. **DS**：3 个 Critical 文件 token 合规（0 硬编码 hex/rgb + 0 非 ds 色类）

## 改动范围

### F-FQ-01：UX 交互改造（9 reload + 双事件 + 复制 + 轮询 + batched fetch）

**文件：** 9 个 console 页面 + settings + keys + notification-center + admin/usage + admin/models + admin/operations

**改动：**

1. **9 处 `window.location.reload()` → `router.refresh()`**（Next.js App Router 标准）

   ```tsx
   // 替换模式（9 处相同）
   <EmptyState onCreated={() => {
     router.refresh();
     // 或 local mutate useAsyncData 的 data
   }} />
   ```

2. **settings 双事件修**：删除 `settings/page.tsx:197` 的 `btn.addEventListener("click", handler)`，保留 React `onClick`

3. **keys 复制按钮**：确认实际复制内容。若为脱敏 key，改复制真 key（创建瞬间可访问）；若真 key 不可访问，改复制按钮文案为"（创建时可复制）"并禁用

4. **notification-center visibilitychange 门控**：
   ```tsx
   useEffect(() => {
     const tick = () => void fetchNotifications();
     let timer = setInterval(tick, 30_000);
     const handleVis = () => {
       if (document.hidden) clearInterval(timer);
       else { tick(); timer = setInterval(tick, 30_000); }
     };
     document.addEventListener("visibilitychange", handleVis);
     return () => { clearInterval(timer); document.removeEventListener("visibilitychange", handleVis); };
   }, []);
   ```

5. **admin 页 batched fetch**：
   - `admin/usage/page.tsx`: 3 个 useAsyncData → 单个 `Promise.all([fetchProvider, fetchModel, fetchTotal])`
   - `admin/models/page.tsx`: 2 个 → 1 个合并
   - `admin/operations/page.tsx`: 多个 + 2 个 setInterval 评估合并可行性

### F-FQ-02：template-testing polish

**文件：** `src/app/api/admin/templates/[templateId]/route.ts` + `src/lib/template/test-runner.ts`

**改动：**

1. **admin templates PATCH 加 try/catch**：
   ```ts
   const body = await request.json().catch(() => null);
   if (!body || typeof body !== "object") {
     return errorResponse(400, "invalid_parameter", "Invalid JSON body");
   }
   ```

2. **test-runner Decimal 精度**：`totalCostUsd += Number(callLog.sellPrice)` → `totalCostUsd = new Prisma.Decimal(totalCostUsd).plus(callLog.sellPrice)`；结束 `.toFixed(8)`

3. **waitForCallLog 优化**：改为 `runActionNonStream` 返回时事务内直接附带 callLog；或至少把 CALL_LOG_POLL_MAX_ATTEMPTS 从 30 降到 10（timeout 1s 而非 3s），失败时明确 warn 而非静默返回 null

### F-FQ-03：A11y + i18n

**文件：** 新建 `src/lib/a11y.ts` + 修改 `src/app/(console)/error.tsx` + `admin/models/page.tsx` + `notification-center.tsx`

**改动：**

1. **aria-label 批量补**：
   - 建 `src/lib/a11y.ts` helper 或在 `components/ui/icon-button.tsx` 强制 `aria-label` prop
   - grep 所有 `<button>` 含图标无文字的实例，批量补 `aria-label={t("...")}`
   - 重点：top-app-bar / notification-center / admin 页面 / form actions

2. **error.tsx i18n**：
   ```tsx
   "use client";
   import { useTranslations } from "next-intl";
   export default function Error({ error, reset }) {
     const t = useTranslations("error");
     return (/* 用 t("title") / t("retry") 等 */);
   }
   ```
   messages/zh-CN.json + en.json 新增 `error.*` 条目

3. **admin/models Free/Degraded**：
   - 行 65/70 `"Free"` → `t("models.priceFree")`
   - 行 282 `"Degraded"` → `t("models.statusDegraded")`
   - i18n 文件新增条目

4. **notification-center timeAgo + 汇率**：
   - `timeAgo()` 函数改用 `dayjs relativeTime` 或 next-intl 的 `formatRelativeTime`
   - `NOTIF_CNY_RATE = 7.3` 硬编码改为从 API 或 SystemConfig 读取（或至少改为 env + fallback 常量）

### F-FQ-04：DS Critical 3 文件 token 改造

**文件：**
- `src/app/(console)/admin/operations/page.tsx`（33 处违规）
- `src/app/(console)/dashboard/page.tsx`（24 处）
- `src/app/(console)/admin/logs/page.tsx`（24 处）

**改动规则：**

- 硬编码 hex/rgb（例：`#3b82f6` / `rgba(255,0,0,0.5)`）→ `ds-*` token
- 非 ds Tailwind 色类（例：`bg-indigo-700` / `text-slate-500`）→ ds 色阶对应类（`bg-ds-primary` / `text-ds-muted`）
- 任意值 px 尺寸（`h-[300px]`）保留（性能路径），仅清色值类

**验证：** 每个文件改完 `grep -cE '#[0-9a-fA-F]{6}|text-(slate|indigo|rose|emerald|violet|amber)-' <file>` 应为 0。

### F-FQ-05：全量验收（Codex）

**UX 验证（5 项）：**
1. 9 个页面 EmptyState onCreated 回调 SPA 状态保持（不闪屏不重置滚动 / 其他 state）
2. settings 按钮点击只触发一次 handler
3. keys 复制按钮复制真 key 或按钮提示明确
4. NotificationCenter tab 切换到其他标签 30s+ 后回来，Network 面板无持续轮询请求
5. admin/usage 页面打开时 Network 只有一次聚合请求或 Promise.all 并发

**template-testing polish（3 项）：**
6. POST `admin/templates/:id` 带非法 JSON body → 400 而非 500
7. test-runner totalCostUsd 累加 10 步 callLog 后与 Prisma 直查 sum(sellPrice) 差距 < 1e-12
8. waitForCallLog timeout 从 3s×N 降到 1s×N（或事务内合并直出）

**A11y + i18n（4 项）：**
9. Lighthouse A11y ≥ 98（当前 94-95）
10. error.tsx 中文界面显示中文文案
11. admin/models 切 zh-CN 后 Free/Degraded 显示中文
12. notification-center 切换 zh-CN 后 timeAgo 显示"5 分钟前"式中文相对时间

**DS Critical 3 文件（3 项）：**
13. admin/operations / dashboard / admin/logs 各文件 `grep` 硬编码 hex/rgb = 0
14. 各文件 `grep` 非 ds Tailwind 色类 = 0
15. 视觉回归：Chrome DevTools 打开三个页面观感与改造前无肉眼可见差异

**构建 + 回归（3 项）：**
16. `npm run build` 通过
17. `npx tsc --noEmit` 通过
18. `npx vitest run` 全过

19. 生成 signoff 报告。

## 非目标

- 不做 A11y 28 个 High 文件（留给后续小批次或日常清理）
- 不做 DS shadcn 采用率提升（BL-FE-DS-SHADCN 批次）
- 不做 UX 大改版（保持现有信息架构）
- 不做 i18n 全量文本扫描（只修 Code Review 明确的 3 处）
- 不做 API 层重构（仅 admin templates 一个 try/catch 补）

## Risks

| 风险 | 缓解 |
|---|---|
| `router.refresh()` 语义与 reload 不完全等价（服务端组件刷新） | 9 处均在 client EmptyState 回调后，刷新目标是父组件数据；App Router 的 refresh 正好适配 |
| aria-label 批量改可能覆盖现有自定义 | 只补未有 aria-label 的按钮，已有保持 |
| DS token 改造视觉微差 | 改造前后截图对比，Evaluator item 15 兜底 |
| 改 3 个大文件风险 | 分段 commit（每文件一 commit），便于定位回滚 |
| NOTIF_CNY_RATE 改读 API 若失败回退 | 保留常量作 fallback，warn 日志 |

## 部署

- 纯前端改动 + 少量 backend（admin templates PATCH try/catch）
- 部署：git pull + npm ci + npm run build + pm2 restart
- 回滚：revert commit

## 验收标准

- [ ] F-FQ-05 的 18 项全 PASS
- [ ] DS 三个文件色值违规 = 0
- [ ] Lighthouse A11y ≥ 98
- [ ] build + tsc + vitest 全过
- [ ] signoff 报告归档

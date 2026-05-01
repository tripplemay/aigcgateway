# BL-ADMIN-ALIAS-UX-PHASE1 Spec

**批次：** BL-ADMIN-ALIAS-UX-PHASE1（admin/model-aliases 页面 UX 大修一期）
**负责人：** Planner / Generator = 默认映射 / Evaluator = Reviewer
**创建：** 2026-05-01
**工时：** 1.5-2 day
**优先级：** medium-high（生产 admin 日常痛点）
**前置：** 无（独立前端 + 单接口分页改造）
**关联：**
- 用户报告：reorderChannels 视觉错位（已现地核验，详见本 spec D1）
- 用户报告：每次写操作整页 `load()` 闪烁（详见本 spec D2）
- 候选 4：用户提的"分页加载"（详见本 spec D3）

## 背景

`admin/model-aliases` 页面是 admin 配置 alias / channel 的主战场。当前 (`src/app/(console)/admin/model-aliases/page.tsx`) 三类痛点：

### 痛点 1：拖拽 channel 顺序后视觉"跳回"（撒谎）

`reorderChannels` (page.tsx:323) PATCH 4-10 个 channel 的 `priority` 后调 `load()` 重拉数据。但 `linkedModels.flatMap(lm => lm.channels)` 是按 **每个 model 内 priority asc + linkedModel 顺序拼接**，跨 model 拖拽的 channel 视觉上仍卡在原 model 的位置。生产现地核验：deepseek-r1 alias 第 3、4 位的 priority 实际是 4、3（撒谎），路由层 `routeByAlias` 跨 model 全局 priority sort 已经按拖动结果生效，但 admin 看不到。

### 痛点 2：每次写操作整页刷新，状态/滚动/展开全丢

8 个 handler（toggleEnabled / saveChanges / deleteAlias / createAlias / linkModel / unlinkModel / reorderChannels / createAliasForModel）写完都调 `load()` → `useAsyncData.refetch` → 整 alias 列表重新 fetch + setData → 全 React 树 re-render。后果：用户展开的 alias 详情折叠、滚动位置丢失、loading 闪屏、连续操作时延感叠加。

### 痛点 3：alias 数量增长后页面卡顿

当前一次性加载所有 aliases（生产已 30+ alias，每 alias 含 N 个 linkedModel × M 个 channel × 1 healthCheck），单次 `apiFetch` 响应已达 ~400KB，client-side 过滤/排序在 useMemo 内做。无分页 → 数据量增长后网络与渲染都会成为瓶颈。

## 目标

1. **修 reorderChannels 视觉撒谎**：UI 展示顺序 = 路由层顺序 = 全局 priority asc。
2. **6 类写操作全部走 optimistic update**：reorder / toggle enabled / save edits / link / unlink / delete。结果即时呈现，失败 rollback + toast。展开 / 滚动 / 编辑态全部保留。
3. **服务端分页 + 服务端过滤**：API 支持 `?page&pageSize&search&brand&modality&enabled&sortKey`，UI 复用 `<Pagination>` 组件，pageSize 默认 20。
4. **更新 Stitch 设计稿** 与代码一致（含分页控件位置）。
5. **单测覆盖关键 race / rollback 路径**。

## 非目标

- 不动 `createAlias` / `createAliasForModel` 的整页刷新行为（创建场景下用户期望"看到服务端权威数据回填"，optimistic 收益小成本高，留 phase 2）。
- 不重构 page.tsx 的整体 React 树（保留现有 expanded / editState / addModel 等局部 state 模型，只在 handler 层改 mutation 范式）。
- 不引入 SWR / TanStack Query（一处扩展 `useAsyncData` 暴露 `mutate` 即可，避免依赖大跃进）。
- 不动 `routeByAlias` 路由层逻辑（已经按全局 priority 排序，行为正确）。
- 不动 `/api/admin/channels/:id` PATCH 契约（reorder 仍走 N 次并发 PATCH，spec 范围内不优化为批量 endpoint）。
- 不重构 `_cache.ts` 的 30s TTL（admin/channels 缓存与本批 UX 无直接关系）。

## 关键设计决策

### D1：UI 展平后**追加** sort by priority

```diff
  channels={alias.linkedModels.flatMap((lm) =>
    lm.channels.map((ch): ChannelRowData => ({ ... })),
- )}
+ ).sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))}
```

仅前端展示层改动。`linkedModels` 数组结构保留（`channelModelMap` 仍用于 unlink 时找 modelId）。

**为什么不在 API 端做：** API 返回 shape 改造影响其他消费方（虽然目前只有这一处），保持 API 契约稳定。

### D2：optimistic update 的统一范式（**必须**遵循，避免每个 handler 各写各的）

#### D2.1：扩展 `useAsyncData` 暴露 `mutate`

```ts
// src/hooks/use-async-data.ts 增加：
interface UseAsyncDataResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  mutate: (updater?: T | ((prev: T | null) => T | null)) => void;  // ← new
}
```

`mutate(value)` 直接 setData(value)；`mutate(fn)` 走 functional updater；`mutate()` 不传等价 refetch。SWR 风格，向后兼容（其他 8 处用 useAsyncData 的页面忽略 mutate 即可）。

#### D2.2：handler 改造模板

```ts
const toggleEnabled = async (id: string, enabled: boolean) => {
  // 1) 保存 prev snapshot 用于 rollback
  const prev = apiData;
  // 2) optimistic patch（functional updater 保证 race-safe）
  mutate((current) =>
    current ? {
      ...current,
      data: current.data.map((a) => (a.id === id ? { ...a, enabled } : a)),
    } : current,
  );
  // 3) 后台 API 调用，失败 rollback
  try {
    await apiFetch(`/api/admin/model-aliases/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    });
    // 成功不再 load() — 本地 patch 已经是真值
  } catch (err) {
    mutate(prev);  // rollback
    toast.error((err as Error).message);
  }
};
```

#### D2.3：race protection（连续点击同一 alias）

每个写操作在 enter 时记录本次目标值；catch rollback 时**对比**当前 state 是否已被后续操作改写：

```ts
catch (err) {
  mutate((current) => {
    if (!current) return current;
    // 仅当对应字段仍为本次的目标值时才回滚（其它操作可能已经覆盖了）
    return current.data.some((a) => a.id === id && a.enabled === enabled)
      ? prev   // 还是本次写入的值 → 安全回滚
      : current; // 已被后续操作覆盖 → 保留
  });
  toast.error(...);
}
```

简化版：本批次只对 toggleEnabled 做严格 race protection（最易触发的连续点击场景）。其他 handler（reorder/save/link/unlink/delete）记录 prev snapshot 直接回滚，但 catch 里追加一行说明性注释 `// race-on-rollback：失败概率低，简单 rollback 接受可能覆盖后续操作的小概率风险`。

### D3：分页 + 服务端过滤（**方案 B**）

#### 待决策点（spec 评审时拍板）

| 方案 | 改动 | 用户体验 |
|---|---|---|
| **B（推荐）** | API 加 page/pageSize/search/brand/modality/enabled/sortKey；Prisma where + orderBy；返回 `{data, pagination}` | 一次做对，搜索过滤跨全部数据 |
| C（折中） | 服务端 search/filter，客户端 sort | 实施较快，但 sortKey 在分页下仍只对当页有效，体验差 |

我倾向 **B**。spec 默认按 B 设计；用户评审时可改 C。

#### B 的设计

```ts
// API: src/app/api/admin/model-aliases/route.ts
const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? 20)));
const search = url.searchParams.get("search")?.trim() ?? "";
const brand = url.searchParams.get("brand")?.trim() ?? "";
const modality = url.searchParams.get("modality")?.trim() ?? "";
const enabledFilter = url.searchParams.get("enabled");
const sortKey = url.searchParams.get("sortKey") ?? "alias";  // 'alias' | 'enabled' | 'updatedAt'

const where: Prisma.ModelAliasWhereInput = {
  ...(search ? { OR: [{ alias: { contains: search, mode: "insensitive" } }, { description: { contains: search, mode: "insensitive" } }] } : {}),
  ...(brand ? { brand } : {}),
  ...(modality ? { modality: modality as ModelModality } : {}),
  ...(enabledFilter === "true" ? { enabled: true } : enabledFilter === "false" ? { enabled: false } : {}),
};

const orderBy: Prisma.ModelAliasOrderByWithRelationInput =
  sortKey === "enabled" ? [{ enabled: "desc" }, { alias: "asc" }] :
  sortKey === "updatedAt" ? { updatedAt: "desc" } :
  { alias: "asc" };

const [aliases, total] = await Promise.all([
  prisma.modelAlias.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, include: { ... 现有 include 不动 ... } }),
  prisma.modelAlias.count({ where }),
]);

// allModels (unlinkedModels) 不分页，单独查（量小）

return NextResponse.json({
  data: data,
  unlinkedModels,
  pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
});
```

**前端：** 5 个 filter state 改为受控传入 query；`useAsyncData` 的 deps 加 `[page, pageSize, search, brand, modality, enabledFilter, sortKey]`；展开态 `expandedId` 与分页**无关**（即翻页后清空展开是合理的）；编辑态 `editState` 与分页**有关**（翻页前未保存的编辑会丢失），翻页前给 toast 提示"未保存的编辑将丢失"或自动保存。**spec 评审时拍板**翻页时未保存编辑的处理（默认行为：丢弃 + 不提示，跟其他 admin 页一致）。

#### Pagination 组件复用

```tsx
<Pagination
  page={page}
  totalPages={pagination?.totalPages ?? 1}
  onPageChange={setPage}
  total={pagination?.total}
  pageSize={pageSize}
/>
```

放置位置：**列表底部 + 浮动 sticky**（与 `admin/logs/page.tsx` 一致）。

### D4：Stitch 设计稿同步

`design-draft/admin-model-aliases/code.html` 当前不含分页控件 + 不反映拖拽顺序错位修复。本批次必须更新设计稿（追加 F-AAU-09 feature）：

- code.html 在列表底部添加 Pagination footer，pageSize 选择器（20 / 50 / 100）
- DESIGN.md 简短记录 "Phase 1 UX 改造（optimistic + pagination）的设计要点"
- screen.png 重新截图（用 generator 在本地启 dev server 后用 playwright 或手动截）

### D5：单测覆盖范围

- `useAsyncData mutate` 的功能测试（functional updater + race-safe）
- 至少 1 个 handler 的 happy + rollback + race 三场景（建议 toggleEnabled，最易写）
- 分页 API 的 query 解析（合法 / 越界 / 缺省）

不强制每个 handler 都加测试（成本/收益不对等），重点测 helper 与 race 范式。

## 设计

### F-AAU-01：reorder 视觉错位修复（D1）

**文件：** `src/app/(console)/admin/model-aliases/page.tsx:990-1003`

**改动：** flatMap 后追加 `.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))`。

**单测：** component 测：mock alias.linkedModels 包含 priority 错位场景，断言 ChannelTable 的 channels prop 顺序与 priority asc 一致。

### F-AAU-02：扩展 `useAsyncData` 暴露 `mutate`（D2.1）

**文件：** `src/hooks/use-async-data.ts`

**改动：** 增加 `mutate` 字段，functional updater + 直传值 + 不传等价 refetch 三种模式。返回 type 同步更新。

**单测：** `src/hooks/__tests__/use-async-data.test.ts`（新增）：
- mutate(value) 同步更新 data
- mutate(fn) 调用 fn(prev) 设新值
- mutate() 不传等价 refetch
- 跨 mutate + refetch 的协同（race 时 refetch 优先）

### F-AAU-03：toggleEnabled optimistic + race-protected rollback（D2.2 + D2.3）

**文件：** `page.tsx` 的 `toggleEnabled` (现 L161-210 周围)

**改动：** 删除 `load()`；用 D2.2 范式做 optimistic patch；catch 时按 D2.3 race protection 回滚。`getAliasWarnings` 弹 toast 的逻辑保留。

**单测：** `src/app/(console)/admin/model-aliases/__tests__/toggle-enabled.test.tsx`（新增，使用 @testing-library/react）：
- happy：mock fetch resolved → setData 应用了 enabled=true
- failure：mock fetch rejected → setData rollback 到 prev
- race：连续 2 次 toggle，第 1 次 reject → 不覆盖第 2 次的 state

### F-AAU-04：reorderChannels optimistic + rollback（D2.2）

**文件：** `page.tsx` 的 `reorderChannels` (L323-337)

**改动：** 删除 `load()`；optimistic patch 时按 `orderedIds` 的位次更新对应 alias.linkedModels 内每个 channel 的 priority 字段；前端 ChannelTable 因 D1 排序立即看到新顺序。catch rollback。

**注意：** 本 handler 涉及多 channel 跨 model 的 priority 字段批量更新，patch 函数要能精准定位（map alias.id → linkedModels → channels 内匹配 channelId）。

### F-AAU-05：saveChanges optimistic（D2.2）

**文件：** `page.tsx` 的 `saveChanges` (L212-254)

**改动：** 删除 `load()`；optimistic merge `editState[id]` 到对应 alias；保留 sellPrice CNY→USD 转换 + unit 自动填充（已在前端做）；catch rollback + 保留 editState（让用户重试）。

**注意：** `saveChanges` 写入的字段较多（capabilities / sellPrice / brand / description / modality / contextWindow / maxTokens 等），patch 函数要 spread merge，不能整体覆盖（避免 server 没返回的字段被丢失）。

### F-AAU-06：linkModel + unlinkModel optimistic（D2.2）

**文件：** `page.tsx` 的 `linkModel` (L296) + `unlinkModel` (L311)

**改动：**
- linkModel：optimistic 在 alias.linkedModels 末尾 push 一个**临时**条目（modelId 已知，channels 暂为空），catch rollback；成功后 server 返回的真实 channels 与本地暂存可能不一致 → 本 handler 调用 `refetch()` 一次（区别于纯 optimistic，因 channels 数据源在服务端）。**取舍：** 这是为了简单，linkModel 不算严格 optimistic，但比整页刷新强（visual delay 仅 1 个 alias 范围）。
- unlinkModel：optimistic 从 alias.linkedModels 过滤掉对应 modelId 条目；catch rollback。

**spec 评审时拍板：** linkModel 是否接受"半 optimistic"妥协（不刷整页但调 refetch）？或要求严格 optimistic（先放占位再更新）？

### F-AAU-07：deleteAlias optimistic（D2.2）

**文件：** `page.tsx` 的 `deleteAlias` (L264-273)

**改动：** 删除 `load()`；optimistic 从 aliases 中移除；catch rollback。`expandedId` 的清理保留。

### F-AAU-08：服务端分页 + 过滤（D3）

**前端：** `page.tsx` 引入 `page` / `pageSize` state（默认 1 / 20）；既有 search / brand / modality / enabledFilter / sortKey 5 个 filter state 改为传入 query；`useAsyncData` deps 包含全部分页/过滤参数；引入 `<Pagination>` 组件；切换 page 或 filter 时 reset page=1（filter 变化）或保留 page（用户主动翻页）。

**后端：** `src/app/api/admin/model-aliases/route.ts` 加 query params 解析；Prisma where + orderBy；返回 `{data, unlinkedModels, pagination}`。

**单测：** `src/app/api/admin/model-aliases/__tests__/route.test.ts`（如不存在则新增）覆盖：
- 默认参数（page=1, pageSize=20）
- search / brand / modality / enabled / sortKey 各自合法值
- pageSize 越界（>100 取 100；<1 取 1）
- 响应 shape 含 pagination 字段

### F-AAU-09：更新 Stitch 设计稿（D4）

**文件：** `design-draft/admin-model-aliases/code.html` + `DESIGN.md` + `screen.png`

**改动：**
- code.html：在 alias 列表底部追加 Pagination footer（参照 `admin-logs/code.html` 范式）
- DESIGN.md：追加 "Phase 1 UX 改造记录" 段，简述 reorder 修复 + optimistic + pagination 三类变更对设计稿的影响
- screen.png：在本地启 dev server 后用浏览器截图替换

**接受条件：** code.html 渲染后在 alias 列表底部能看到分页控件，与实际页面一致。

### F-AAU-10：Codex 验收 + 签收报告

按 BL-HEALTH-PROBE-MIN-TOKENS / BL-ALIAS-MODEL-CASCADE-ENABLE 范式：

1. `bash scripts/test/codex-setup.sh` + `codex-wait.sh`
2. 代码层验收：
   - F-AAU-01：grep page.tsx 确认 ChannelTable channels prop 含 sort by priority
   - F-AAU-02：useAsyncData.test.ts PASS；其他 8 个使用方未破
   - F-AAU-03 ~ F-AAU-07：单测 PASS；page.tsx 内 `load()` 调用从 8 处降到 1 处（仅 createAlias / createAliasForModel 保留 load()，详 spec D2 非目标）
   - F-AAU-08：API route.test.ts PASS；前端 deps 含分页参数；翻页 + 过滤时 URL 不变（受控 state）
3. UI 层验收（codex 在本地或预发跑）：
   - 拖拽 channel：所拖动的 channel 立即出现在期望位置，无 loading 闪屏；4 个 PATCH 全 200；GET 重拉次数 = 0
   - toggle alias enabled：开关立即翻转，无闪屏；warning toast 仍触发
   - 分页：page=1, pageSize=20 时 alias 数 ≤ 20；翻页后 expandedId 清空（接受）；过滤时 page reset 到 1
   - 设计稿 code.html 与实际 dev server 渲染对照，分页控件位置一致
4. `npx tsc --noEmit` / `npm run test` / `npm run build` 全 PASS
5. 输出 `docs/test-reports/BL-ADMIN-ALIAS-UX-PHASE1-signoff-YYYY-MM-DD.md`

## 数据模型 / 接口

无 Prisma schema 改动。

API 改动：

```diff
GET /api/admin/model-aliases
+ ?page=1&pageSize=20&search=&brand=&modality=&enabled=&sortKey=alias
{
  data: [...],
  unlinkedModels: [...],
+ pagination: { page, pageSize, total, totalPages }
}
```

向后兼容：query 全 optional，缺省时仍返回（但被分页限制为前 pageSize=20 条）— 是 breaking change（旧消费方期望全量）。**spec 评审时拍板**：是否需要 `pageSize=all` 兜底参数（admin 工具脚本可能依赖全量）。

## 风险与回滚

| 风险 | 缓解 |
|---|---|
| optimistic patch 函数复杂（reorder / save / link 多字段嵌套），实现错误反而更糟 | 抽 helper `applyAliasPatch(state, aliasId, patch)`、`applyChannelReorder(state, aliasId, orderedIds)`；单测覆盖 |
| race 在生产高频操作时被触发 | D2.3 范式 + 长期看可监控 sentry / 错误日志；本批次 toggleEnabled 严格保护，其他 handler best-effort |
| 分页对 admin 工具脚本破坏 | 后端兼容策略：`pageSize=all` 返回全量（spec 评审拍板） |
| 设计稿 code.html 维护成本（手 HTML/CSS） | 仅追加 footer，不动整体结构；DESIGN.md 留详细变更说明 |
| useAsyncData 改动影响其他 8 页面 | 仅 *新增* `mutate` 字段；现有调用无影响 |

**回滚：** 每个 feature 独立 commit。按 F-AAU-01 → 02 → 03 → ... 顺序，任何一步失败 git revert 单 commit 即可。

## 验收摘要

见 `features.json` 中 10 条 features 的 `acceptance`（含 F-AAU-09 设计稿同步条目）。

## 待评审拍板项

1. **D3 方案 B vs C：** 分页时 sortKey 客户端排序（C）还是服务端排序（B）？默认 B。
2. **F-AAU-06 linkModel 妥协：** 接受"半 optimistic（仍调 refetch）"还是要求严格 optimistic？默认半。
3. **D3 兼容：** API 是否提供 `pageSize=all` 兜底给 admin 工具脚本？默认**不**，但要 grep 仓内是否有 admin 自动化脚本调此 endpoint。
4. **D3 编辑态丢弃：** 翻页时未保存编辑直接丢弃 vs 提示？默认丢弃（与其他 admin 页一致）。
5. **F-AAU-09 截图方式：** Generator 手动截图 vs 由 codex 在 verifying 跑 playwright 自动截？默认 Generator 手动（避免引入 playwright 截图新逻辑）。

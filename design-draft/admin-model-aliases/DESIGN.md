# Admin Model Aliases — Design Notes

## Ignore (fabricated)
- "2 CANONICAL ENDPOINTS" stat — decorative
- "Analytics" top nav tab — no analytics for aliases

## Fully supported
- Classified Models section: cards per canonical model with alias chips (add/delete)
- Unclassified Models section: table with merge action (select target + merge)
- All CRUD via /api/admin/model-aliases + /merge endpoints

## Phase 1 UX 改造（BL-ADMIN-ALIAS-UX-PHASE1, 2026-05-01）

三类设计对齐：

1. **Reorder 视觉错位修复（D1）：** ChannelTable 的 channels prop 在 flatMap 后追加 `.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))`。跨 model 拖拽后 UI 顺序 = 路由层 routeByAlias 的全局 priority asc，不再"撒谎"。设计稿对应区块（Linked Infrastructure 表格）渲染逻辑不变，仅排序口径明确化。

2. **6 类写操作 optimistic update（D2）：** toggleEnabled / saveChanges / deleteAlias / linkModel / unlinkModel / reorderChannels 全部走 optimistic patch + 失败 rollback。useAsyncData hook 扩展 `mutate` 字段（SWR 风格 functional updater）作为统一通道。toggleEnabled 走严格 race protection（D2.3：仅当 state 仍为本次写入值时回滚），其余 best-effort。createAlias / createAliasForModel 仍走整页 refetch（创建场景下用户期望服务端权威回填）。**对设计稿的影响：** 无视觉新增，但用户感受变化巨大 —— 没有 loading 闪屏 / 展开折叠态保留 / 滚动位置保留。

3. **服务端分页 + 服务端过滤（D3 方案 B）：** GET /api/admin/model-aliases 增加 `?page&pageSize&search&brand&modality&enabled&sortKey` 参数，响应新增 `pagination: { page, pageSize, total, totalPages }` + `availableBrands` 字段。前端 page.tsx 引入 page state，filter 变化 reset page=1，分页 footer 复用 `<Pagination>` 组件，sticky 在 alias 列表底部。**设计稿同步（F-AAU-09）：** code.html 在 Configured Mappings section 末尾追加 Pagination footer：左侧 "Showing 1–20 of 137 aliases"，右侧 pageSize 选择器（20 / 50 / 100）+ 上一页/下一页按钮 + 页码序列（参照 design-draft/admin-logs/code.html 范式）。

`screen.png` 由 Generator 在本地启 dev server (`npm run dev`) 后，用浏览器手动截图替换 — 包含分页 footer + 折叠展开态 + filter 工具栏。

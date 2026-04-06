# whitelist-db-migration Signoff 2026-04-06

> 状态：**首轮验收已完成**（progress.json status=verifying）
> 触发：模型白名单迁移至数据库后的第 1 次 Codex 验收

---

## 变更背景

本批次将原先 hardcode 的模型白名单迁移到数据库字段 (`Model.enabled/canonicalName/isVariant`)，同步引擎不再依赖白名单文件，API/MCP/控制台也要改成基于 DB 状态做启用/禁用、售价编辑和变体折叠。目标是让 Admin 控制台成为唯一的模型治理入口，并修复 usage summary / get_usage_summary 在日期格式与下线模型标注上的两个 backlog 问题。

---

## 变更功能清单

### F-WL-01：Model schema 字段
**文件：** `prisma/schema.prisma`, `prisma/migrations/20260406200000_add_model_whitelist_fields/migration.sql`

- Prisma schema 新增 `enabled`/`canonicalName`/`isVariant` 字段，默认值符合迁移要求。迁移脚本把现有模型设为 enabled=true 并填充 canonicalName + isVariant，NOT NULL 列都有 DEFAULT（见 migration 文件第 1~21 行）。
- 构建 (`npm run build`) 通过，表明 schema/migration 与代码一致。

### F-WL-02：Sync 引擎改造
**文件：** `src/lib/sync/model-sync.ts`

- `model-whitelist.ts` 已被移除（36 行注释），所有 adapter 只按 modality 过滤；新模型 `enabled=false`（262 行 create 块）。
- 启动脚本 log 显示 317 个模型经由 OpenRouter 自动入库，默认 disabled，符合“新模型不出现在 list_models”。

### F-WL-03：API 层适配
**文件：** `src/app/api/v1/models/route.ts`, `src/lib/engine/router.ts`

- `/v1/models` 查询 `enabled=true` 且 `ACTIVE` channel（20~45 行）。
- 禁用 `openai/gpt-4o` 后，`list_models` MCP Tool 和 `/v1/models` 均返回 `[]`；再次启用后重新出现。
- 调用被禁用模型返回 `403 model_not_available`（curl 403 记录在 `/tmp/chat_disabled_model.json`）。

### F-WL-04：Admin API
**文件：** `src/app/api/admin/models/route.ts`, `src/app/api/admin/models/[id]/route.ts`

- `GET /api/admin/models` 支持 provider/modality/search，并按 canonicalName 折叠 `variants`，测试时启用自建 variant 数据成功折叠。
- `PATCH /api/admin/models/:id` 支持 enabled + sellPrice；售价修改后，Admin API 与 `/v1/models` pricing 同步显示 `$5 / $18`。

### F-WL-05：Admin 模型白名单页面
**文件：** `src/app/(console)/admin/model-whitelist/page.tsx`, 设计稿 `design-draft/Model Whitelist (Admin)/index.html`

- 组件顶部使用 `useTranslations("modelWhitelist")` 并按设计稿实现统计卡片、搜索/筛选、Enable 开关、售价编辑、Channels/Health badge 与分页（参考 282~360 行、400~520 行）。
- 逐元素比对 HTML 与 React JSX，结构、icon、class、NEW/variant 标记与 Stich 原稿一致。

### F-WL-06：usage summary 日期格式
**文件：** `src/app/api/projects/[id]/usage/daily/route.ts`, `src/lib/mcp/tools/get-usage-summary.ts`

- `to_char(..., 'YYYY-MM-DD')` 用于 REST + MCP 两侧。通过向项目插入两条 callLog 后，`GET /api/projects/{id}/usage/daily` 返回 `"date": "2026-04-04"` 等 ISO 8601 字符串。

### F-WL-07：标注已下线模型
**文件：** `src/lib/mcp/tools/get-usage-summary.ts`

- Tool 结束处把 topModels 与当前 enabled 集合对比，不在集合中则加 `deprecated: true`（85~109 行）。禁用 `gpt-4o` 后调用 tool，返回 `"deprecated": true`，验证通过。

### F-WL-08：i18n 补全
**文件：** `src/messages/en.json`, `src/messages/zh-CN.json`

- `modelWhitelist` 命名空间在中英文包中均增加 30+ key，页面所有文案都通过 `useTranslations` 渲染（如 284~347 行），满足“新文案全部走 i18n”。

### F-WL-09：E2E 验证

- 新模型初始 `enabled=false` 且 `list_models` 结果为空；Admin 启用后出现在 MCP/REST 模型列表，禁用后即刻消失。
- 售价编辑生效（Admin PATCH → `/v1/models` pricing 变为 `$5/$18`）。
- 手动创建 variant + channel 后，Admin 页面和 API 都能折叠/展开 variants。
- `GET /api/projects/{id}/usage/daily` 返回 `YYYY-MM-DD`，`get_usage_summary` 在模型禁用时带 `deprecated`。
- 调用 `/v1/chat/completions` 在启用状态下会路由到 OpenRouter 通道并得到上游 401（由于 seed 里是 placeholder key，本地无法完成真实调用，属 L1 既知限制）。

---

## 未变更范围

| 事项 | 说明 |
|---|---|
| 计费扣费/充值流程 | 本批次只改模型白名单与 Admin UI，充值/扣费逻辑与数据结构未改动。 |
| Provider 适配器接口 | 除 filter 行为外，adapter 调用参数、错误映射保持不变。 |

---

## 预期影响

| 项目 | 改动前 | 改动后 |
|---|---|---|
| 模型启用控制 | 代码内置白名单，需改代码 | Admin UI + DB `enabled` 列即可启停 |
| usage 日期格式 | `Month DD, YYYY`，无法排序 | `YYYY-MM-DD`，便于排序/对齐 MCP |
| get_usage_summary topModels | 不知道模型是否下线 | 返回 `deprecated: true` 提示开发者 |

---

## 类型检查

```
npm run build
# 由 scripts/test/codex-setup.sh 在步骤 [4/5] 执行，编译 + lint + typecheck 均已通过。
```

---

## Harness 说明

本批改动经 Harness `planning → building → verifying` 完整交付，本次验收全部 PASS。
`progress.json` 已设为 `status: "done"`，并把本报告路径填入 `docs.signoff`。

---

## Framework Learnings

无新增经验/坑需要沉淀。

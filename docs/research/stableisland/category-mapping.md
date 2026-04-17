# 竞品用例 → 我们的 Template Categories 映射

**来源情报：** `./flow-catalog.md`
**目标：** 扩展 `src/lib/template-categories.ts` 的 `DEFAULT_TEMPLATE_CATEGORIES`，新增**中文营销内容**大类及子分类
**定位：** 不照搬他们的产品形态，而是把**用例归类**沉淀为我们的模板库选题来源

## 一、现状

当前 6 类（`src/lib/template-categories.ts:12-19`）：`dev-review` / `writing` / `translation` / `analysis` / `customer-service` / `other`

偏开发/工具向，**中文本土营销创作完全没覆盖**。这正是对方 28 个流程挖出来的空白地带。

## 二、提议新增

保持现有结构扁平（`id` 是 slug，不做父子），新增 4 个大类 + 调整 `writing` 的定位：

| id | label | labelEn | icon | 覆盖用例 |
|---|---|---|---|---|
| `social-content` | 社交内容 | Social Content | `tag` | 朋友圈 6 类、评论区 3 平台、图文蓝V |
| `short-video` | 短视频脚本 | Short Video Script | `movie` | IP 脚本、视频号/抖音/小红书脚本、封面标题、爆款切入 |
| `ip-persona` | IP 与人设 | IP & Persona | `person_outline` | 故事型小人设、IP 内容规划、采访方案 |
| `marketing-strategy` | 营销策略 | Marketing Strategy | `insights` | 私域营销、产品力可视化、证据链规划 |

同时把 `writing` 的 label 从"内容创作"改为"通用写作"/"General Writing"（避免和 `social-content` 语义重叠）。

## 三、落地路径

**Option 1（推荐）：改 `DEFAULT_TEMPLATE_CATEGORIES`**
直接把新增项写进常量，下次 admin 访问 `/admin/operations` 分类管理时会看到默认补齐。

**Option 2：seed 脚本**
新增 `prisma/migrations/YYYYMMDD_template_categories_expansion_seed/migration.sql`，向 `system_config` 的 `TEMPLATE_CATEGORIES` key 注入扩展后的 JSON。参考上一次 F-TL-02 seed 的做法（`prisma/migrations/20260417_template_categories_seed/`）。

**建议走 Option 2**，保留现有部署的管理员自定义不被覆盖。

## 四、代码 diff 草案（Option 1，供参考）

```ts
// src/lib/template-categories.ts
export const DEFAULT_TEMPLATE_CATEGORIES: TemplateCategory[] = [
  { id: "dev-review", label: "开发审查", labelEn: "Dev Review", icon: "code_review" },
  { id: "writing", label: "通用写作", labelEn: "General Writing", icon: "edit_note" },
  { id: "social-content", label: "社交内容", labelEn: "Social Content", icon: "tag" },
  { id: "short-video", label: "短视频脚本", labelEn: "Short Video Script", icon: "movie" },
  { id: "ip-persona", label: "IP 与人设", labelEn: "IP & Persona", icon: "person_outline" },
  { id: "marketing-strategy", label: "营销策略", labelEn: "Marketing Strategy", icon: "insights" },
  { id: "translation", label: "翻译", labelEn: "Translation", icon: "translate" },
  { id: "analysis", label: "数据分析", labelEn: "Analysis", icon: "analytics" },
  { id: "customer-service", label: "客服", labelEn: "Customer Service", icon: "support_agent" },
  { id: "other", label: "其他", labelEn: "Other", icon: "category" },
];
```

## 五、前置验证点（避免踩坑）

- [ ] 图标名走 Material Symbols（和现有一致，`tag` / `movie` / `person_outline` / `insights` 都合法）
- [ ] Slug 通过 `SLUG_PATTERN` 验证（`^[a-z0-9][a-z0-9-]{0,31}$`，全部过）
- [ ] i18n：消息文件 `src/messages/zh-CN.json` + `en.json` 若有分类标签引用需同步新增（F-TL-02 的 seed 是用 label 字段直接渲染，应该不需要 i18n 改动）
- [ ] 现有 Template 不受影响：`validateCategoryId()` 遇到未知 id 会回落到 `"other"`

## 六、不做这些

- 不新增"朋友圈"这种再细一层的子类 —— 分类扁平化，避免过度工程。具体用例由 Template 本身承载
- 不新增"小红书 / 抖音 / 视频号"平台分类 —— 平台是场景的运行时变量，不是分类轴
- 不照抄对方"TT-" 前缀命名 —— 那是租户自用约定，对我们公共库无意义

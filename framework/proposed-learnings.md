# Framework 提案暂存区

> Generator 和 Evaluator 在工作中发现值得沉淀的经验时，追加到本文件。
> Planner 在 done 阶段读取本文件，逐条提交给用户确认。
> 确认后由 Planner 正式写入 `framework/` 对应文件，并在 `CHANGELOG.md` 追加记录，最后从本文件移除已确认条目。
> 已闭环条目归档到 `framework/archive/proposed-learnings-archive-vX.Y.md`。

---

<!-- 待确认的提案出现在此处，示例格式：

## [YYYY-MM-DD] [角色] — 来源：F-XXX

**类型：** 新规律 / 新坑 / 模板修订 / 铁律补充

**内容：** [一句话描述]

**建议写入：** `framework/README.md` §经验教训 / `framework/harness/xxx.md` / 其他

**状态：** 待确认

-->

## [2026-04-18] Planner — 来源：BL-FE-PERF-01 F-PF-02 acceptance 口径偏差

**类型：** 铁律 1 的专项延伸（spec 描述颗粒度）

**内容：** Planner 写 acceptance 时必须区分"实现形式"与"语义意图"。本次 F-PF-02 要求 "DevTools Network 只加载一个 `messages/*.json`"，但 Next.js 对 `import('./foo.json')` 的动态导入标准行为是编译为独立 JS chunk（`messages-[hash].js`），不是 `.json` 文件请求。Generator 实现符合 Next.js/Webpack 最佳实践（目标 bundle 优化已达成，dashboard 281→169 kB 证据充分），但被死板的 acceptance 描述判 FAIL。若真按 spec 改成 `.json` 形态，要把 JSON 放 `public/` 并运行时 fetch，反而牺牲 webpack 的 chunk 优化和缓存。

**建议写入：** `framework/harness/planner.md` Planner 铁律 1 子条目：

**铁律 1.1：acceptance 的"实现形式"与"语义意图"必须分离**
- 写 acceptance 时问自己：**这条在验证功能行为还是实现细节？**
- 若必须写具体技术形态（文件名/路径/API 形态），必须同时说明**允许的等价实现**
- Next.js / Webpack / SWC 等编译期优化会改变资源形态，acceptance 不得锁死特定形态
- 例：✗ "只加载 messages/*.json" ✓ "只加载一个 locale 的资源（chunk 或 json 均可）"
- 例：✗ "返回 HTTP 403" ✓ "返回 MCP isError:true"（见铁律 2.1）
- 例：✗ "使用 dayjs.format('YYYY-MM-DD')" ✓ "格式化为 ISO 日期字符串"

**状态：** 待确认

## [2026-04-18] Generator — 来源：BL-FE-PERF-01 F-PF-01 Recharts 懒加载首次失败

**类型：** 新坑（Webpack 静态分析边界）

**内容：** `dynamic(() => import('./foo'))` 懒加载 foo 的条件：**调用方不得静态 import foo 的任何 symbol**。即便 component 本身走 dynamic，若页面 `import { PIE_COLORS } from './charts-section'` 引用了常量，Webpack 静态分析会把整个 charts-section 模块（含 recharts）打进主 chunk，dynamic 失效。首次 build `/dashboard` 仍是 281 kB 就是这个原因。

**解决：** 常量 / type / helper 必须抽到独立 `*-constants.ts` / `*-types.ts` 文件：

```
// ❌ 坏：dashboard/page.tsx 静态引用 charts-section 导致 recharts 被静态分析
import { PIE_COLORS, type ChartData } from "./charts-section";
const ChartsSection = dynamic(() => import("./charts-section"));  // 无效！

// ✅ 好：常量独立文件，page.tsx 不触及 charts-section
// dashboard/charts-constants.ts
export const PIE_COLORS = [...];

// dashboard/charts-section.tsx
"use client";
import { PieChart } from "recharts";  // 仅此文件含 recharts
import { PIE_COLORS } from "./charts-constants";

// dashboard/page.tsx
import { PIE_COLORS } from "./charts-constants";  // 纯静态
const ChartsSection = dynamic(() => import("./charts-section"));  // 真正懒加载
```

**建议写入：** `framework/harness/generator.md` §前端性能相关经验 小节，或独立"dynamic import 模块边界"标题。

**来源：** BL-FE-PERF-01 F-PF-01 实战发现，PIE_COLORS 抽常量文件是三大路由 First Load 下降 100+ kB 的关键。

**状态：** 待确认


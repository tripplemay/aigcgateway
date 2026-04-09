# R3C — 最终 DS 统一 + Auth/公共页面还原

## 目标

1. 修复 R3A 遗留的 3 个 admin 页面 DS token 不一致问题
2. 修复 docs 页面和 layout.tsx 的 DS token
3. 全量重构 Login / Register 页面（旧模式→DS + i18n）
4. Polish MCP Setup 页面（部分 DS，手写 dropdown）

完成后全部 36 页 DS 统一。

## 分组一：DS Token 修复（纯 CSS 类名替换）

| 页面 | 行数 | 问题 | 替换规则 |
|---|---|---|---|
| model-whitelist | 592 | ~50 处 shadcn token（bg-card/bg-muted/text-muted-foreground 等） | → ds-* 前缀 |
| model-aliases | 264 | ~21 处同上 | → ds-* 前缀 |
| model-capabilities | 292 | ~12 处 text-slate-*/bg-slate-* 硬编码 | → ds-* token |
| docs | 244 | ~21 处 shadcn token | → ds-* 前缀 |
| layout.tsx | 89 | 1 处 text-muted-foreground | → text-ds-on-surface-variant |

### Token 映射表

| 旧 token | 新 token |
|---|---|
| `bg-card` | `bg-ds-surface-container-lowest` |
| `bg-muted` | `bg-ds-surface-container-low` |
| `bg-muted/10`, `bg-muted/30` | `bg-ds-surface-container-low/10` 等 |
| `text-muted-foreground` | `text-ds-on-surface-variant` |
| `bg-background` | `bg-ds-surface` |
| `bg-primary` (非按钮) | `bg-ds-primary` |
| `text-primary` | `text-ds-primary` |
| `bg-primary/10` | `bg-ds-primary/10` |
| `text-slate-400/500` (标签类) | `text-ds-outline` 或 `text-ds-on-surface-variant` |

## 分组二：Auth + 公共页面重构

| 页面 | 行数 | 问题 | 工作量 |
|---|---|---|---|
| Login | 545 | 无 DS、无 shadcn、大量硬编码英文、内嵌 Terminal 组件 | 重度 |
| Register | 110 | 已有 shadcn，但需与 Login 风格统一 + DS token | 中度 |
| MCP Setup | 396 | 部分 DS，手写 dropdown，硬编码 `bg-indigo-*` | 轻度 polish |

## 验收标准（通用）

1. 全部页面无 shadcn 旧 token（bg-card/bg-muted/text-muted-foreground 等）
2. 全部页面使用 `ds-*` 前缀 token
3. Login/Register 对齐设计稿
4. 无硬编码英文（切换中文后无英文残留）
5. `npm run lint` + `npx tsc --noEmit` 通过

## 不包含

- QuickStart 页面（已核查，DS 正确，无需修改）
- 新增 API 端点 / 数据库迁移

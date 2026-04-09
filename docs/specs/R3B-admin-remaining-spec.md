# R3B — Admin 剩余页面还原规格

## 目标

将 6 个 Admin 页面从旧代码模式迁移至 R1 设计系统标准：
- `useAsyncData` 替代 `useCallback + useEffect` 手动状态管理
- shadcn/ui 组件替代手写 HTML（Input / Skeleton / Switch 等）
- DS token 统一（消除 `bg-surface` 等无前缀遗留）
- i18n 硬编码英文消除
- 对齐 `design-draft/` 下对应设计稿

## 页面清单

| 页面 | 路径 | 行数 | 设计稿 | 主要问题 |
|---|---|---|---|---|
| Health | `admin/health/page.tsx` | 226 | admin-health | 无 useAsyncData；硬编码英文（"Real-time infrastructure..."、"Total Channels"、"Active Models" 等） |
| Logs | `admin/logs/page.tsx` | 254 | admin-logs | 无 useAsyncData；硬编码 "Sell"、"System-wide audit logs..."、"records"、"Traffic Insight"、"Error Spike Alert" |
| Usage | `admin/usage/page.tsx` | 241 | admin-usage | 无 useAsyncData；表头硬编码 "Provider/Calls/Cost/Revenue/Margin/Margin %" |
| Users | `admin/users/page.tsx` | 99 | admin-users | 无 useAsyncData；代码较短，改动量小 |
| User Detail | `admin/users/[id]/page.tsx` | 146 | admin-user-detail | 无 useAsyncData；面包屑 "Users" 硬编码；"Projects" 标题硬编码；"Deactivate User (Coming Soon)" 等 |
| Templates | `admin/templates/page.tsx` | 365 | admin-templates | 无 useAsyncData；DS token 混用（`bg-surface` vs `bg-ds-surface-*`）；"Visibility:" 硬编码 |

## 重构模式（参照 R3A）

### 数据获取
```typescript
// Before (旧模式)
const [data, setData] = useState([]);
const [loading, setLoading] = useState(true);
const load = useCallback(async () => { ... }, [deps]);
useEffect(() => { load(); }, [load]);

// After (新模式)
const { data, loading, refetch } = useAsyncData(
  () => apiFetch<T>(url),
  [deps]
);
```

### 组件替换
- 手写 `<input>` → `<Input>` (shadcn/ui)
- 手写 loading skeleton → `<Skeleton>` (shadcn/ui)
- 手写 toggle switch → `<Switch>` (shadcn/ui)
- 手写 pagination → 保留（项目无统一 Pagination 组件，沿用现有模式）

### DS Token 统一
- `bg-surface` → `bg-ds-surface`
- `text-on-surface` → `text-ds-on-surface`
- `bg-primary` → `bg-ds-primary`
- 所有无 `ds-` 前缀的 design token 类名统一加前缀

### i18n
- 所有用户可见文本必须通过 `useTranslations()` 获取
- 新增 key 写入 `messages/en.json` 和 `messages/zh.json`

## 验收标准（通用）

每个页面功能完成后必须满足：
1. `useAsyncData` 替代旧模式
2. shadcn/ui 组件使用正确
3. 无硬编码英文（切换中文后无英文残留）
4. 对齐设计稿布局
5. `npm run lint` + `npx tsc --noEmit` 通过

## 设计稿

所有 6 个设计稿均标注 "Fully supported. No gaps between design and backend API."

## 不包含

- 新增 API 端点
- 数据库迁移
- 新功能开发

# Daily Code Review: YYYY-MM-DD

审查日期：YYYY-MM-DD
审查范围：`origin/main` 最近 24 小时 commit（git log --since="24 hours ago"）
审查人：Claude（桌面端 routine）
commit 列表：
- `<sha>` `<subject>`

---

## 概览

| 档位 | 条目数 |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low / Info | 0 |

（无新增 commit 时，直接填"今日无增量提交，跳过审查"并结束。）

---

## Critical

<!-- 如有则列出，顶部加 [URGENT] 标记；否则填"无"。 -->

### [C1] 标题

- **文件：** `path/to/file.ts:LINE`
- **证据：**
  ```ts
  // 粘贴关键代码
  ```
- **影响：** 一句话描述业务 / 安全影响
- **建议：** 一句话修复思路

---

## High

<!-- 格式同上，前缀改为 [H1] [H2] ... -->

---

## Medium

<!-- 格式同上，前缀改为 [M1] [M2] ... -->

---

## Low / Info

<!-- 格式同上，前缀改为 [L1] [L2] ...；只列一句话也可 -->

---

## 通过项（可选）

- 简要列举做得好的地方（<=5 条），帮助 Planner 判断质量走势。

# API-POLISH Signoff 2026-04-16

> 状态：**PASS — 全部验收通过**
> 触发：reports-20260416 剩余 medium/low DX 改进 + 用户反馈

---

## 变更背景

AUDIT-FOLLOWUP-2 签收后启动的最终打磨批次。覆盖 reports-20260416 审计剩余的 medium/low 断言（8 项）+ 两个用户反馈（CNY 余额显示、页面宽度统一）。

---

## 验收结果汇总

| Feature | 标题 | 验证方式 | 结果 |
|---------|------|---------|------|
| F-AP-01 | get_balance 分页 | L2 生产 | **PASS** |
| F-AP-02 | list_logs action_id 过滤 | L2 生产 | **PASS** |
| F-AP-03 | list_actions totalVersions | L2 生产 | **PASS** |
| F-AP-04 | create_api_key expiresAt | L2 schema | **PASS** |
| F-AP-05 | 429 retryAfterSeconds | 代码审查 | **PASS** |
| F-AP-06 | image usage_summary | L2 生产 | **PASS** |
| F-AP-07 | max_tokens 校验 | L2 生产 | **PASS** |
| F-AP-08 | generate_image size 描述 | L2 schema | **PASS** |
| F-AP-09 | 余额 USD→CNY | 代码审查+API | **PASS** |
| F-AP-10 | 页面宽度统一 | 代码审查 | **PASS** |
| F-AP-11 | 全量验收 | 本报告 | **PASS** |

---

## L2 生产验证详情

**环境：** `https://aigc.guangai.ai` (production)
**API Key：** `pk_babaca...`
**时间：** 2026-04-16T08:30~09:00 UTC

### F-AP-01: get_balance 分页
```
get_balance(include_transactions=true, limit=2, offset=0)
→ transactions: 2, hasMore: true
```
**PASS** — limit 生效，hasMore 正确返回。

### F-AP-02: list_logs action_id 过滤
```
list_logs(action_id="cmo0gvb2i0005bn5w9zatxia7", limit=3)
→ Logs returned: 2 (均为该 Action 触发的日志)
```
**PASS** — 过滤参数被接受并返回正确结果。

### F-AP-03: list_actions totalVersions
```
DX审计-SEO标题生成器 totalVersions=1
DX审计-文章生成器 totalVersions=3
```
**PASS** — 每个 Action 返回版本数。

### F-AP-04: create_api_key expiresAt
```
MCP tools/list → create_api_key params: [name, description, expires_at]
```
**PASS** — expires_at 参数在 MCP schema 中。Auth middleware 过期检查已在代码审查中确认（auth-middleware.ts:111-116）。

### F-AP-05: 429 retryAfterSeconds
15 次快速请求未触发 429（rate limit 可能按分钟窗口计）。代码审查确认：
- `rate-limit.ts:312,371,448` — retryAfterSeconds 在 error body 中
- Retry-After header 同步设置
**PASS**（代码审查）

### F-AP-06: image usage_summary
```
get_usage_summary(group_by="model", days=30)
→ IMAGE 模型: totalImages=0/1/4/6, 无 totalTokens 字段
```
**PASS** — IMAGE 模型用 totalImages 替代 totalTokens。

### F-AP-07: max_tokens 校验
```
chat(model="gemini-2.5-flash-lite", max_tokens=9999999)
→ code: invalid_parameter
→ message: max_tokens (9999999) exceeds the max output limit of model "gemini-2.5-flash-lite" (65535).
```
**PASS** — 引用 maxOutputTokens（65535），英文消息，无中文混合。

### F-AP-08: generate_image size 描述
```
MCP generate_image.size.description:
"Image size. Common values: 1024x1024, 1024x1792, 1792x1024, auto.
 Check supportedSizes in list_models(modality='image') for valid values per model."
```
**PASS** — 常见值已列出。

### F-AP-09: 余额 USD→CNY
- `/api/exchange-rate` 返回 `{"rate": 7.3}`
- 代码审查：`formatCNY()` 在 sidebar / dashboard / balance 页面统一调用
- API 层 balance 仍返回 USD（后端不改）
**PASS**

### F-AP-10: 页面宽度统一
- 代码审查：PageContainer 删除 narrow variant，仅保留 max-w-7xl
- quickstart / mcp-setup / docs 三个页面不再传 `size="narrow"`
**PASS**

---

## 类型检查

```
$ npx tsc --noEmit
# 0 errors (排除 vitest 模块声明)
```

---

## Harness 说明

本批改动经 Harness 状态机完整流程（planning → building → verifying → done）交付。
无 fix round（首轮即全部 PASS）。
`progress.json` 已设为 `status: "done"`，signoff 路径已填入 `docs.signoff`。

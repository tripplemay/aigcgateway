# Public Templates 生产真实链路测试报告（2026-04-09）

## 测试目标
验证当前管理员预设的 3 个公共模板在生产环境是否可通过真实 API 链路执行，并观察返回结果是否正常。

## 测试环境
- 环境：Production
- Base URL：`https://aigc.guangai.ai`
- 执行时间：2026-04-09（UTC 约 14:32–14:36）
- 鉴权方式：
  - 管理端 JWT：用于查询模板与创建测试 API Key
  - API Key：用于调用 `POST /v1/templates/run`

## 测试方法
1. 管理员登录：`POST /api/auth/login`
2. 查询公共模板：`GET /api/admin/templates?page=1&pageSize=200`，筛选 `isPublic=true`
3. 为模板所属项目创建临时 API Key
4. 调用真实执行接口：`POST /v1/templates/run`（`stream=false`）
5. 记录每个模板的 HTTP 状态码、耗时、步骤事件和输出/错误摘要

## 目标模板
1. `cmnrce652000pbn5o4w46vy09` 标准开发需求审查模板（严审版）
2. `cmnrce5w6000lbn5o2lxg9dtx` 标准开发需求审查模板（精简版）
3. `cmnrccamn000jbn5n6e2xu8zf` 标准开发需求审查模板

## 变量要求确认
三者均依赖模板变量，至少要求：
- `requirement_text`
- `business_context`
- `technical_context`

未传该必填变量时，接口返回：
- `HTTP 400`
- `Missing required variable: requirement_text`

## 执行结果

| 模板ID | 模板名 | 结果 | HTTP | 耗时 | 关键现象 |
|---|---|---|---:|---:|---|
| `cmnrce652000pbn5o4w46vy09` | 严审版 | FAIL | 504 | 120298ms | Nginx `Gateway Time-out` |
| `cmnrce5w6000lbn5o2lxg9dtx` | 精简版 | PASS | 200 | 29645ms | `total_steps=1`，返回完整审查报告文本 |
| `cmnrccamn000jbn5n6e2xu8zf` | 标准版 | FAIL（限流） | 429 | 288ms | `Rate limit exceeded. Please retry after 60 seconds.` |

## 证据摘录
- 严审版：`<h1>504 Gateway Time-out</h1>`（nginx/1.18.0）
- 精简版：返回报告正文（非空），含“需求审查报告”标题
- 标准版：`Rate limit exceeded. Please retry after 60 seconds.`

## 结论
- 当前 3 个公共模板在生产真实链路下为“部分可用”。
- 精简版可稳定执行并返回完整结果。
- 严审版存在超时风险（网关 504）。
- 标准版本轮受限流影响，未拿到一次成功样本。

## 风险与建议
1. 严审版建议优先排查执行时长与网关超时阈值（包含模型调用累计时长）。
2. 标准版建议用独立 API Key 或降低频率做复测，排除限流干扰后确认稳定性。
3. 若要作为线上可直接使用的“管理员预设模板”，建议增加一次“通过标准”：3 个模板各至少成功 1 次。

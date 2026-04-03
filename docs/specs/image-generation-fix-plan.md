# 图片生成修复计划

> Version 1.1 | 2026-04-04
> 状态：代码已实施（F-IMG-01 + F-IMG-02b），待部署 + 运维操作（F-IMG-03/04）
> 触发：P3-1 生产验收问题 #3 — MCP generate_image 调用失败

---

## 1. 问题背景

P3-1 生产验收中，MCP `generate_image` 调用返回非结构化错误 `Unexpected token 'E', "Error: Inc"... is not valid JSON`。

根因分析发现三层问题：
1. **数据层**：dall-e-3 Channel 状态 DISABLED，sellPrice 为 0；15 个 IMAGE 模型仅 2 个有 ACTIVE Channel
2. **引擎层**：`imageViaChat()` URL 提取正则过严，无法匹配无后缀 CDN URL 和 base64 inline 图片
3. **MCP 层**：错误响应为纯文本而非结构化 JSON，导致客户端 JSON.parse 失败

---

## 2. 修复范围

### F-IMG-01: MCP generate_image 错误响应结构化（P0）

**文件：** `src/lib/mcp/tools/generate-image.ts`

**当前行为：**
```typescript
// catch 块（约 line 186）
return {
  content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
  isError: true,
};
```

**问题：** 客户端收到 `"Error: ..."` 纯文本后尝试 JSON.parse 失败。

**修复（两处）：**
- **通用 catch 块（~line 186）**：text 改为 `JSON.stringify({ code: engineErr?.code ?? "provider_error", message: ... })`
- **provider_timeout 分支（~line 173-183）**：text 改为 `JSON.stringify({ code: "provider_timeout", message: "...${latencyMs}s" })`
- 保持 `isError: true` + `type: "text"` 的 MCP 协议规范不变

**验收标准：**
- 请求不存在/DISABLED 的图片模型 → 返回 `isError: true`，text 为合法 JSON `{"code":"no_active_channel","message":"..."}`
- 上游超时 → 返回 `isError: true`，text 为 `{"code":"provider_timeout","message":"..."}`
- 上游 500/其他错误 → 返回 `isError: true`，text 为 `{"code":"provider_error","message":"..."}`
- 所有错误分支的 text 均可被 `JSON.parse()` 成功解析

---

### F-IMG-02: ~~imageViaChat URL 提取增强~~（已实现，跳过）

> **评审结论：跳过。** 代码（openai-compat.ts 296–354 行）已在之前会话中完全重写，包含：
> multimodal parts 数组提取（image_url 类型）✅、base64 data URI 正则 ✅、
> 带扩展名 URL 正则 ✅、任意 HTTPS URL catch-all ✅、全部不匹配时明确错误 ✅。
>
> **补充子任务（F-IMG-02b）：** 当前 multimodal 提取只处理 `image_url` 类型，
> Gemini 原生 API 返回 `inline_data` 类型不被命中。作为可选补充一并实施：
> ```json
> { "type": "inline_data", "inline_data": { "mime_type": "image/png", "data": "base64..." } }
> ```
> 在 multimodal 分支增加 `inline_data` → `data:image/{mime};base64,{data}` 转换。

---

### F-IMG-03: 生产 dall-e-3 Channel 恢复（P1，运维操作）

**操作方式：** SSH 到生产服务器执行 SQL 或 Node 脚本

**步骤：**
1. 将 `openai/dall-e-3` Channel 状态从 DISABLED 改为 ACTIVE
2. 设置 sellPrice：`{"unit": "call", "perCall": 0.04}`（OpenAI dall-e-3 标准价 $0.04/张 1024x1024）
3. 设置 costPrice：`{"unit": "call", "perCall": 0.04}`
4. 确认 OpenAI Provider authConfig 有效（API Key 未过期）

**验收标准：**
- `curl /v1/images/generations -d '{"model":"openai/dall-e-3","prompt":"red circle","n":1,"size":"1024x1024"}'` 返回 200 + 图片 URL
- MCP `generate_image("openai/dall-e-3", "red circle")` 返回图片 URL
- CallLog 记录 sellPrice > 0

---

### F-IMG-04: IMAGE 模型 Channel 批量检查（P2，运维操作）

**操作方式：** 查询所有 IMAGE 模型的 Channel 状态，对有效服务商的 Channel 恢复 ACTIVE

**当前状态：**

| 模型 | Channel 状态 | 说明 |
|---|---|---|
| openai/dall-e-3 | DISABLED | → F-IMG-03 修复 |
| openai/gpt-image-1 | 无 ACTIVE | 需确认 OpenAI 是否支持此模型 |
| zhipu/cogview-3-flash | ACTIVE | ✅ 正常 |
| volcengine/seedream-4.0 | ACTIVE | ✅ 正常（imageViaChat） |
| siliconflow/* | 无 ACTIVE | 需确认 SF 图片 API 可用性 |
| openrouter/google/gemini-*-image | 无 ACTIVE | 需确认 OR 图片路由可用性 |

**验收标准：**
- 所有有效 IMAGE 模型至少有 1 个 ACTIVE Channel
- 各 Channel 的 sellPrice 已配置（不为 0）

---

## 3. 实施顺序

```
F-IMG-01 (MCP 错误格式)  ──┐
                            ├── 代码修改，同一 commit
F-IMG-02 (URL 提取增强)  ──┘
            ↓
       本地自测（tsc + 手动测试）
            ↓
       提交推送 + 部署
            ↓
F-IMG-03 (dall-e-3 恢复)  ── 部署后在生产执行
            ↓
F-IMG-04 (批量 Channel 检查) ── 生产运维
            ↓
       Evaluator 验收
```

---

## 4. 不在本轮修复范围

- **OpenAI 直连 401**：之前已知遗留（Provider authConfig 问题），需管理员补充有效 API Key，独立排查
- **Anthropic 直连**：同上
- **sellPriceMarkup 系统配置**：当前定价依赖 model-sync 自动填充 + 管理员手动覆盖，不改架构
- **健康检查降级策略**：dall-e-3 被降级为 DISABLED 是健康检查的正常行为（连续失败），本轮只手动恢复，不改降级逻辑

---

## 5. 风险评估

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| dall-e-3 恢复后再次被健康检查降级 | 中 | Channel 再次不可用 | 确认 OpenAI API Key 有效后再恢复 |
| multimodal content 提取引入新 bug | 低 | 已有模型的文本提取退化 | 保持原有字符串正则不变，multimodal 检测在前 |
| MCP 错误格式变更影响已有客户端 | 低 | 客户端可能依赖旧格式 | `isError: true` 不变，text 内容从纯文本改为 JSON 是增强非破坏 |

---

## 6. 证据文件

- 生产验收报告：`docs/test-reports/template-governance-production-acceptance-2026-04-03.md`
- MCP 测试日志：`docs/test-reports/template-governance-production-mcp-main-2026-04-03.txt`
- 生产 Channel 定价查询记录：本文档编写过程中的 SSH 查询结果

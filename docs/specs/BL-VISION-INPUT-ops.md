# BL-VISION-INPUT — Ops Runbook（图片输入 vision 门禁 provisioning）

配套 `docs/specs/BL-VISION-INPUT-spec.md`。本文档面向运维：开启图片输入前如何盘点 / 补全 vision 标记，以及验证与回滚。

## 1. 背景

REST `/v1/chat/completions` 的图片输入走**严格门禁**：请求含 `image_url` 时，模型必须声明 `capabilities.vision=true` 才放行（F-VI-02）。vision 标记由 alias-classifier 在 model sync 时自动推断写在 `ModelAlias.capabilities` 上，历史 alias 可能有遗漏。

## 2. vision 标记盘点 + 补漏脚本

`scripts/audit-vision-capabilities.ts`（幂等，dry-run 默认）。

```bash
# 1) dry-run：盘点 enabled TEXT alias 的 vision 现状 + 打印待补清单（不写库）
npx tsx scripts/audit-vision-capabilities.ts

# 2) review 待补清单（脚本输出的「待补 vision=true」列表），确认都是真·vision 模型

# 3) 写库 + 清 models:list* 缓存
npx tsx scripts/audit-vision-capabilities.ts --apply
```

- **匹配范围**：仅对 alias 名匹配「已知 vision 模式」且 `vision≠true` 的 enabled TEXT alias 补标记，合并写入（保留其余 capabilities 字段），不动其他模型。
- **已知 vision 清单**：见脚本内 `VISION_NAME_PATTERNS`（OpenAI gpt-4o/4.1/5、Anthropic Claude 3+/4、Google Gemini、Qwen-VL、Zhipu GLM-4V、StepFun step-*v、Moonshot Kimi-VL、xAI Grok vision、Mistral Pixtral、Llama 3.2 Vision、ByteDance Doubao vision）。新增 vision 模型时在此追加。
- **幂等**：重复跑 `--apply`，已 `vision=true` 的不重复写、不误改非 vision 模型。
- **CLI 退出**：`prisma.$disconnect()` + `disconnectRedis()`（干净退出，铁律）。

> ⚠️ 严格门禁依赖标记准确：dry-run 待补清单务必人工 review 后再 --apply，避免把非 vision 模型误标。

## 3. 验证图片输入

```bash
# vision 模型 + 图片 → 应 200 并正确描述图片
curl -sS https://aigc.guangai.ai/v1/chat/completions \
  -H "Authorization: Bearer pk_xxx" -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":[
        {"type":"text","text":"这张图里有什么？"},
        {"type":"image_url","image_url":{"url":"https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/320px-Cat03.jpg"}}]}]}'

# 非 vision 模型 + 图片 → 应 400 model_not_vision_capable
# 超 10 张 / 超 5MB base64 / 非白名单协议 → 应 400 invalid_parameter
```

日志卫生：在 `/logs/<traceId>` 详情页确认 `promptSnapshot` 中图片为占位符（`[image:base64 …B]` / `[image:url <host>]`），无 base64 原始字节。

## 4. 回滚

- 纯代码批次，回滚 = `git revert` 整批 → 回到 string-only（图片输入再次被拒）。
- vision 标记：脚本只增不删；如需撤销某 alias 的 vision，在 `/admin/model-aliases` 编辑 capabilities 或反向脚本设 `vision:false`。
- 安全默认值（≤10 张 / ≤5MB / 协议白名单）集中在 `src/lib/api/vision-limits.ts`，需调整改常量即可。

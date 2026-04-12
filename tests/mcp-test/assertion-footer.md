---

## 最终步骤：结构化断言输出（必须执行）

在完成上述所有任务之后，请回顾你在本次审计中的所有发现（包括 BUG、不一致、DX 缺陷、安全风险等），将每个可验证的发现转化为一条结构化断言。

**输出格式要求：** 用一个 JSON 代码块包裹，key 为 `assertions`，值为数组。每条断言包含以下字段：

```json
{
  "assertions": [
    {
      "id": "DX-001",
      "severity": "critical | high | medium | low",
      "category": "数据一致性 | DX | 安全 | 计费 | 隔离 | 容错 | 性能",
      "tool": "被测试的 MCP tool 名称",
      "description": "用一句话描述这个问题",
      "assertion": "可直接转化为自动化测试的断言伪代码，例如：list_models(modality='image') 返回的每个模型都必须有顶层 supportedSizes 字段",
      "actual": "你实际观察到的行为（简要）",
      "expected": "你期望的正确行为（简要）"
    }
  ]
}
```

**规则：**
- 每条断言必须是可通过 MCP tool 调用来自动验证的（不包含主观评价）
- `id` 前缀使用本审计角色的缩写（如 DX-001、FIN-001、CHAOS-001）
- 如果本次审计未发现任何问题，返回空数组 `{"assertions": []}`
- 只输出一个 JSON 代码块，不要分散在多处

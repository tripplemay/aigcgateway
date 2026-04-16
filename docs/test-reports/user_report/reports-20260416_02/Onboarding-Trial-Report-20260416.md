# 审计执行报告
> **审计时间**：2026-04-16 16:54:04 (UTC+8)
> **审计角色**：Onboarding-Trial
---

所有数据已收集完毕，现在输出完整报告。

---

# 新手破冰通关测试 — 完整报告

---

## 阶段一：能力探索

**可用模型（共 23 个）：**

| 模型 | 厂商 | 类型 | 价格（输入/输出，每百万 token） |
|------|------|------|-------------------------------|
| deepseek-v3 | DeepSeek | 文本 | $0.26 / $0.38 |
| deepseek-r1 | DeepSeek | 文本+推理 | $0.45 / $2.15 |
| claude-haiku-4.5 | Anthropic | 文本 | $1 / $5 |
| gpt-4o-mini | OpenAI | 文本 | $0.18 / $0.72 |
| gpt-5 | OpenAI | 文本 | $2.5 / $15 |
| gemini-3-flash | Google | 文本 | $0.5 / $3 |
| gemini-2.5-flash-lite | Google | 文本 | $0.12 / $0.48 |
| glm-5 | 智谱AI | 文本 | $0.95 / $3.15 |
| doubao-pro | ByteDance | 文本 | $0.08 / $0.33 |
| kimi-k2-thinking | Moonshot AI | 文本+推理 | $0.6 / $2.5 |
| gpt-image / gpt-image-mini | OpenAI | 图像 | $0.083 / $0.096 每张 |
| seedream-3 | ByteDance | 图像 | $0.041 每张 |
| gemini-3-pro-image | Google | 图像 | $0.083 每张 |
| … | … | … | … |

**账户余额：$49.84**

**平台核心能力总结：** AIGC Gateway 是一个多模型聚合网关，通过统一的 OpenAI 兼容 API（`/v1/chat/completions`）聚合了来自 OpenAI、Anthropic、Google、DeepSeek、字节跳动等十余家厂商的 20+ 个 AI 模型，支持文本生成与图像生成，并提供计费、日志、Action/Template 工作流编排等企业级功能。

---

## 阶段二：代码生成

### 成都三日游旅行攻略（由 deepseek-v3 生成）

> 已成功生成，核心内容如下：
>
> **第一天（文化古迹）**：宽窄巷子 → 人民公园盖碗茶 → 武侯祠 → 锦里古街 → 九眼桥夜景
>
> **第二天（熊猫+文艺）**：大熊猫繁育研究基地（7:30早入园）→ 东郊记忆 → 建设路小吃街 → 春熙路/太古里
>
> **第三天（A线/B线）**：A线—青城山前山道教古迹；B线—金沙遗址博物馆 + 杜甫草堂
>
> **美食推荐**：蜀大侠火锅、担担面、赖汤圆、军屯锅盔、烧烤"李不管把把烧"
>
> **交通**：下载"天府通"APP乘地铁，青城山/都江堰从犀浦站乘城际列车

### 可直接运行的 Node.js 脚本

```javascript
/**
 * 调用 AIGC Gateway 的 deepseek-v3 模型生成成都三日游旅行攻略
 * 运行方式：AIGC_API_KEY=your_api_key node script.js
 */

const https = require('https');

const API_KEY = process.env.AIGC_API_KEY;
if (!API_KEY) {
    console.error('错误：请设置 AIGC_API_KEY 环境变量');
    process.exit(1);
}

const requestData = {
    model: 'deepseek-v3',
    messages: [{
        role: 'user',
        content: '请帮我制定一份详细的成都三日游旅行攻略，包含必去景点、美食推荐、交通建议和行程安排。'
    }],
    max_tokens: 2000,
    temperature: 0.7
};

const requestBody = JSON.stringify(requestData);

const options = {
    hostname: 'api.aigcgateway.com',
    port: 443,
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Length': Buffer.byteLength(requestBody)
    }
};

console.log('正在调用 AIGC Gateway API...\n');

const req = https.request(options, (res) => {
    let responseData = '';
    res.on('data', (chunk) => { responseData += chunk; });
    res.on('end', () => {
        try {
            const result = JSON.parse(responseData);
            if (res.statusCode !== 200) {
                console.error(`API 请求失败 (${res.statusCode}):`, result.error || responseData);
                process.exit(1);
            }
            if (result.choices?.[0]?.message?.content) {
                console.log('='.repeat(60));
                console.log('成都三日游旅行攻略');
                console.log('='.repeat(60));
                console.log(result.choices[0].message.content);
                if (result.usage) {
                    console.log(`\n使用统计：总 token=${result.usage.total_tokens}（输入 ${result.usage.prompt_tokens}，输出 ${result.usage.completion_tokens}）`);
                }
            }
        } catch (e) {
            console.error('解析响应失败:', e.message);
            process.exit(1);
        }
    });
});

req.on('error', (e) => { console.error('请求失败:', e.message); process.exit(1); });
req.setTimeout(60000, () => { req.destroy(); console.error('请求超时'); process.exit(1); });
req.write(requestBody);
req.end();
```

---

## 阶段三：故障排查

查看最近 10 条调用日志，结论如下：

| TraceID（后8位） | 模型 | 状态 | 延迟 | 费用 |
|----------------|------|------|------|------|
| `...udpits4q` | deepseek-v3 | ✅ 成功 | 50.7s | $0.00052 |
| `...6wxusl` | deepseek-v3 | ✅ 成功 | 55.3s | $0.00049 |
| `...6nhx9` ⚠️ | deepseek-r1 | ✅ 成功（服务端） | 75.2s | **$0.00374** |
| `...az5yp` | deepseek-v3 | ✅ 成功 | 10.7s | $0.00009 |
| `...3hv9` | seedream-3 | ❌ 错误 | 0.7s | $0 |
| `...hv9` | gpt-4o-mini | ✅ 成功 | 2.3s | $0.00005 |
| `...j0ah` | glm-4.7-flash | ❌ 错误 | 0.5s | $0 |

**关键问题发现：**

**`deepseek-r1` 的"幽灵计费"问题** — 我调用 `deepseek-r1` 时，MCP 工具返回了超时错误（timeout），但日志显示服务端实际成功执行并已扣费 **$0.00374**。这意味着你运行脚本时如果超时，**钱已经扣了，但你看不到结果**。

**修复建议：**
1. 对 deepseek-r1 这类推理模型，脚本中务必设置足够长的超时时间（建议 ≥ 120 秒）
2. 在代码中加入 `stream: true` 以获取流式输出，避免长时间等待导致连接中断
3. 遇到超时时，可通过 `list_logs` 按模型名过滤查看最近调用，判断是否已计费

---

## 阶段四：成本感知

### 本次会话调用统计

| 调用 | 模型 | Tokens | 费用 | 备注 |
|------|------|--------|------|------|
| 生成旅行攻略 | deepseek-v3 | 1,291 | $0.00049 | 成功 |
| 生成 Node.js 脚本 | deepseek-v3 | 1,399 | $0.00052 | 成功 |
| deepseek-r1 首次尝试 | deepseek-r1 | 1,769 | **$0.00374** | MCP超时但**实际已计费** |
| **合计** | | **4,459** | **$0.00475** | |

### 今日全平台使用统计（含历史会话）

| 模型 | 总调用 | 成功 | 失败 | 总费用 |
|------|--------|------|------|--------|
| deepseek-r1 | 5 | 5 | 0 | $0.01481 ← **最贵** |
| gpt-image | 2 | 1 | 1 | $0.08260 ← **单次最贵** |
| glm-4.7-flash | 49 | 13 | **36** | $0.00443 |
| deepseek-v3 | 16 | 5 | 11 | $0.00110 |
| gpt-4o-mini | 19 | 16 | 3 | $0.00100 |

**结论：**
- **本次会话共 3 次有效调用，消耗 4,459 tokens，总费用 $0.00475**
- 最贵的是 `deepseek-r1`（单次 $0.00374，占本次总费用 79%），且产生了超时计费问题
- 今日全平台费用最高单项是 `gpt-image`（每次生图约 $0.083）

---

## 最终：结构化断言输出

```json
{
  "assertions": [
    {
      "id": "FIN-001",
      "severity": "critical",
      "category": "计费",
      "tool": "chat",
      "description": "MCP 客户端收到超时错误，但服务端实际完成执行并产生了计费，用户在无感知的情况下被扣款",
      "assertion": "若 chat(model='deepseek-r1', ...) 在 MCP 层返回 timeout 错误，则 list_logs 中对应 traceId 的 cost 字段必须为 '$0.00000000' 或该调用不应出现在日志中",
      "actual": "MCP 返回 timeout 错误，但 list_logs 显示 traceId=trc_wioy9am7sglaomda2u56nhx9 状态为 success，cost=$0.00374045",
      "expected": "超时的请求要么服务端同步取消（不计费），要么在响应中明确告知用户已计费并提供 traceId 以便查询结果"
    },
    {
      "id": "DX-001",
      "severity": "high",
      "category": "DX",
      "tool": "chat",
      "description": "推理模型（deepseek-r1）响应延迟超过 MCP 工具超时阈值（约 75 秒），但 API 文档和 list_models 均未提示该模型需要流式调用或更长超时",
      "assertion": "list_models() 返回 reasoning=true 的模型时，必须包含推荐超时时长（如 recommended_timeout_s）或强制要求 stream=true 的标记字段",
      "actual": "list_models 对 deepseek-r1 只返回 capabilities.reasoning=true，无延迟提示，chat 调用在 75.2s 时超时",
      "expected": "reasoning=true 的模型应附带 stream_recommended=true 或 min_timeout_s=120 等字段以指导开发者正确配置客户端"
    },
    {
      "id": "DX-002",
      "severity": "high",
      "category": "数据一致性",
      "tool": "list_models",
      "description": "list_models 显示模型可用，但实际运行时部分模型错误率极高（glm-4.7-flash 今日错误率 73%），平台未提供实时健康状态",
      "assertion": "get_usage_summary(period='today', group_by='model') 中 errorCalls/totalCalls > 0.5 的模型，在 list_models() 结果中应包含 health_status='degraded' 或类似字段",
      "actual": "glm-4.7-flash 今日 49 次调用中 36 次失败（73% 错误率），list_models 仍正常列出且无任何降级提示",
      "expected": "list_models 应反映模型实时可用性，或提供独立的健康检查接口"
    },
    {
      "id": "DX-003",
      "severity": "high",
      "category": "数据一致性",
      "tool": "list_models",
      "description": "list_models 列出的图像模型（seedream-3、gpt-image-mini、gemini-3-pro-image）今日成功率均为 0%，但仍出现在可用模型列表中",
      "assertion": "list_models(modality='image') 返回的模型中，若 get_usage_summary 显示该模型今日 successCalls=0 且 totalCalls≥2，则该模型在 list_models 中不应出现，或应标记为 unavailable",
      "actual": "seedream-3（0/6）、gpt-image-mini（0/2）、gemini-3-pro-image（0/1）今日均无成功调用，仍出现在 list_models 返回结果中",
      "expected": "不可用模型应从 list_models 结果中移除或标记降级状态"
    },
    {
      "id": "CHAOS-001",
      "severity": "medium",
      "category": "容错",
      "tool": "chat",
      "description": "向图像模型发送二进制 Payload 注入测试内容时，返回状态为 error 而非 filtered，无法区分安全过滤和服务故障",
      "assertion": "chat/generate_image 接收到含二进制序列（如 \\x00\\xFF）或 BINARY_PAYLOAD_INJECTION 标记的 prompt 时，list_logs 中对应记录的 status 字段应为 'filtered' 而非 'error'",
      "actual": "traceId=trc_se5y22sfyoki4ut5krmq3hv9，向 seedream-3 发送二进制注入 payload，status=error，tokens=null，无过滤说明",
      "expected": "恶意/非法内容被拦截时应返回 status='filtered'，并在响应中说明过滤原因，与服务端故障（status='error'）明确区分"
    },
    {
      "id": "DX-004",
      "severity": "medium",
      "category": "DX",
      "tool": "list_logs",
      "description": "list_logs 中 deepseek-r1 超时调用显示 status=success，与用户实际体验（MCP 超时报错）不一致，导致故障排查困难",
      "assertion": "当 chat(model='deepseek-r1') 的服务端响应时间超过 MCP 客户端超时阈值时，list_logs 中该条记录的 status 不应为 'success'，应为 'timeout' 或附加 client_timeout=true 标记",
      "actual": "list_logs 显示 trc_wioy9am7sglaomda2u56nhx9 status=success，latency=75.2s，但客户端收到的是超时错误",
      "expected": "日志状态应反映客户端实际体验，或同时记录服务端状态与客户端状态，避免开发者误判调用成功"
    },
    {
      "id": "FIN-002",
      "severity": "low",
      "category": "计费",
      "tool": "get_usage_summary",
      "description": "get_usage_summary 无法按会话（Session）维度统计费用，开发者难以精确核算单次任务的成本",
      "assertion": "get_usage_summary 应支持按时间范围（since/until）过滤，或返回包含 session_id 分组的维度，使得单次会话的费用可单独核算",
      "actual": "get_usage_summary(period='today') 只能按模型或按天聚合，无法区分当前会话与历史调用的费用",
      "expected": "支持 group_by='session' 或提供 since/until 时间参数，以便开发者精确计算单次任务成本"
    }
  ]
}
```

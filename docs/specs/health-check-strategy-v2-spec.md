# 健康检查调度策略 V2 Spec

## 背景

当前调度策略按"调用频率"分 4 级（活跃 10min / 备用 30min / 冷门 2h / DISABLED 30min），不区分通道是否被别名使用。存在三个问题：

1. 新通道加入别名后没有立即检查，管理员无法得到即时反馈
2. 被纳入高优先级别名但暂无调用的通道被归为"冷门"，检查间隔过长
3. 未纳入别名的通道仍做全三级检查（文本通道发真实 chat 请求），浪费成本

## 目标

按**业务价值**分级，而非按调用频率分级。核心原则：被别名使用的通道必须高频验证，未使用的通道零成本探活即可。

## Schema 变更

### HealthCheckLevel 枚举扩展

```prisma
enum HealthCheckLevel {
  API_REACHABILITY   // 新增：仅 /models 端点探测（零成本）
  CONNECTIVITY       // 原 L1：发真实 chat 请求验证（有成本）
  FORMAT             // 原 L2：响应格式一致性
  QUALITY            // 原 L3：响应内容质量
}
```

#### API_REACHABILITY 检查逻辑

- 请求：`GET {baseUrl}/models`，携带 `Authorization: Bearer {apiKey}`
- PASS 条件：HTTP 200 + 响应非空 + 响应包含 `data` 数组
- FAIL 条件：超时（15s）、非 200、响应格式异常
- 成本：零（元数据接口，无计费）

#### 与 CONNECTIVITY 的区别

| 维度 | API_REACHABILITY | CONNECTIVITY |
|---|---|---|
| 请求方式 | GET /models | POST /chat/completions |
| 成本 | 零 | ~$0.00001-0.0001/次 |
| 验证深度 | API Key 有效 + 网络可达 | 模型可正常推理 |
| 适用场景 | 未纳入别名的通道、图片通道 | 已纳入已启用别名的文本通道 |

## 调度策略 V2

### 分级规则

判定依据：通道是否被纳入**已启用的别名**（`ModelAlias.enabled = true`）。

```
查询：Channel → Model → AliasModelLink → ModelAlias(enabled=true)
  存在至少一条链路 → "已纳入已启用别名"
  不存在 → "未纳入别名"
```

### 检查频率

| 通道类型 | 检查方式 | 频率 | 环境变量 |
|---|---|---|---|
| 已纳入已启用别名 · 文本 · ACTIVE/DEGRADED | 全三级（CONNECTIVITY → FORMAT → QUALITY） | 10 分钟 | `HEALTH_CHECK_ACTIVE_INTERVAL_MS` |
| 已纳入已启用别名 · 文本 · DISABLED | 全三级（恢复检测） | 30 分钟 | `HEALTH_CHECK_DISABLED_INTERVAL_MS` |
| 已纳入已启用别名 · 图片 · 任意状态 | API_REACHABILITY | 10 分钟 | `HEALTH_CHECK_ACTIVE_INTERVAL_MS` |
| 未纳入别名 / 别名未启用 · 任意模态 | API_REACHABILITY | 10 分钟 | `HEALTH_CHECK_ACTIVE_INTERVAL_MS` |

### 即时触发

当通道被纳入已启用别名时（AliasModelLink 创建 + 对应 ModelAlias.enabled = true），**立即触发一次检查**：

- 文本通道：全三级检查
- 图片通道：API_REACHABILITY

实现方式：在 AliasModelLink 创建/别名启用的 API 端点中，调用 `checkChannel(channelId)`。

### 自动降级与恢复（不变）

保持现有逻辑：
- 单次失败 → 重试 → 仍失败 → DEGRADED
- 连续 3 批次失败 → DISABLED
- DISABLED 通道检查全部通过 → ACTIVE

API_REACHABILITY 检查的降级/恢复逻辑与 CONNECTIVITY 相同。

## 图片通道说明

图片通道无论是否纳入别名，始终只做 API_REACHABILITY。原因：真实图片生成成本 $0.04-0.19/次，健康检查不可承受。API_REACHABILITY 能验证 API Key 和网络可达性，但无法验证图片生成功能本身是否正常。这是已知的设计妥协。

## 移除的分级

以下旧分级不再使用：
- ~~备用通道（priority > 1 且 ACTIVE）→ 30min~~ — 统一为 10 分钟
- ~~冷门通道（24h 无调用）→ 2h~~ — 统一为 10 分钟
- ~~按 1h/24h 调用记录判定活跃度~~ — 改为按别名关联判定

## 受影响的文件

| 文件 | 改动 |
|---|---|
| `prisma/schema.prisma` | HealthCheckLevel 枚举新增 API_REACHABILITY |
| `src/lib/health/checker.ts` | 新增 `runApiReachabilityCheck()` 函数 |
| `src/lib/health/scheduler.ts` | 重写调度逻辑：查询别名关联 → 分级 → 选择检查方式 |
| `src/app/api/admin/model-aliases/` | 创建 AliasModelLink / 启用别名时触发即时检查 |
| `src/app/(console)/admin/health/page.tsx` | 展示 API_REACHABILITY 级别的结果 |

## 向后兼容

- 现有 HealthCheck 记录中的 CONNECTIVITY/FORMAT/QUALITY 不受影响
- 新增的 API_REACHABILITY 记录与现有记录共存于同一张表
- 图片通道的历史 CONNECTIVITY 记录保留，新检查改为 API_REACHABILITY

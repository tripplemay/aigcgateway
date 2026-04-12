# 测试生命周期：探索审计 → 确定性回归

## 概述

项目采用两层测试体系：**探索审计**发现新问题，**确定性脚本**防止回归。两者形成闭环。

```
探索审计（发现问题）
    ↓ 结构化断言 JSON
问题分流（规划批次）
    ↓ 修复代码
断言沉淀（写入确定性脚本）
    ↓
回归测试（每次部署前跑）
    ↓ 下一轮审计发现新问题 …
```

## 第一层：探索审计（MCP Audit）

**用途：** 以零知识视角探索 MCP 接口，发现未知问题
**位置：** `tests/mcp-test/`
**频率：** 每个大批次完成后、大版本发布前

### 运行

```bash
cd tests/mcp-test
./run_all_audits.sh
```

### 产出

```
tests/mcp-test/reports-YYYYMMDD/
├── FinOps-Audit-Report-*.md        # 8 份审计报告
├── Chaos-Audit-Report-*.md
├── ...
└── all-assertions-YYYYMMDD.json    # 汇总断言（机器可读）
```

### 断言 JSON 格式

```json
{
  "id": "FIN-001",
  "severity": "critical | high | medium | low",
  "category": "计费 | 安全 | DX | ...",
  "tool": "list_models",
  "description": "问题描述",
  "assertion": "可转化为自动化测试的断言伪代码",
  "actual": "实际行为",
  "expected": "期望行为"
}
```

### 新增审计角色

在 `tests/mcp-test/` 下新建 `XXX-Audit-Prompt.md`，加入 `run_all_audits.sh` 的 PROMPTS 数组即可。断言 footer 会自动拼接。

## 第二层：确定性回归测试

**用途：** 验证已知场景不回归
**位置：** `scripts/`
**频率：** 每次部署前

### 脚本清单

| 脚本 | 覆盖范围 | 运行命令 |
|------|---------|---------|
| `e2e-test.ts` | REST API happy path（注册→充值→调用→日志） | `BASE_URL=... npx tsx scripts/e2e-test.ts` |
| `e2e-errors.ts` | REST API 错误场景 | 同上 |
| `test-mcp.ts` | MCP 协议全链路 | `BASE_URL=... API_KEY=... npx tsx scripts/test-mcp.ts` |
| `test-mcp-errors.ts` | MCP 错误场景 | 同上 |

## 闭环流程：断言沉淀

每次审计完成后，按以下流程将发现转化为持久测试：

### Step 1：分流

读取 `all-assertions-YYYYMMDD.json`，按 severity 分类：

- **critical/high** → 立即修复，修复后必须沉淀为确定性测试
- **medium** → 规划到下一批次，修复后建议沉淀
- **low** → 加入 backlog，视情况沉淀

### Step 2：修复

按正常批次流程（Planner → Generator → Evaluator）修复。

### Step 3：沉淀

修复完成后，将对应断言转化为确定性测试用例：

- **计费 / 数据一致性类** → 写入 `test-mcp.ts`（MCP 协议层可验证）
- **API 行为类** → 写入 `e2e-test.ts` 或 `e2e-errors.ts`
- **安全 / 错误信息类** → 写入 `e2e-errors.ts` 或 `test-mcp-errors.ts`

示例：审计发现 `FIN-001`（扣费比展示价高 20%），修复后在 `test-mcp.ts` 中增加：

```typescript
await step("Billing matches list_models price", async () => {
  // 1. 从 list_models 获取模型价格
  // 2. 发起 chat 调用
  // 3. 从 get_log_detail 获取实际扣费
  // 4. 断言：实际扣费 = 价格 × tokens / 1M，误差 < 0.01%
});
```

### Step 4：验证闭环

下一轮审计时，已沉淀的断言应不再被报出（说明修复有效且未回归）。如果同一问题再次出现，说明确定性测试用例覆盖不足，需补强。

## Evaluator 集成

Evaluator（Codex）在验收时可按以下顺序执行：

1. **先跑确定性脚本** — 快速验证已知场景不回归（< 2 分钟）
2. **再跑探索审计**（可选）— 验证新功能是否引入新问题（~ 30 分钟）
3. **针对性验证** — 对当前批次的 acceptance criteria 做专项测试

这样 Evaluator 不需要每次从零设计测试，已有的两层测试提供了基线覆盖。

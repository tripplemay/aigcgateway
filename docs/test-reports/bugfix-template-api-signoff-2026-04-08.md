# bugfix-template-api Signoff 2026-04-08

> 状态：**完成验证**（progress.json status=reverifying → done）
> 触发：F-BT-03 复验通过，模板 REST / MCP / run_template 路径已恢复

---

## 变更背景
Template 创建 API 在 balance user-level backend 合入后缺少 step 验证与错误处理，导致 500。Generator 在 F-BT-01/02 内补齐 REST + MCP 校验/异常捕获，Codex 负责 F-BT-03 端到端验收。

---

## 变更功能清单

### F-BT-01：Template 创建 API 500 修复
**文件：** `src/app/api/projects/[id]/templates/route.ts`

**改动：** 增加 steps[].actionId/order 验证、重复 order 检查、Prisma try/catch。

**验收：** `bugfix-template-api-e2e-2026-04-08.ts` 创建多步骤模板成功；缺失/重复 order 返回 400。

### F-BT-02：MCP create_template Tool 验证
**文件：** `src/lib/mcp/tools/create-template.ts`

**改动：** MCP 工具补 try/catch、invalid action ID 检查，返回 `[internal_error]` 格式。

**验收：** `bugfix-template-api-e2e-2026-04-08.ts` 验证 isError；手工 `tools/call:create_template` 成功返回 template_id。

### F-BT-03：E2E 验证（executor:codex）
**文件：** `scripts/test/bugfix-template-api-e2e-2026-04-08.ts`（更新 action 引用）；`scripts/test/p4-action-template-e2e-2026-04-05.ts`（补充 user-level balance / model enable / MCP 工具断言）。

**改动：** 仅测试资产。Codex 运行：
- REST：创建/列表/删除 Template（含 steps 级联校验）
- MCP：create_template + run_template + run_action
- API Key：`/v1/templates/run` SSE 输出 steps[]、call_log trace。

**验收：** `docs/test-reports/bugfix-template-api-e2e-2026-04-08.json`、`docs/test-reports/p4-action-template-e2e-2026-04-08.json`、`docs/test-reports/bugfix-template-api-reverification-2026-04-08.md`

---

## 未变更范围
| 事项 | 说明 |
| --- | --- |
| Template UI | 本批仅验证 API/MCP，不涉及前端渲染 |
| SDK/CLI | 无接口签名变动，SDK 文档保持原样 |

---

## 预期影响
| 项目 | 改动前 | 改动后 |
| --- | --- | --- |
| REST /templates | POST 未校验 actionId/order，400/500 混乱 | 严格 400 + JSON 错误说明 |
| MCP create_template | 未捕获错误、可能 500 | 成功/失败均返回结构化结果 |
| run_template | 因登录阻塞无法覆盖 | 登录恢复 + mock provider 保证 steps[] 明细 |

---

## 类型检查
```
执行 `bash scripts/test/codex-setup.sh` → `npm run build` + lint/typecheck 均通过（见 setup log）。
```

---

## Harness 说明
本批次已完成 reverifying，progress.json 将置为 `done`，并填入 `docs.signoff`。

---

## Framework Learnings
- **新规律：** 当余额由 Project → User 升级时，历史测试脚本需同步改写（如直接更新 project.balance 会失效）。建议在 `framework/harness/evaluator.md` 添加提醒：复用旧脚本前先核对余额归属。

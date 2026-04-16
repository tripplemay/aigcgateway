# 审计执行报告
> **审计时间**：2026-04-16 16:54:04 (UTC+8)
> **审计角色**：Tenancy-Audit
---

数据收集完毕，现在综合分析所有发现。

**关键观察**：
- `get_template_detail` 中 `activeVersionNumber` 与 `list_actions` 返回的实际活跃版本**不一致**（模板显示 v1，但 Action 实际已在 v5）
- 所有错误消息固定为 "not found **in this project**" 格式，正确隔离了项目边界
- SQL 注入、路径遍历、跨类型 ID 混用均被正确拒绝

---

## 审计报告：MCP 多租户越权与数据隔离测试

### 执行摘要

共执行 **12 次探测调用**，覆盖 ID 变异、伪造 ID、跨类型混用、注入攻击、越界删除五大攻击面。**未发现实际 IDOR 越权漏洞**，系统隔离机制总体健壮。发现 1 个数据一致性缺陷、1 个内部 ID 信息暴露问题。

---

```json
{
  "assertions": [
    {
      "id": "IDOR-001",
      "severity": "low",
      "category": "隔离",
      "tool": "get_log_detail",
      "description": "Trace ID 末尾字符变异后，系统正确返回项目范围内的 404 错误，未发生跨租户数据泄漏",
      "assertion": "对任意变异的 trace_id（如将末尾替换为随机字符），get_log_detail 必须返回 'not found in this project' 且不返回任何日志内容",
      "actual": "trc_go6a1nmqsianex4ouxxyj0XX 和 trc_x9kbp05aos2njxrufyjvc0000 均返回 'not found in this project' 错误，无数据泄漏",
      "expected": "返回明确的项目范围内 404，不暴露其他项目数据"
    },
    {
      "id": "IDOR-002",
      "severity": "medium",
      "category": "数据一致性",
      "tool": "get_template_detail",
      "description": "Template 详情中 step 显示的 activeVersionNumber 与 list_actions 返回的 Action 实际活跃版本号不一致，存在数据陈旧问题",
      "assertion": "get_template_detail 中每个 step 的 activeVersionNumber 必须等于对应 Action 通过 list_actions 或 get_action_detail 返回的 activeVersion.versionNumber",
      "actual": "get_template_detail 中 action cmo0gu9jl0001bn5wz728o3g5 的 activeVersionNumber=1，但 list_actions 显示该 Action 当前活跃版本为 versionNumber=5",
      "expected": "两个端点返回的同一 Action 的活跃版本号应保持一致"
    },
    {
      "id": "IDOR-003",
      "severity": "low",
      "category": "安全",
      "tool": "get_template_detail",
      "description": "Template 详情响应中暴露了各 step 的内部 activeVersionId（CUID 格式），可被用于进一步枚举版本资源",
      "assertion": "get_template_detail 的响应中，step 对象不应包含 activeVersionId 等内部数据库主键字段",
      "actual": "响应中包含 activeVersionId: 'cmo0gu9jt0003bn5w4gs94ssz' 等内部 CUID",
      "expected": "响应中仅暴露 activeVersionNumber 等业务语义字段，不暴露内部数据库 ID"
    },
    {
      "id": "IDOR-004",
      "severity": "low",
      "category": "安全",
      "tool": "get_log_detail",
      "description": "在 trace_id 中注入 SQL 语句（OR '1'='1）被正确拒绝，未触发注入攻击",
      "assertion": "对包含 SQL 注入特殊字符的 trace_id（如 \"xxx' OR '1'='1\"），get_log_detail 必须返回 'not found' 错误，不返回任何数据",
      "actual": "返回 'not found in this project' 错误，SQL 注入字符被当作字面量处理",
      "expected": "返回 'not found' 错误或输入校验错误，不执行注入逻辑"
    },
    {
      "id": "IDOR-005",
      "severity": "low",
      "category": "安全",
      "tool": "get_action_detail",
      "description": "在 action_id 中注入路径遍历字符（../../../etc/passwd）被正确拒绝，无文件系统泄漏",
      "assertion": "对包含路径遍历字符的 action_id（如 '../../../etc/passwd'），get_action_detail 必须返回 'not found' 错误，不返回任何系统文件内容",
      "actual": "返回 'Action \"../../../etc/passwd\" not found in this project'，无文件内容泄漏",
      "expected": "返回 'not found' 错误或输入校验错误"
    },
    {
      "id": "IDOR-006",
      "severity": "low",
      "category": "隔离",
      "tool": "get_template_detail / get_action_detail",
      "description": "跨资源类型 ID 混用（用 action_id 查询 template，反之亦然）被正确拒绝，未发生资源混淆",
      "assertion": "用有效的 action_id 调用 get_template_detail，以及用有效的 template_id 调用 get_action_detail，均必须返回 'not found in this project' 错误",
      "actual": "两种混用场景均返回对应类型的 'not found in this project' 错误",
      "expected": "返回明确的资源类型范围内 404，不发生跨类型资源混淆"
    },
    {
      "id": "IDOR-007",
      "severity": "low",
      "category": "隔离",
      "tool": "delete_action / delete_template",
      "description": "对不存在（或猜测属于其他用户）的资源 ID 调用删除操作，系统统一返回 'not found in this project'，未区分 404 与 403，不泄漏他人资源存在性",
      "assertion": "delete_action 和 delete_template 传入随机伪造 ID 时，必须返回 'not found in this project' 错误，而非返回 403 或确认资源存在",
      "actual": "两个删除调用均返回 'not found in this project' 错误，未执行任何删除操作",
      "expected": "返回 'not found' 错误，不暴露其他项目资源的存在性"
    },
    {
      "id": "IDOR-008",
      "severity": "low",
      "category": "隔离",
      "tool": "get_log_detail / get_template_detail / get_action_detail",
      "description": "所有只读查询接口对非本项目资源的错误消息格式统一为 'not found in this project'，未通过差异化错误消息泄漏他人资源存在性",
      "assertion": "对任意不属于当前项目的 ID 发起查询，所有接口返回的错误消息必须包含 'in this project' 或等价的项目范围限定语，不返回 'unauthorized' 或 'forbidden'",
      "actual": "所有测试均返回 '[Resource] \"xxx\" not found in this project' 格式，行为一致",
      "expected": "统一的项目范围内 404 响应，不通过错误差异化泄漏跨项目资源存在性"
    }
  ]
}
```

---

### 核心结论

| 攻击面 | 结果 | 风险等级 |
|---|---|---|
| Trace ID 末尾变异撞库 | 隔离正常，无泄漏 | 无风险 |
| 明显伪造 ID（test/123/admin） | 正确拒绝 | 无风险 |
| SQL 注入字符注入 ID | 正确拒绝 | 无风险 |
| 路径遍历字符注入 ID | 正确拒绝 | 无风险 |
| 跨类型 ID 混用 | 正确拒绝 | 无风险 |
| 越界删除非本项目资源 | 正确拒绝 | 无风险 |
| **Template activeVersionNumber 不一致** | **数据陈旧** | **Medium** |
| **内部 activeVersionId 字段暴露** | **信息泄漏** | **Low** |

最高优先级修复建议：`get_template_detail` 应实时 JOIN Action 的当前活跃版本，而非缓存写入时的快照版本号，以避免运维人员误判当前实际运行的 Action 版本。

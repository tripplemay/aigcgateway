# [批次名称] Signoff YYYY-MM-DD

> 状态：**待 Evaluator 验收**（progress.json status=reviewing）
> 触发：[触发原因一句话]

---

## 变更背景

[描述本批次改动的背景和动机]

---

## 变更功能清单

### F-XXX-01：[功能标题]

**文件：**
- `path/to/file.ts`（新增 / 修改）

**改动：**
[描述具体改动内容]

**验收标准：**
- [可验证的标准1]
- [可验证的标准2]

---

<!-- 重复上面的块，每个功能一块 -->

## 未变更范围

| 事项 | 说明 |
|---|---|
| [未改动模块] | [为什么不改] |

---

## 预期影响

| 项目 | 改动前 | 改动后 |
|---|---|---|
| [指标] | [数值] | [数值] |

---

## 类型检查

```
[tsc / eslint 执行结果]
```

---

## Harness 说明

本批改动经 Harness 状态机完整流程（planning → building → verifying → done）交付。
`progress.json` 已设为 `status: "done"`，signoff 路径已填入 `docs.signoff`。

---

## Framework Learnings（可选）

> 本节由 Cowork 在 status → done 时填写，记录本批次中值得沉淀进框架的新经验。
> 用户确认后同步更新 `framework/` 对应文件，并在 `framework/CHANGELOG.md` 追加一条记录。

<!-- 示例条目（无新经验时可留空或删除本节）：

### 新规律
- [描述：发现了什么新的规律或最佳实践]
  - 来源：[哪个 feature / 哪次故障]
  - 建议写入：`framework/README.md` §经验教训 / `framework/harness/evaluator.md`

### 新坑
- [描述：踩到了什么坑，下次怎么避免]
  - 来源：[哪个 feature / 哪次故障]
  - 建议写入：`framework/README.md` §经验教训

### 模板修订
- [描述：某个模板文件需要补充或修改]
  - 建议修改：`framework/templates/xxx.md` 第 N 行

-->


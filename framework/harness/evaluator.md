# Evaluator 角色指令

## 你的任务
三件事，按顺序：
1. **设计并编写测试**（如 `docs/test-cases/` 文档、单元测试、E2E/压测脚本）——测试域完整归 Codex
2. **执行** features.json 中 `executor:codex` 的功能（运行测试、产出报告、得出结论）
3. **验收** 所有功能是否符合 acceptance 标准（包括 executor:generator 和 executor:codex）

**文档约定：**
- 测试用例文档写入 `docs/test-cases/`（Codex 自行决定是否需要，复杂场景建议写）
- 单元测试、E2E 脚本、压测脚本由 Codex 编写（Generator 不负责任何测试代码）
- signoff 报告写入 `docs/test-reports/`（硬性要求，done 前必须存在）

## 重要原则
你不是 Generator，你是独立的质检员，同时也是测试域的所有者。
- **测试设计**：你负责决定测什么、怎么测，Generator 不介入
- **独立视角**：即便代码看起来合理，也要实际验证，不要凭印象打分
- **执行者身份**：对于 `executor:codex` 的功能，你主动执行并产出结论，不只是验收

## 执行步骤

### 1. 确认当前阶段
读取 progress.json：
- `verifying`：首轮（Generator 完成实现，或 Codex-only 批次直接进入）
- `reverifying`：复验（Generator 已根据上轮 evaluator_feedback 修复，fix_rounds 已更新）

同时读取 `.auto-memory/MEMORY.md` 及 `project-aigcgateway.md`，了解项目当前状态、已知遗留问题和环境信息（Staging 地址等）。`.auto-memory/` 是唯一记忆源，验收前必须读取，避免基于过期信息打分。

### 2. 编写测试（视批次复杂度决定）
读取 `docs/specs/` 下的规格文档，判断是否需要在执行前先准备测试资产：

- **单元测试**：针对 Generator 实现的核心逻辑，编写并运行（发现问题直接记入 evaluator_feedback）
- **E2E / 集成测试脚本**：如 `docs/test-cases/` 下无现成用例，按规格文档自行编写
- **压测脚本**：如批次包含性能验收，编写压测脚本（放在 `scripts/` 下）

简单批次（增删改查类）可跳过此步骤，直接进入步骤 3。
复杂批次（新引擎、新计费逻辑、外部集成）建议写测试用例文档后再执行。

### 3. 执行 executor:codex 功能（如有）
打开 features.json，找出所有 `executor:codex` 且 status 为 `pending` 的功能：

- 读取 `generator_handoff`（如有），了解 Generator 提供的工具 / 脚本及注意事项
- 按照每条功能的 acceptance 标准，**主动执行**任务（运行脚本、做 review、产出报告）
- 执行产出物（报告文件、review 结论等）写入约定路径
- 执行完成后将该功能 status 改为 `"completed"`，更新 progress.json 中的 `completed_features`

**常见执行类型：**
- 压力测试：运行 `scripts/stress-test.ts`，将结果报告写入 `docs/test-reports/`
- Code review：阅读指定代码范围，将 review 结论写入约定文档
- 安全审计：扫描指定接口 / 模块，输出漏洞清单
- E2E 执行：运行 `scripts/e2e-test.ts`，记录结果

### 3. 启动项目（适用于需要运行时验证的批次）
对于涉及代码实现的批次，运行项目，确认它能正常启动。如果无法启动，直接记为严重问题。
对于 Codex-only 批次（全部 executor:codex），可跳过此步骤。

### 4. 逐条验证功能
打开 features.json，对每条 status = "completed" 的功能（包括 executor:generator 和 executor:codex）：
- 按照 acceptance 标准逐条检查
- 尝试正常使用路径
- 尝试边缘情况（空输入、超长输入、快速点击等）
- 参考 `docs/test-cases/` 下的测试用例（如存在）
- 注意区分 [L1] 和 [L2] 标注的验收项：
  - [L1]：本地环境可验证
  - [L2]：依赖外部服务，仅在 Staging 环境验证，本地出现 FAIL 不代表产品 Bug

### 4. 评分标准（对每个功能）
- PASS：完全符合 acceptance 标准
- PARTIAL：主要功能可用，但有小问题（说明具体是什么）
- FAIL：无法使用或严重不符（说明具体原因和复现步骤）

**UI 重构批次的额外验收要求（当 acceptance 中包含"设计稿还原"时，必须执行）：**

对每个涉及设计稿还原的页面，Evaluator 必须：

1. **Read 原型文件**：`Read design-draft/xxx/index.html`，通读完整 HTML 源码
2. **Read 实现文件**：`Read src/app/(console)/xxx/page.tsx`
3. **逐块核对**：对照原型 HTML 的 DOM 结构，检查实现中是否覆盖了所有区块、表格列、表单字段、交互入口（按钮/开关/下拉）
4. **识别功能缺失**：原型中有但实现中没有的功能（如编辑态、操作列）判 FAIL
5. **识别结构简化**：原型中有但实现中简化的区块（如信息面板字段缺失）判 PARTIAL

**不读原型直接根据 acceptance 文字判分 = 不合格的验收。** 原型 HTML 是 source of truth，acceptance 只是摘要。

### 5. 生成反馈报告
将结果写入 progress.json 的 evaluator_feedback：
```json
{
  "evaluator_feedback": {
    "summary": "整体评价一句话",
    "pass_count": 15,
    "partial_count": 3,
    "fail_count": 2,
    "issues": [
      {
        "feature_id": "F005",
        "result": "FAIL",
        "description": "点击保存按钮后数据丢失，刷新页面后内容消失",
        "steps_to_reproduce": "1.输入内容 2.点保存 3.刷新页面"
      }
    ]
  }
}
```

### 6. 写 signoff 报告（reverifying → done 时）
当所有功能全部 PASS，在置 `done` 之前：
- 在 `docs/test-reports/` 下创建签收报告（文件名：`[批次名称]-signoff-YYYY-MM-DD.md`）
- 使用 `framework/templates/signoff-report.md` 模板
- 将文件路径填入 progress.json 的 `docs.signoff`

**signoff 为空，不得置 done。**

### 7. 更新 progress.json

**有问题时（FAIL 或 PARTIAL 存在）：**
```json
{
  "status": "fixing",
  "evaluator_feedback": { ... }
}
```

**全部 PASS 且 signoff 已写入时：**
```json
{
  "status": "done",
  "docs": {
    "signoff": "test-reports/[批次名称]-signoff-YYYY-MM-DD.md"
  }
}
```

### 8. 更新 features.json
将 FAIL 和 PARTIAL 的功能 status 改回 "pending"，等待 Generator 修复。

### 9. 框架提案（可选）
验收过程中如果遇到以下情况，在 `framework/proposed-learnings.md` 末尾追加一条提案：
- acceptance 标准太模糊导致无法客观判定 PASS / FAIL
- 某类 Bug 是系统性的（说明 Generator 指令或模板需要补充）
- 验收步骤中发现某个通用的验证方法值得固化
- 某个 PARTIAL 反复出现，说明验收标准写法需要改进

**不得直接修改 `framework/` 其他文件**，只能追加到 `framework/proposed-learnings.md`。格式：

```markdown
## [YYYY-MM-DD] Evaluator — 来源：F-XXX

**类型：** 新规律 / 新坑 / 模板修订 / 铁律补充

**内容：** [一句话描述，足够让用户判断是否值得沉淀]

**建议写入：** `framework/README.md` §经验教训 / `framework/harness/generator.md` / 其他

**状态：** 待确认
```

## 完成标准
- 有问题：status 置为 `fixing`，FAIL/PARTIAL 功能改回 pending
- 全部 PASS：signoff 报告已写入 `docs/test-reports/`，docs.signoff 已填写，status 置为 `done`

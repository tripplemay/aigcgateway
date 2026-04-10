Summary
- Scope: `F-A1-04` L1 本地验收，覆盖 alias modality/contextWindow/maxTokens 继承、brand 锚定、历史数据清理脚本，以及必要的生产只读核对。
- Documents: `features.json`, [alias-classifier.ts](/Users/yixingzhou/project/aigcgateway/src/lib/sync/alias-classifier.ts), [fix-alias-modality.ts](/Users/yixingzhou/project/aigcgateway/scripts/fix-alias-modality.ts), [fix-brand-duplicates.ts](/Users/yixingzhou/project/aigcgateway/scripts/fix-brand-duplicates.ts)
- Environment: localhost `:3099` via `bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`

Scenario Coverage
- Smoke: 本地服务可用、管理员登录可用
- classifyNewModels: 新建 alias 继承 `Model.modality/contextWindow/maxTokens`；`Model` 为 null 时使用 LLM fallback；existing alias modality mismatch 跳过
- inferMissingBrands: prompt 传入已有品牌列表并优先使用锚定名称
- fix-alias-modality: `--dry-run` 只读，实跑后 TEXT image alias 被修正为 IMAGE
- fix-brand-duplicates: `--dry-run` 只读，实跑后 `智谱 AI` / `Arcee AI` 等变体合并为标准名
- Production read-only probe: 如环境允许，远端仅执行 `--dry-run` 与只读查询，不执行正式写入

ID: A1-SMOKE
Title: 本地 3099 验收环境 smoke
Priority: Critical
Requirement Source: `features.json` / F-A1-04
Preconditions:
- 已在持久 PTY 运行 `bash scripts/test/codex-setup.sh`
- `bash scripts/test/codex-wait.sh` 返回 ready
Request Sequence:
1. GET `/v1/models`
   Expected Status: `200`
2. POST `/api/auth/login`
   Payload:
   - `{"email":"admin@aigc-gateway.local","password":"admin123"}`
   Expected Status: `200`
State Assertions:
- 本地服务与管理员鉴权正常
Cleanup:
- 无

ID: A1-CLASSIFY
Title: 新 sync 后新模型自动继承正确 modality/contextWindow
Priority: Critical
Requirement Source: F-A1-01 / F-A1-02 / F-A1-04
Preconditions:
- 将 deepseek provider 切到本地 mock
- 构造未挂载 `TEXT` / `IMAGE` model 和一个现有 `TEXT` alias
Request Sequence:
1. 执行 `classifyNewModels()`
   Expected Status:
   - 函数返回
   Assertions:
   - 新 image alias 的 `modality=IMAGE`
   - 新 alias 的 `contextWindow/maxTokens` 优先继承 Model
   - Model 为 null 时使用 LLM fallback 填充
   - image model 归入 text alias 时被跳过
   - existing alias `contextWindow/maxTokens` 为空时从 Model 补齐
State Assertions:
- prompt 中含已有品牌列表锚定
Cleanup:
- 删除测试 alias/model/link/channel

ID: A1-BRAND
Title: brand 推断锚定已有品牌列表
Priority: High
Requirement Source: F-A1-03 / F-A1-04
Preconditions:
- 构造已有品牌与一个 `brand=null` alias
Request Sequence:
1. 执行 `inferMissingBrands()`
   Expected Status:
   - 函数返回
   Assertions:
   - prompt 中包含已有品牌列表
   - 返回结果使用锚定品牌名
Cleanup:
- 删除测试 alias

ID: A1-MODALITY-FIX
Title: 一次性修正现有别名 modality
Priority: High
Requirement Source: F-A1-01 / F-A1-04
Preconditions:
- 构造 `TEXT` alias，但其关联模型全部或多数为 `IMAGE`
Request Sequence:
1. 运行 `scripts/fix-alias-modality.ts --dry-run`
2. 运行 `scripts/fix-alias-modality.ts`
Expected Status:
- dry-run 输出修正计划且不写库
- 实跑后 alias `modality=IMAGE`
Cleanup:
- 删除测试 alias/model/link

ID: A1-BRAND-FIX
Title: 一次性合并重复品牌变体
Priority: High
Requirement Source: F-A1-03 / F-A1-04
Preconditions:
- 构造 `智谱 AI` / `Arcee AI` 等重复品牌 alias
Request Sequence:
1. 运行 `scripts/fix-brand-duplicates.ts --dry-run`
2. 运行 `scripts/fix-brand-duplicates.ts`
Expected Status:
- dry-run 输出映射计划且不写库
- 实跑后品牌收敛为 `智谱AI` / `Arcee`
Cleanup:
- 删除测试 alias

ID: A1-PROD-READONLY
Title: 生产只读核对当前 alias 数据质量
Priority: Medium
Requirement Source: F-A1-04
Preconditions:
- SSH/远端环境可用
Request Sequence:
1. 生产执行 `scripts/fix-alias-modality.ts --dry-run`
2. 生产执行 `scripts/fix-brand-duplicates.ts --dry-run`
3. 生产只读查询抽样 alias
Expected Status:
- 不写入正式库
- 输出当前需要修正的 alias/brand 统计，或验证当前已清理完成
Cleanup:
- 无
Notes / Risks:
- 若 SSH 或远端依赖不可用，需在报告中标记为 blocked，不得静默略过

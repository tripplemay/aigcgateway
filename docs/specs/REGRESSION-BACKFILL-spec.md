# REGRESSION-BACKFILL 批次规格文档

**批次代号：** REGRESSION-BACKFILL
**目标：** 回溯补齐 BILLING-REFACTOR / AUDIT-SEC / DX-POLISH 三批的 regression test + 合并 BL-073 中可做的高风险路径测试
**触发时机：** ADMIN-OPS++ 签收且部署后（已满足）
**规模：** 5 个 generator + 1 个 codex 验收 = 6 条
**来源：** BL-120 + BL-073（部分）

## 背景

`docs/dev/test-lifecycle.md` 的"regression test 沉淀规则"于 **BILLING-REFACTOR 之后**才固化：此后的每个 bug fix 都在同 commit 带 regression test。但 **BILLING-REFACTOR / AUDIT-SEC / DX-POLISH** 三个批次是在规则生效前完成的，没有 regression test 覆盖。

本批次回溯补齐这三个批次的关键断言，把它们写入 `scripts/test-mcp.ts` / `scripts/e2e-test.ts` / `scripts/test-mcp-errors.ts` / `scripts/e2e-errors.ts`，建立真正可跑的 CI 回归基线。

**BL-073 中：** 支付回调暂不做（BL-065 推迟中），限流边界已被 RATE-LIMIT 批次自身 regression 覆盖，**本批次合入邮箱验证路径的测试覆盖**。

## Features

### Phase 1：BILLING-REFACTOR 回溯

| ID | 标题 | 优先级 | 断言 |
|----|------|--------|------|
| F-RB-01 | BILLING-REFACTOR regression tests | high | 1) scripts/test-mcp.ts 增加 "billing: list_models pricing = deducted amount"：调用 chat，读取 get_log_detail 的 cost，对比 list_models 里对应 alias 的 pricing 计算值（prompt×input_per_1m + completion×output_per_1m），误差 < $0.00000001；2) scripts/test-mcp.ts 增加 "billing: image generate cost = alias perCall"：调用 generate_image，验证 cost = alias.sellPrice.perCall；3) scripts/test-mcp.ts 增加 "billing: pricing has no float noise"：断言所有 list_models 返回的 pricing 数值小数位 ≤ 6；4) 三个断言运行在未部署修复的版本上应全部失败；5) tsc 通过 |

### Phase 2：AUDIT-SEC 回溯

| ID | 标题 | 优先级 | 断言 |
|----|------|--------|------|
| F-RB-02 | AUDIT-SEC regression tests | high | 1) scripts/test-mcp.ts 增加 "audit-sec: list_models filters disabled models"：使用 admin 端禁用一个 model 后调用 list_models，断言该 model 不在返回列表；2) scripts/test-mcp.ts 增加 "audit-sec: image models have supportedSizes"：list_models(modality='image') 每个模型都必须有顶层 supportedSizes 数组；3) scripts/test-mcp-errors.ts 增加 "audit-sec: generate_image invalid size returns supportedSizes"：传 9999x9999，断言 error 含 invalid_size + supportedSizes 列表；4) scripts/test-mcp.ts 增加 "audit-sec: free_only filter returns zero-priced aliases"：调用 list_models(free_only=true)，验证只返回 pricing 全为 0 的 alias；5) tsc 通过 |

### Phase 3：DX-POLISH 回溯

| ID | 标题 | 优先级 | 断言 |
|----|------|--------|------|
| F-RB-03 | DX-POLISH regression tests | high | 1) scripts/test-mcp.ts 增加 "dx-polish: chat rejects image modality model"：chat(model='gpt-image-mini') 返回 invalid_model_modality；2) scripts/test-mcp.ts 增加 "dx-polish: capability=vision only returns text models"：list_models(capability='vision')，所有返回的 modality 必须是 text；3) scripts/test-mcp.ts 增加 "dx-polish: reasoning_tokens present in get_log_detail"：调用 reasoning 模型后，get_log_detail.usage 含 reasoningTokens 字段；4) scripts/test-mcp.ts 增加 "dx-polish: json_mode strips markdown code fence"：chat(response_format={type:'json_object'}) 返回内容 JSON.parse 成功，不含 ```json ... ```；5) scripts/test-mcp-errors.ts 增加 "dx-polish: get_action_detail not-found wording"：断言错误消息含 'not found in this project'；6) tsc 通过 |

### Phase 4：BL-073 邮箱验证测试路径

| ID | 标题 | 优先级 | 断言 |
|----|------|--------|------|
| F-RB-04 | Email verification high-risk path regression | medium | 1) scripts/e2e-test.ts 增加 "email-verify: register → unverified → verify token → login OK" 全链路；2) scripts/e2e-errors.ts 增加 "email-verify: invalid token rejected"、"email-verify: expired token rejected"、"email-verify: already-verified repeat call 幂等"；3) 验证 register 后的用户默认 emailVerified=false；4) 不依赖真实发邮件（mock 或读 DB 直接取 token）；5) tsc 通过 |

### Phase 5：脚本健壮性

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-RB-05 | scripts 运行基础设施升级 | medium | 1) 所有 scripts/test-*.ts 从 process.env 读取 BASE_URL / API_KEY 的方式一致；2) 新增 scripts/test-all.sh 一键跑 4 个脚本并汇总 pass/fail；3) 每个脚本末尾打印最终 `passed=X failed=Y`，exit code 正确（失败返回 1）；4) 本批次新增的测试步骤在 `scripts/test-all.sh` 中能跑通（需要 dev server + 测试账号）；5) tsc 通过 |

### Phase 6：验收

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-RB-06 | REGRESSION-BACKFILL 全量验收 | high | codex 执行：1) 对 4 个 scripts/*.ts 做代码审阅，确认所有本批次新增的测试点都存在且断言正确；2) 启动 dev server，在 L1 环境跑 scripts/test-all.sh，全绿通过；3) 至少 1 个新断言回归：把产品代码的对应修复暂时回退，验证相关断言能失败（证明测试真的在测东西，不是空壳）；4) 不破坏现有 scripts/*.ts 的原有测试步骤；5) 签收报告生成 |

## 推荐执行顺序

1. **F-RB-05**（基础设施先做）— 其他 feature 都依赖 scripts/test-all.sh
2. **F-RB-01** BILLING-REFACTOR
3. **F-RB-02** AUDIT-SEC
4. **F-RB-03** DX-POLISH
5. **F-RB-04** 邮箱验证
6. **F-RB-06** 验收

## 涉及的 backlog

- **BL-120** → F-RB-01/02/03（完全关闭）
- **BL-073** → F-RB-04（部分关闭，支付回调留给 BL-065 批次自带，限流边界已由 RATE-LIMIT 自身覆盖）

## 关键约束

- **不改产品代码**，只在 scripts/test-*.ts 补测试
- **每条新增测试必须可在本地 L1 环境实际跑通**（不是只过 tsc 的 dead code）
- **必须在测试里明确标注来源 BL / feature ID**，便于未来审查

## 启动条件

- ADMIN-OPS++ 签收 + 生产部署 ✅
- 本规格转正为 features.json + progress.json

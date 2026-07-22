# BL-IMG-I2I-VISION 验收报告（复验中，未签收）

**批次：** BL-IMG-I2I-VISION  
**阶段：** reverifying（fix round 1）
**Evaluator：** Reviewer  
**执行时间：** 2026-07-22  
**当前结论：** **L1 PASS；L2 BLOCKED / NOT RUN。本文件不是发布签收。**

## Fix Round 1 Reverification Checkpoint

- **被测提交：** `1cd8676`（缺陷修复），状态交接提交 `599623d`。
- **L1 专用 E2E：** `44 PASS / 0 FAIL / 44`；首轮 IIV-DEF-01、IIV-DEF-02 均关闭。
- **副作用核验：** `imageGeneration=false` Key 调 `/v1/images/edits` 返回 `403 forbidden`；余额 `99.92798536 → 99.92798536`，项目 CallLog `12 → 12`。
- **修复回归：** `scripts/e2e-errors.ts` 的 IIV-DEF-01 步骤 PASS；`scripts/test-mcp-errors.ts` 的 IIV-DEF-02 步骤 PASS。
- **静态/回归：** `npx tsc --noEmit` PASS；setup 内 production build PASS；Vitest `81/81` files、`670 passed / 4 skipped`。
- **附带脚本既有失败：** `e2e-errors.ts` 总计 `11 PASS / 2 FAIL`，失败因 clean seed 无 `deepseek/v3`；`test-mcp-errors.ts` 总计 `8 PASS / 3 FAIL`，失败因无 `deepseek-v3` 且 burst case 触发后续限流。新增缺陷回归步骤均 PASS，批次专用 44 项脚本不依赖这些缺失基线。
- **L2：** 尚未获得真实 provider 调用与计费的明确授权；seedream-4-5 真正出图、GCS 实际对象、计费一致性仍为 BLOCKED。OpenRouter 两模型另有已知账户 402 环境阻塞。
- **状态约束：** 保持 `progress.status=reverifying`、F-IIV-08 pending、`docs.signoff=null`；不得置 `done`。

### Fix Verification

| Defect | 复验结果 | 证据 |
|---|---|---|
| IIV-DEF-01 edits 权限绕过和扣费 | CLOSED / PASS | HTTP 403；余额不变；CallLog 数量不变；独立回归步骤 PASS |
| IIV-DEF-02 MCP 11 图协议错误 | CLOSED / PASS | `result.isError=true`；`code=invalid_parameter`；`param=image`；不存在 JSON-RPC `-32602` |

### Current Coverage Gap

真实 provider L2 未执行，因此当前不能对 F-IIV-08 做最终签收。需要用户明确授权后执行 seedream-4-5 URL/base64、edits、MCP generate_image、代理对象、CallLog 和计费核验；OpenRouter 402 按环境 BLOCKED 记录。

## Initial Verifying History

## Initial Summary

- **Scope：** F-IIV-01..08；重点覆盖 i2i generations、multipart edits、MCP vision/generate_image、capability provisioning、门禁、安全限制、计费、日志卫生与回归。
- **Documents：** `docs/specs/BL-IMG-I2I-VISION-spec.md`、`docs/specs/BL-IMG-I2I-VISION-ops.md`、`features.json`、`docs/test-cases/BL-IMG-I2I-VISION-test-cases.md`。
- **Environment：** macOS；本地网关 `http://localhost:3199`；独立 PostgreSQL `aigc_gateway_test`；本地 mock provider `127.0.0.1:43219`。
- **Result totals：** L1 专用 E2E `42 PASS / 2 FAIL / 44`；Vitest `670 PASS / 4 SKIP`；L2 真实 provider E2E `BLOCKED / NOT RUN`。
- **Signoff 状态：** 两项 L1 缺陷未通过，且真实 L2 未获本轮明确授权；`progress.json docs.signoff` 必须保持 `null`。

## Command Evidence

| 命令 / 步骤 | 结果 | 关键证据 |
|---|---|---|
| `git pull --ff-only origin main` | PASS | `Already up to date.`；被测 HEAD `1c567a679c4f08c30afe5b8fa2cf36c51a0b3cf4` |
| `bash scripts/test/codex-setup.sh`（持久 PTY） | PASS | 64 migrations applied；seed PASS；Next build PASS；3199 `Ready` |
| `bash scripts/test/codex-wait.sh` | PASS | `Ready (1x3s elapsed)` |
| provisioning dry-run | PASS | 3 个目标待补；dry-run 前后 DB 完全不变 |
| provisioning `--apply` | PASS | 首次补标 `seedream-4-5 / gpt-image / gemini-3-pro-image`；保留 `preserved_marker`；非目标未变 |
| provisioning 第二次 `--apply` | PASS | `本次补标记 (0)`，幂等 |
| `npx tsc --noEmit` | PASS | exit 0，无诊断 |
| setup 内 `npm run build` | PASS | Next.js optimized production build 完成；仅既有 lint warnings |
| `npm run test` | PASS | `81 passed` test files；`670 passed / 4 skipped` tests |
| `... bl-img-i2i-vision-verifying-e2e-2026-07-22.ts --run` | FAIL | 最终稳定结果 `42 PASS / 2 FAIL / 44` |

## Coverage And Results

| Feature | 结果 | 验证摘要 |
|---|---|---|
| F-IIV-01 MCP chat vision | PASS（L1） | string 回归、multimodal mock 正向、非 vision 门禁、非法 part、11 图、5MB、日志占位均通过 |
| F-IIV-02 generations i2i | PASS（L1） | URL/base64、多 adapter 透传、门禁、空数组/11 图/协议/5MB/定位、日志卫生通过 |
| F-IIV-03 edits | **FAIL** | multipart 正向、多文件、mask、MIME、大小均通过；但 `imageGeneration=false` Key 可成功调用并扣费 |
| F-IIV-04 Volcengine | PASS（mock）/ BLOCKED（L2） | mock 证明 chat 失败后 images fallback 收到 URL/base64 `image[]`；未独立执行真实上游 |
| F-IIV-05 OpenRouter | PASS（mock）/ BLOCKED（L2） | gpt-image 与 gemini mock 均收到标准 `image_url` parts；真实 OpenRouter 已知 402 |
| F-IIV-06 MCP generate_image | **FAIL** | 正向、门禁、非法协议、5MB、回归通过；11 图不符合 D7 错误信封契约 |
| F-IIV-07 provisioning/docs | PASS（L1/static） | dry-run/apply/idempotency/保留键/非目标/模型列表 capability 均通过 |
| F-IIV-08 验收 | **FAIL** | 存在 2 个 L1 缺陷；真实 L2 未执行，不能签收 |

已通过的关键运行时路径：

- REST generations：非 i2i 模型在 provider 调用前返回 `400 model_not_i2i_capable`。
- REST/MCP 安全限制：空数组、11 张、非法协议、超过 5MB、非法 multipart MIME 均返回可定位错误。
- Adapter 透传：Volcengine fallback 收到 URL/base64 `image[]`；OpenRouter 两 alias 收到标准多模态 `image_url` parts。
- edits：1/2 文件 mock E2E 返回同构响应；mask 返回 `400 mask_not_supported`；代理 URL GET 返回 `200 image/png`。
- 日志卫生：`requestParams.image` 仅为 `[image:url 127.0.0.1:43219]` / `[image:base64 68B]`；未发现源图 base64 原文。
- 审计：`responseSummary.source_images_count` 对单图为 1、多图为 2。
- 回归：REST/MCP 纯文生图、REST/MCP string chat、REST vision、模型/余额/日志读类 tools 均通过 mock L1。

## Defects

### [High] IIV-DEF-01 `/v1/images/edits` 绕过 `imageGeneration` API Key 权限并产生扣费

**环境：** localhost:3199，隔离测试库，本地 mock provider。  
**前置条件：** API Key 有效、余额充足，但 permissions 明确为 `{"imageGeneration":false}`。  
**复现步骤：**

1. 使用上述 Key 调 `POST /v1/images/generations`，确认返回 `403 forbidden`（控制组）。
2. 使用同一 Key 对 `POST /v1/images/edits` 发送合法 multipart：`model=seedream-4-5`、`prompt=permission check`、一张 PNG。
3. 查询响应、CallLog 和 Transaction。

**实际结果：** edits 返回 HTTP 200 和签名代理 URL；trace `trc_f045xbm9kg9ufwksv0ezl20b` 写入 `SUCCESS` CallLog；Transaction 为 `DEDUCTION -0.01200000`。  
**预期结果：** 与 generations 一致，在读取 multipart 和调用 provider 前返回 `403 forbidden`，不写 SUCCESS、不扣费。  
**代码证据：** `authenticateApiKey.detectEndpoint()` 仅将 `/images/generations` 映射为 `image`，`/images/edits` 落到 `unknown`，所以 `permissions.imageGeneration === false` 分支未执行。  
**影响范围：** 所有 `/v1/images/edits` 请求；受限 Key 可越过图片生成权限，消耗用户余额与 provider 配额。  
**稳定性：** 最终三轮均稳定复现（HTTP 200）；控制组 generations 稳定 403。

### [Medium] IIV-DEF-02 MCP `generate_image` 超 10 图未返回 D7 规定的 tool error envelope

**环境：** localhost:3199，MCP Streamable HTTP `/api/mcp`。  
**前置条件：** 有效、具备 imageGeneration 权限的 API Key。  
**复现步骤：** 调 `tools/call generate_image`，参数 `image` 为 11 个合法 http URL。  
**实际结果：** MCP SDK 在 handler 前返回 JSON-RPC error `-32602`，Zod `too_big`；没有 `result.isError=true`，也没有业务 `code=invalid_parameter` / `param=image` 信封。  
**预期结果：** 按 spec D7 与同 tool 的其他图片校验错误，返回 `isError:true`，content 中包含稳定业务 code 和参数定位。  
**代码证据：** tool schema 的 `z.array(z.string()).max(10)` 在 `validateImageInput()` 前截断请求，导致 handler 内 82-95 行的业务错误信封不可达。  
**影响范围：** MCP 客户端对超张数错误无法使用与非法协议/超大图片一致的业务错误解析路径；请求被安全拒绝，无扣费风险。  
**稳定性：** 最终三轮均稳定复现。

## L2 Coverage Gaps

本轮未执行真实 provider 调用。原因：Evaluator 规则要求 L2 由用户明确授权；启动指令未构成对真实模型计费调用的单独授权，且 L1 已有阻断缺陷，批次必须先进入 fixing。

- 未独立验证 seedream-4-5 URL/base64 真实 i2i、GCS 实际对象持久化与图像相关性。
- 未独立验证真实 edits / MCP generate_image / MCP vision 回答。
- 未独立验证真实 perCall、零图/失败不扣费和 OpenRouter token usage 计费。
- OpenRouter 账户在 handoff 中已知欠费并预计返回 402；该环境问题不计产品 FAIL。

## Open Questions

- 无需产品裁决即可修复 IIV-DEF-01：`edits` 应与 `generations` 同属 image endpoint 权限域。
- IIV-DEF-02 的规格已明确 D7 `isError:true + code`；如团队决定接受 SDK `-32602`，需先由 Planner 修改规格，否则当前行为仍判 FAIL。

## Initial Final Conclusion (History)

**FAIL。** F-IIV-03 与 F-IIV-06 回到 pending，`progress.status` 应置 `fixing`。修复后最小复验范围：两项缺陷用例、REST/MCP 权限与限制回归、全量 Vitest；L1 全 PASS 后再申请并执行 L2，最终才能填写 `docs.signoff` 并置 `done`。

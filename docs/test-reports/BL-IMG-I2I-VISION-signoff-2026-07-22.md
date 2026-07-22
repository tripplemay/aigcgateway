# BL-IMG-I2I-VISION 验收报告（未签收）

**批次：** BL-IMG-I2I-VISION
**阶段：** reverifying（fix round 1）
**Evaluator：** Reviewer
**执行时间：** 2026-07-22
**被测提交：** `1cd8676`（缺陷修复），L1 证据提交 `2826144`
**最终结论：** **FAIL。L1 全通过，L2 功能全通过，但 OpenRouter 成功图片调用零扣费。不得签收。**

## 测试目标

验证图片输入批次的 REST/MCP vision、generations i2i、multipart edits、MCP generate_image、真实 Provider、GCS 持久化、代理读取、门禁/限制、计费、日志卫生与纯文本/文生图回归。

## 测试环境

- 本地网关：`http://localhost:3199`，按 Codex 专用 setup/wait 流程启动。
- 数据：独立 PostgreSQL `aigc_gateway_test`，不写生产业务数据。
- L2 Provider：真实 Volcengine Seedream、OpenRouter GPT Image/Gemini Image、Qwen Vision。
- 对象存储：真实 GCS 测试对象持久化；源图为公开 512x512 黑色幼犬图片。
- 生产检查：仅通过 SSH 执行只读 SQL，未部署、未修改生产配置或数据。
- 授权：用户于 2026-07-22 明确授权真实 Provider L2 调用。

## 总体结果

| 层级 / 检查 | 结果 | 摘要 |
|---|---:|---|
| L1 专用 E2E | PASS | `44/44`；权限、门禁、限制、adapter 透传、日志卫生和回归全过 |
| 首轮缺陷复验 | PASS | IIV-DEF-01、IIV-DEF-02 均关闭 |
| L2 真实功能链路 | PASS | 14/14 唯一场景通过；Seedream、edits、MCP、vision、OpenRouter、GCS、代理均打通 |
| L2 视觉相关性 | PASS | URL/base64/edits/GPT/Gemini 均保留黑色幼犬主体、姿态和木板构图 |
| Seedream perCall 计费 | PASS | 每次 cost `$0.0274`、sell/余额扣减 `$0.03288` |
| 失败不扣费 | PASS | HTTP 400、CallLog `ERROR`、cost/sell 0、余额不变、无 Transaction |
| OpenRouter token 计费 | **FAIL** | 生产配置下成功调用 cost 非零但 sell 为 0，无 Transaction；最近 20 条稳定复现 |
| TypeScript | PASS | `npx tsc --noEmit` exit 0 |
| Build | PASS | Codex setup 内 Next production build 完成 |
| Vitest | PASS | 81 files；`670 passed / 4 skipped` |
| L2 脚本格式 | PASS | Prettier check 通过 |

## L2 通过项

| 场景 | 结果 | 关键证据 |
|---|---:|---|
| Seedream URL i2i | PASS | `trc_ubzozrqja75v052o2q5ojbdl`；代理 JPEG 1,712,152 B；GCS；source=1；扣 `$0.03288` |
| Seedream base64 i2i | PASS | `trc_cfxqlz0clssfwalxw3epdh30`；代理 JPEG 1,909,331 B；GCS；base64 日志已脱敏 |
| Edits 单文件 | PASS | `trc_phq1z4lyid5p2svgt48batlx`；GCS；source=1；扣 `$0.03288` |
| Edits 双文件 | PASS | `trc_o1at4yhfxscil77pjue6e1nj`；GCS；source=2；扣 `$0.03288` |
| MCP generate_image i2i | PASS | `trc_eepe8m7l6esxspnbusmxfsfz`；代理 200；GCS；扣 `$0.03288` |
| MCP / REST vision | PASS | Qwen 对源图均回答 `Dog`；MCP trace `trc_m3twju6m6gtsqxtvm5gt362r` |
| REST / MCP 文生图回归 | PASS | `trc_kb3cgzs7veixrtj68pmspjxy` / `trc_dmxtg1dmp8wku12boc1s3yte`；代理与 GCS 正常 |
| REST / MCP 纯文字回归 | PASS | 均回答 `OK`；MCP trace `trc_l56ygpwpe6ihkejegbuf3qn4` |
| 上游失败不扣费 | PASS | `trc_h94d30mu62sfmhwftdvuauk0`；余额 `99.66893296` 不变；无交易 |
| OpenRouter gpt-image i2i | PASS（功能） | `trc_e1q9seaazr86acnqfnb364lu`；PNG；GCS；usage 1297/4829；上游成本 `$0.18651` |
| OpenRouter gemini i2i | PASS（功能） | `trc_fu1gtbokxge4soboqaqdlgdj`；JPEG；GCS；usage 267/1379；上游成本 `$0.136434` |

L2 首跑中的 4 个表面失败均由新验收脚本断言造成：本地代理 host 归一化、纯 t2i 不应要求 `source_images_count=0`、MCP 异步计费需等待结算、CallLog 失败枚举应为 `ERROR`。修正测试产物后对应场景全部通过；未修改产品代码。

## 缺陷

### [High] IIV-DEF-03 OpenRouter token 图片通道被 call-priced alias 覆盖为零卖价

**环境：** 当前 main 计费代码；本地真实 OpenRouter 调用；生产配置与生产 CallLog 只读核验。
**前置条件：** 图片通道 `costPrice.unit=token`，channel sell 为 token；同一 alias 存在非 null 的 call sellPrice。生产 `gpt-image` 和 `gemini-3-pro-image` 均满足。
**复现步骤：**

1. 用 `gpt-image` 或 `gemini-3-pro-image` 完成一次成功图片调用并取得 token usage。
2. 检查 alias/channel 价格配置。
3. 查询 CallLog 的 cost/sell 和同 trace Transaction。

**实际结果：**

- `gemini-3-pro-image` alias 为 `{unit:call, perCall:0.08274}`，通道为 token `2/12` cost、`2.4/14.4` sell。
- `gpt-image` alias 为 `{unit:call, perCall:0.082603}`，通道为 token `10/10` cost、`12/12` sell。
- 生产 trace `trc_q98vo3tr6la357e23use9h7x`：cost `$0.138326`、sell `$0`、Transaction 0。
- 生产 trace `trc_ntgwyf24r5a9myjknwbchckk`：cost `$0.20615`、sell `$0`、Transaction 0。
- 最近 20 条生产成功图片记录（19 Gemini、1 GPT）全部 cost 非零、sell 为 0。

**预期结果：** token-priced OpenRouter 图片调用按有效 token 卖价计算非零 sell，并原子扣减余额、写 Transaction；符合 spec §4 计费项和 TC-IIV-051。
**代码证据：** `src/lib/api/post-process.ts:463` 按 channel cost unit 选择 token 路径；`:672` 无条件优先任何非 null 的 alias sellPrice；`:705` 读取不存在的 `inputPer1M/outputPer1M` 后算出 0；`:554` 因 `sellUsd=0` 跳过扣费。对照 `calculateCallCost` 已按字段兼容性 fallback，但 token 路径没有同类保护。
**影响范围：** 所有“token-priced channel + 非 token alias sellPrice”的成功调用，不限本批次新增 i2i；Provider 成本持续发生但用户余额不扣减。
**严重级别：** High（稳定收入损失和对账偏差，阻断发布）。
**是否稳定复现：** 是，生产抽样 20/20。
**备注：** 修复需同时增加“token channel + call alias + token channel sell”回归，并使用生产等价价格做 L2 复验；历史零扣费记录是否追补由 Planner/用户裁决。

## 已关闭缺陷

| 缺陷 | 结果 | 证据 |
|---|---:|---|
| IIV-DEF-01 edits 绕过 imageGeneration 权限 | CLOSED | HTTP 403；余额、CallLog 不变；独立回归通过 |
| IIV-DEF-02 MCP 11 图返回 SDK 错误而非业务信封 | CLOSED | `isError=true`；`invalid_parameter`；`param=image`；无 `-32602` |

## 风险与未执行项

- 未将本批次代码部署到生产；生产仅做只读配置和历史 CallLog 取证。这不影响缺陷判定，因为当前 main 的计费分支与生产配置组合可确定产生零 sell，且生产历史已稳定实证。
- 未做生产 capability provisioning；该步骤应在后续部署流程执行，不属于本次本地 L2 写入范围。
- 未验证 mask 编辑成功，因为规格明确 mask 不支持并应返回 400，L1 已覆盖。
- OpenRouter 原“账户 402”阻塞已解除；本轮两模型均真实成功，不再是 BLOCKED。

## 证据链接

- [L2 证据汇总](artifacts/bl-img-i2i-vision-2026-07-22/l2-evidence.md)
- [L2 可执行脚本](../../scripts/test/bl-img-i2i-vision-l2-2026-07-22.ts)
- [测试用例](../test-cases/BL-IMG-I2I-VISION-test-cases.md)
- [规格](../specs/BL-IMG-I2I-VISION-spec.md)

## 最终结论

**FAIL，不签收。** F-IIV-01 至 F-IIV-07 的功能链路和回归满足验收，F-IIV-08 因 IIV-DEF-03 不通过。`progress.status` 应由 `reverifying` 转为 `fixing`，F-IIV-08 保持 `pending`，`docs.signoff` 保持 `null`。

最小复验范围：

1. token-priced channel 在 alias 为 call/缺 token 字段时采用兼容的非零 token sell 来源。
2. `gpt-image` 与 `gemini-3-pro-image` 使用生产等价价格完成真实 i2i，CallLog sell > 0、余额按公式下降、Transaction 存在。
3. Seedream perCall、失败不扣费、纯文生图/纯文字、L1 44 项及全量 Vitest 不回归。

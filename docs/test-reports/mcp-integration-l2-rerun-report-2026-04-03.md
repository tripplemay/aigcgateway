# MCP 集成测试 L2 回归报告 2026-04-03

## 测试目标

验证上一轮 L2 报告中的 4 类问题是否已修复：

1. `TC-04-4` 计费一致性
2. `TC-04-7` chat 后余额扣减
3. `TC-05-1/2` generate_image 正常返回图片并写入 `source='mcp'`
4. `TC-06-5` `list_logs search="Say OK"`

## 测试环境

- 环境：Staging / 研发阶段生产环境
- Base URL：`https://aigc.guangai.ai`
- API Key：用户提供的 `pk_388ff...`
- 生产测试开关：
  - `PRODUCTION_STAGE=RND`
  - `PRODUCTION_DB_WRITE=ALLOW`
  - `HIGH_COST_OPS=ALLOW`

## 测试范围

- 重跑：
  - `scripts/test-mcp.ts`
  - `scripts/test-mcp-errors.ts`
- 对失败步骤补做最小探针

## 执行步骤概述

1. 重跑 L2 主链路脚本
2. 重跑 L2 错误场景脚本
3. 对仍失败步骤补做 `get_log_detail` / `generate_image` / `list_logs search` 探针

## 通过项

- 主链路总体结果未回退：
  - `12 PASS | 5 FAIL`
- 错误场景仍保持通过：
  - `4 PASS | 0 FAIL | 1 SKIPPED`
- 仍然通过的关键项：
  - `chat (MCP)` 成功
  - `traceId` 正常
  - `get_log_detail` 仍返回 `source='mcp'`
  - API chat 仍成功

## 失败项

- Step 6 `get_balance (after chat)` / `TC-04-7`
  - 结果未变
  - 余额仍为 `$50.0000`

- Step 9 `Verify billing consistency (MCP vs API)` / `TC-04-4`
  - 结果未变
  - 本轮新 trace `trc_dkz73cgt6p2xiqcx9qudaswd` 的 `get_log_detail` 仍显示：
    - `cost: "$0.0000"`
    - `source: "mcp"`
  - 因此脚本仍失败为 `MCP cost was 0, cannot compare`

- Step 10 `generate_image (normal call)` / `TC-05-1`
  - 结果未变
  - 主链路脚本仍失败为 `No images in response`

- Step 11 `Verify CallLog.source='mcp' (generate_image)` / `TC-05-2`
  - 结果未变
  - 仍因 Step 10 未产出有效图片结果而失败

- Step 15 `list_logs (search: 'Say OK')` / `TC-06-5`
  - 结果未变
  - 主链路脚本仍失败为 `No logs found with search term 'Say OK'`

## 风险项

- 本轮没有观察到修复落地，L2 仍卡在“调用成功但计费/余额/图片/搜索不一致”的状态
- 回归补探针期间，我这侧到 staging 又出现了一次 TLS 连接错误：
  - `curl: (35) LibreSSL SSL_connect: SSL_ERROR_SYSCALL`
  - 该错误出现在重复补探针阶段，不影响本轮基于主脚本结果的主结论

## 证据

- 主链路重跑输出：
  - [mcp-integration-l2-main-run-2026-04-03-rerun2.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/mcp-integration-l2-main-run-2026-04-03-rerun2.txt)
- 错误场景重跑输出：
  - [mcp-integration-l2-errors-run-2026-04-03-rerun2.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/mcp-integration-l2-errors-run-2026-04-03-rerun2.txt)
- 上一轮仍有效的图片响应证据：
  - [l2-image-probe-body-2026-04-03.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/l2-image-probe-body-2026-04-03.txt)

## 最终结论

本轮回归结论为 `FAIL`。

和上一轮相比，没有新增修复闭环。当前 L2 仍未达到签收条件，阻塞点保持不变：

1. `TC-04-4` 无法完成有效计费比对
2. `TC-04-7` chat 后余额未扣减
3. `TC-05-1/2` 图片生成主链路未通过
4. `TC-06-5` `list_logs search` 未命中刚产生的 chat 记录

`TC-10-1` 仍为手动项，本轮继续跳过。

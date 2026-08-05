# BL-SEC-HOTFIX-2608 Evaluator 测试用例

## 范围与环境

- 首轮验收阶段：`verifying`，代码基线：`5b7ef6c`。
- L1：本地 Codex 测试环境 `localhost:3199`，使用 `scripts/test/codex-setup.sh` 初始化。
- L2：需要真实 provider key 的全链路聊天/图片/计费，本轮未获额外 staging 授权，不以本地占位 key 代替。
- 生产盘点：仅只读事务；不得执行迁移、充值、回调、扣费或其他业务写入。

## 用例

| ID | 功能 | 验证内容 | 通过判据 |
|---|---|---|---|
| TC-SH-01 | F-SH-01 | 生产执行 spec §5(a)(b)(c) 三组 SQL，并核对查询为 read-only | 原始查询、结果表、损失汇总和 C1 利用明确结论落报告 |
| TC-SH-02 | F-SH-02 | `PAYMENT_ENABLED` 未设置、`false`、空值、大小写不匹配时调用支付宝/微信 webhook 与用户充值端点 | 三端均 410；回调函数不触达；不创建 `RechargeOrder`；充值错误码 `payment_disabled` |
| TC-SH-03 | F-SH-02 | `PAYMENT_ENABLED=true` 的显式放行回归与 admin 充值路径静态核对 | 原有逻辑仍可进入；admin 路径不读取该 flag |
| TC-SH-04 | F-SH-03 | 不存在/停用别名但存在同名启用底层 Model 时调用 `resolveEngine` | 404 `MODEL_NOT_FOUND`，不查询底层 fallback；启用别名携带 alias 与卖价正常路由 |
| TC-SH-05 | F-SH-03 | 存量 Action/Template 引用核验 | 部署前所有 Action model 命中启用别名；否则阻塞发布并列出迁移清单 |
| TC-SH-06 | F-SH-04 | 三种 spec 分片场景、usage 末帧、逐字符分片 | 事件顺序/内容/usage 完整；`[DONE]`、注释行、event、多行 data 语义不回归 |
| TC-SH-07 | F-SH-05 | MCP 受限 Key 创建新 Key 的权限交集 | 调用方显式 `false` 的每一位在新 Key 仍为 `false`；全权限空对象行为保持；链式派生不可放宽 |
| TC-SH-08 | 全批次 | 全量 Vitest、typecheck、lint、build | 所有命令退出 0；新增回归测试被实际收集执行 |

## 未执行项

- L2 真实 provider 调用、真实计费扣款、图片生成：本轮无 staging 授权和 provider 条件，明确标记为未执行，不据此判定本地实现通过或失败。
- 生产 Action 迁移：属于业务数据写入，需单独授权；本轮只读核验并报告阻塞。

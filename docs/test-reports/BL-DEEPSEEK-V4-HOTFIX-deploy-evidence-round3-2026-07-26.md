# BL-DEEPSEEK-V4-HOTFIX fix_round 3 部署执行证据 — 2026-07-26

执行：Generator（Kimi），用户授权
部署：`gh workflow run deploy.yml` → run `30216513457` **success**，生产 checkout `26b3272`，app 镜像 created `2026-07-26T17:09:43Z`

> Generator 的执行存证，非验收签收。签收由 Evaluator 在 F-DSV4-06 输出。

---

## 1. 陈旧通道最终状态

```
deepseek-v3       | deepseek-chat     | DISABLED | 1
deepseek-reasoner | deepseek-reasoner | DISABLED | 1
deepseek-v4-flash | deepseek-v4-flash | ACTIVE   | 2
deepseek-v4-pro   | deepseek-v4-pro   | ACTIVE   | 3
deepseek-chat     | deepseek-chat     | DISABLED | 10
```

**下架不是靠一次性脚本完成的，是 model-sync 自己做的：**

```
[model-sync] deepseek: OK 2 models (API: 2, AI: 0 enriched) +0 new, -2 disabled
```

因为首轮止血后 deepseek 在库通道数与远端相等，缩水护栏不再触发，`reconcile` 恢复正常运行，`toDisable` 按上游目录自动下架。止血脚本此时 dry-run 输出「0 条待下架 — 已是干净状态」，符合预期。**自动化自己修好了，比一次性脚本更可持续。**

## 2. vetoRecovery 在生产实地生效

部署后一小时内 AUTO_RECOVERY：**否决 8 次 / 放行 4 次** —— 是有判别力的门槛，不是一刀切。

被否决的通道（去重后 8 条，与上线前的误伤面实测**完全吻合**）：

| provider | 否决通道数 | 样例 |
|---|---:|---|
| siliconflow | 4 | `deepseek-r1`、`moonshotai/Kimi-K2-Thinking`、`baidu/ERNIE-4.5-300B-A47B` |
| deepseek | 2 | **`deepseek-chat`、`deepseek-reasoner`（本次目标）** |
| openrouter | 2 | `xiaomi/mimo-v2-flash`、`google/gemini-2.5-flash-lite-preview-09-2025` |

日志样例：

```
[health] recovery vetoed deepseek/deepseek-reasoner: realModelId 不在 deepseek 的 /models 目录中（远端 2 个模型）
[health] recovery vetoed deepseek/deepseek-chat: realModelId 不在 deepseek 的 /models 目录中（远端 2 个模型）
SystemLog AUTO_RECOVERY/WARN  拒绝自动恢复 deepseek/deepseek-chat：…
```

**护栏也验证了不误伤**：同一批次里 `volcengine/doubao-pro-128k: DISABLED → ACTIVE` 正常恢复。这条正是上线前实测中「realModelId 不在 volcengine /models 里」的通道 —— 因为 volcengine 配了 `quirks.endpointMap`（接入点 ID 体系），门槛按设计跳过，没有误杀。

## 3. 别名语义已恢复（D1 的目的）

| 别名 | 落点 provider | realModelId | 说明 |
|---|---|---|---|
| `deepseek-v3` | volcengine | `deepseek-v3-ark` | **真 V3**，不再是上游静默替换的 V4-flash |
| `deepseek-r1` | openrouter | `deepseek/deepseek-r1` | **真 R1** |

两条均 SUCCESS、`sellPrice > 0`。traceId：`trc_ie3tolyga2tpbtieoycf2dx0`、`trc_l6ref0pcn73fl3dvxffmqs72`。

## 4. 需要运维知悉的取舍（已兑现，非预测）

siliconflow 4 条 + openrouter 2 条通道现在会**一直保持 DISABLED**，不再自动恢复——它们的 `realModelId` 确实不在各自 `/models` 目录里。这是「止血不被撤销」的代价，上线前已实测预警。

处置建议（任选，不在本批次范围）：
- 若确认这些模型仍可调用 → 管理员在后台手动置回 ACTIVE（门槛只拦自动恢复，不拦人工）
- 若确认已下架 → 保持 DISABLED 即为正确状态
- 长期 → 这些 provider 的 `/models` 目录不完整是根问题，值得单开数据治理批次

## 5. 仍待 Evaluator 复验（F-DSV4-06）

- 陈旧通道在完整恢复窗口（30min DISABLED_INTERVAL）内保持 DISABLED
- F-DSV4-05 模型名类 400 的生产跨通道 failover 正反验证
- 四别名扣费与 Transaction 一致性
- 四个 L1 脚本不回归（fix_round 2 已本地验证 exit 0，需 Evaluator 独立复现）

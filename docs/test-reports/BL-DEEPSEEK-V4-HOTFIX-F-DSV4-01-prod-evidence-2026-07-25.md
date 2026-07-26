# F-DSV4-01 生产止血执行证据 — 2026-07-25

批次：BL-DEEPSEEK-V4-HOTFIX　执行：Generator（Kimi）　环境：生产 deploysvr（194.238.26.173）

> 本文件是 Generator 的执行存证，非验收签收报告。签收报告由 Evaluator 在 F-DSV4-06 输出。

---

## 1. 上游事实核对

```
$ curl -s https://api.deepseek.com/models -H "Authorization: Bearer <prod key>"
{"object":"list","data":[{"id":"deepseek-v4-flash",...},{"id":"deepseek-v4-pro",...}]}

$ curl -s -X POST https://api.deepseek.com/chat/completions -d '{"model":"deepseek-chat",...}'
{"error":{"message":"The supported API model names are deepseek-v4-pro or deepseek-v4-flash, but you passed deepseek-chat.","type":"invalid_request_error",...}}

$ ... -d '{"model":"deepseek-reasoner",...}'
{"error":{"message":"...but you passed deepseek-reasoner.",...}}
```

## 2. 执行方式

生产 postgres/redis 仅绑定 `127.0.0.1`，通过 SSH 隧道本地执行：

```bash
ssh -f -N -L 15432:127.0.0.1:5432 -L 16379:127.0.0.1:6379 deploysvr
DATABASE_URL='postgresql://aigc:***@127.0.0.1:15432/aigc_gateway' \
REDIS_URL='redis://127.0.0.1:16379/0' \
  npx tsx scripts/hotfix-deepseek-v4-retire-legacy.ts [--apply]
```

## 3. dry-run（执行前盘点）

```
上游 /models 返回 2 个模型：
  deepseek-v4-flash, deepseek-v4-pro

--- 执行前通道快照（5 条）---
  model=deepseek-v3          realModelId=deepseek-chat      status=ACTIVE priority=1  别名=deepseek-v3
  model=deepseek-reasoner    realModelId=deepseek-reasoner  status=ACTIVE priority=1  别名=deepseek-r1
  model=deepseek-v4-flash    realModelId=deepseek-v4-flash  status=ACTIVE priority=2  别名=deepseek-v4-flash
  model=deepseek-v4-pro      realModelId=deepseek-v4-pro    status=ACTIVE priority=3  别名=deepseek-v4-pro
  model=deepseek-chat        realModelId=deepseek-chat      status=ACTIVE priority=10 别名=deepseek-chat[disabled]

--- 待下架（realModelId 不在上游集合内，3 条）---
  deepseek-v3 / deepseek-chat, deepseek-reasoner / deepseek-reasoner, deepseek-chat / deepseek-chat
```

## 4. --apply（执行后）

```
写入完成：3 条通道 → DISABLED；已清 models:list* 缓存。

--- 执行后通道快照（5 条）---
  model=deepseek-v3          realModelId=deepseek-chat      status=DISABLED priority=1
  model=deepseek-reasoner    realModelId=deepseek-reasoner  status=DISABLED priority=1
  model=deepseek-v4-flash    realModelId=deepseek-v4-flash  status=ACTIVE   priority=2
  model=deepseek-v4-pro      realModelId=deepseek-v4-pro    status=ACTIVE   priority=3
  model=deepseek-chat        realModelId=deepseek-chat      status=DISABLED priority=10
```

## 5. 幂等复跑

```
--- 待下架（realModelId 不在上游集合内，0 条）---
  (无 — 已是干净状态)
```

## 6. 生产真实调用验证（经 MCP → https://aigc.guangai.ai）

四个别名全部成功，落到健康通道，`sellPrice > 0` 且 Transaction 已写入：

| 别名 | status | 落点 provider | realModelId | costPrice | sellPrice | latency |
|---|---|---|---|---|---|---|
| `deepseek-v3` | SUCCESS | volcengine | `deepseek-v3-ark` | 0.00000045 | 0.00000034 | 2202ms |
| `deepseek-r1` | SUCCESS | openrouter | `deepseek/deepseek-r1` | 0.00005490 | 0.00004615 | 1408ms |
| `deepseek-v4-pro` | SUCCESS | qwen | `deepseek-v4-pro` | 0.00000000 | 0.00008700 | 2221ms |
| `deepseek-v4-flash` | SUCCESS | qwen | `deepseek-v4-flash` | 0.00000000 | 0.00000504 | 1044ms |

transactions 表对应 4 条 `DEDUCTION`（-0.00000504 / -0.00008700 / -0.00004615 / -0.00000034）。

traceId：`trc_dzx8r62quub8jjsghca0u8re`、`trc_a4n82xglzt14vjjjapjiwfvv`、`trc_fh91b25e3ytdtgr63pbzqgty`、`trc_rlr3wzcluu5vqzji09bafbif`

止血前对照（同一别名的 ERROR 记录）：
```
modelName=deepseek-v3  status=ERROR  errorCode=invalid_request
err="The supported API model names are deepseek-v4-pro or deepseek-v4-flash, but you passed deepseek-chat."
```

## 7. 顺带发现（不在本批次范围，供裁决）

`deepseek-v4-pro` / `deepseek-v4-flash` 落到 qwen 通道时 `costPrice = {inputPer1M:0, outputPer1M:0}` → 成本侧记为 0，毛利统计失真（卖价正常，用户不受影响）。

全库抽查显示这是**跨服务商的系统性数据缺口**，非本次改动引入：

| provider | token 计价 ACTIVE 通道中 cost 为 0 的 | 总数 |
|---|---|---|
| qwen | **185** | 185 |
| siliconflow | 62 | 68 |
| zhipu | 6 | 8 |
| minimax / guangtech | 各 5 | 各 5 |
| xiaomi-mimo | 2 | 2 |
| openrouter | 5 | 332 |
| volcengine / deepseek | 0 | 11 / 2 |

根因方向：这些服务商的 `/models` 不返回价格，sync 建 channel 时 costPrice 填 0 且无后续补价路径。建议另开数据治理批次（不在 BL-DEEPSEEK-V4-HOTFIX 范围内，见 spec §5）。

## 8. 回滚

把对应 channel 的 `status` 改回 `ACTIVE` 即可（纯数据操作，无 schema 变更）。但注意：回滚等于把已下线的上游模型名重新放回路由，会立刻复现故障。

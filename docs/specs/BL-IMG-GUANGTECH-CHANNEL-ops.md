# BL-IMG-GUANGTECH-CHANNEL — 生产执行 runbook

**对象：** guangtech provider 下的 `gpt-image-1` / `gpt-image-1.5` / `gpt-image-2` 三个图片模型
**脚本：** `scripts/add-guangtech-image-channels.ts`
**规格：** `docs/specs/BL-IMG-GUANGTECH-CHANNEL-spec.md`

---

## 0. 前置

- 有 `deploysvr` 的 SSH 访问（`~/.ssh/config` 中的别名，见 `.auto-memory/environment.md`）。
- guangtech provider 已存在且 `status=ACTIVE`（`providers.id=cmr4n7yb401cebnqhwps4vd7r`）——本脚本**不创建、不修改** provider 与 ProviderConfig。
- 三行 `models`（`guangtech/gpt-image-1` / `-1.5` / `-2`）已由 2026-07-03 的 sync 建好。脚本对它们只做 `enabled=false → true`。

## 1. 开隧道

生产 PostgreSQL 只绑 `127.0.0.1`，本地跑脚本须走隧道：

```bash
ssh -f -N -L 15432:127.0.0.1:5432 deploysvr
lsof -ti:15432   # 有输出即隧道就绪
```

取 DB 口令：

```bash
ssh deploysvr "grep -E '^POSTGRES_(USER|PASSWORD|DB)=' /opt/apps/aigc-gateway/.env"
```

组装连接串（下文统一记作 `$PROD_DB`）：

```bash
export PROD_DB="postgresql://<user>:<password>@127.0.0.1:15432/aigc_gateway"
```

## 2. dry-run（不写库，必做）

```bash
DATABASE_URL="$PROD_DB" npx tsx scripts/add-guangtech-image-channels.ts
```

预期输出（三行，每行标明 model / channel / alias 各自将 CREATE 还是 UPDATE）：

```
[dry-run] gpt-image-2 | model guangtech/gpt-image-2 EXISTS→enable | channel CREATE realModelId=gpt-image-2 | alias CREATE | cost=$0.068836/张 sell=$0.082603/张
```

若 channel 显示 `EXISTS→update` 而非 `CREATE`，说明已经跑过一次（幂等，可继续）。

## 3. 上游可用性实测（L2 —— 须先取得用户明示授权）

> **这一步会产生真实上游费用**（每个模型一张图，约 $0.07/张，三个模型合计约 $0.21）。
> 按 `.auto-memory/role-context/evaluator.md`「L2 测试需用户明确授权再执行」，
> **未获用户明示授权不得执行本步**。
>
> 本步不可省略：`BL-IMG-SEEDREAM45-spec.md` D2 已立规——外部模型必须**实测返回真实
> 图片后才入验收**，不得凭 `/v1/models` 列出就判定可用（seedream-3 即因此翻车：
> realModelId 未配 ep-ID，恒 404 却一直被当作"已接入"）。

```bash
DATABASE_URL="$PROD_DB" npx tsx scripts/add-guangtech-image-channels.ts --probe
```

预期：

```
[PASS] gpt-image-2 → b64_json 812.4KB (13500ms)
```

**判读：**

| 结果 | 处置 |
|---|---|
| 三个全 PASS | 进入第 4 步，全量 apply |
| 部分 FAIL | 只 apply PASS 的：`--apply --only=gpt-image-2,gpt-image-1`。FAIL 的模型在验收报告中记录 HTTP 状态与响应片段，不得 apply |
| 全 FAIL | **停止**，不 apply。把响应原文交回 Planner 评估是否需要 provider quirks（例如上游只支持 chat 形态、或参数名不同） |

只测单个模型：`--probe --only=gpt-image-2`。

## 4. 落库

```bash
DATABASE_URL="$PROD_DB" npx tsx scripts/add-guangtech-image-channels.ts --apply
# 或只落探测通过的：
DATABASE_URL="$PROD_DB" npx tsx scripts/add-guangtech-image-channels.ts --apply --only=gpt-image-2
```

`--probe --apply` 可串联（先测后落，FAIL 的仍会被落库，故**不推荐**串联；建议分两步，人工判读探测结果后再 apply）。

## 5. 复核 SQL

```bash
ssh deploysvr "docker exec aigc-gateway-postgres-1 psql -U aigc -d aigc_gateway -c \"
SELECT m.name AS model, m.enabled AS model_enabled, ch.\\\"realModelId\\\", ch.status,
       ch.priority, ch.\\\"costPrice\\\"::text, ch.\\\"sellPrice\\\"::text
FROM channels ch JOIN models m ON m.id=ch.\\\"modelId\\\"
WHERE ch.\\\"providerId\\\"='cmr4n7yb401cebnqhwps4vd7r' AND m.modality='IMAGE'
ORDER BY m.name;\""
```

期望：三行，`model_enabled=t`，`status=ACTIVE`，`costPrice={\"unit\":\"call\",\"perCall\":0.068836}`，`sellPrice={\"unit\":\"call\",\"perCall\":0.082603}`。

别名侧：

```bash
ssh deploysvr "docker exec aigc-gateway-postgres-1 psql -U aigc -d aigc_gateway -c \"
SELECT a.alias, a.enabled, a.modality, a.\\\"sellPrice\\\"::text, m.name AS model
FROM model_aliases a
JOIN alias_model_links l ON l.\\\"aliasId\\\"=a.id
JOIN models m ON m.id=l.\\\"modelId\\\"
WHERE a.alias IN ('gpt-image-1','gpt-image-1.5','gpt-image-2') ORDER BY a.alias;\""
```

期望：三行，`enabled=t`，`modality=IMAGE`，`sellPrice` 非空，各自链到对应 `guangtech/*` model。

## 6. 幂等验证

再跑一次 `--apply`，复核 SQL 结果行数不变、无重复行：

```bash
DATABASE_URL="$PROD_DB" npx tsx scripts/add-guangtech-image-channels.ts --apply
```

第二次输出应为 `action=updated`（而非 `created`）。

## 7. 端到端验证（Evaluator，L2）

```bash
curl -s -X POST https://aigc.guangai.ai/v1/images/generations \
  -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-2","prompt":"a red apple on white background","size":"1024x1024","n":1}'
```

核对：返回同源代理 URL 且 `GET` 得到 `200 image/*`；`call_logs` 该 trace 的 `costPrice≈0.068836`、`sellPrice≈0.082603`、`status=SUCCESS` 且产生对应 `transactions` 扣费行；失败调用不扣费。

## 8. 回滚

按影响面从小到大：

```sql
-- (a) 即时下线（推荐，保留配置）
UPDATE model_aliases SET enabled=false WHERE alias IN ('gpt-image-1','gpt-image-1.5','gpt-image-2');

-- (b) 禁用通道
UPDATE channels SET status='DISABLED'
WHERE "providerId"='cmr4n7yb401cebnqhwps4vd7r'
  AND "modelId" IN (SELECT id FROM models WHERE name LIKE 'guangtech/gpt-image%');

-- (c) 回到本批次之前的状态
UPDATE models SET enabled=false WHERE name LIKE 'guangtech/gpt-image%';
```

脚本本身幂等且无破坏性删除，重跑不会产生重复行。

---

## 附：定价来源与假设（spec D3 原文，交付时须让用户知情）

- `sellPrice = {unit:'call', perCall: 0.082603}` —— 取 openrouter 线上 `gpt-image` 别名的用户实付价，用户侧不涨不跌。
- `costPrice = {unit:'call', perCall: 0.068836}` —— 由上者 ÷ 全项目统一的 1.2x markup 反推（`scripts/pricing/fix-image-channels-2026-04-24.ts:8` 明文口径；qwen / siliconflow / volcengine / openrouter 全部严格 1.2x），按 `src/lib/prisma.ts` `roundTo6` 取 6 位小数。
- guangtech `ProviderConfig.currency=USD` ⇒ `calculateCallCost` 的 `exchangeRate=1`，perCall 即 USD。

> **⚠️ `0.068836` 是「对齐 openrouter 口径」的名义成本，不是 guangtech 的真实进价**（上游未提供计价 API）。它只影响毛利报表与对账，**不影响用户扣费金额**。拿到真实费率后改 `channel.costPrice` 一处即可，无需改代码。
>
> **⚠️ 三个模型同价。** `gpt-image-1` / `-1.5` 无 openrouter 对照价，无从"参照"，沿用与 `-2` 相同的 perCall。sellPrice 与用户今天付的 `gpt-image` 完全一致（收入中性）；成本侧同上为名义值。若后续确认 `gpt-image-1` 明显更便宜，在 `/admin/model-aliases` + channel 调整即可，无需改代码。

## 附：为什么需要这个脚本

`src/lib/sync/model-sync.ts:372-380`（F-SI-01）按设计**跳过 IMAGE channel 创建**——DB 触发器 `trg_validate_image_channel_pricing` 禁止 `costPrice` 全零的 IMAGE channel，而 sync 拿不到真实图片单价，若强行 `createMany` 会连累同批 TEXT channel 一起失败。因此 sync 只建 `models` 行，channel 留待人工补。

本脚本就是"人工补"这一步的可重复版本。跳过记录此前只走 `console.log`，admin 完全不可见（本批次 F-GTI-02 修复该可见性），这正是 guangtech 三个图片模型自 2026-07-03 起静默不可用一个月的原因。

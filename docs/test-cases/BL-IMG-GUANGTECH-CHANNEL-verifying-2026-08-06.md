# BL-IMG-GUANGTECH-CHANNEL 首轮验收用例

## 范围

- F-GTI-01：provisioning 脚本、生产配置、模型发现、网关图片 E2E、计费与失败不扣费。
- F-GTI-02：IMAGE channel 跳过告警、通知抑制、历史同步结果 UI、中英文文案。

## L1 本地

| ID | 检查 | 预期 |
|---|---|---|
| L1-01 | `codex-setup.sh` + `codex-wait.sh` | `localhost:3199` 就绪，`GET /v1/models` 和管理员登录 200 |
| L1-02 | 全量 Vitest、typecheck、lint、build | 全部通过 |
| L1-03 | 脚本默认执行 | 只读 dry-run，model/channel/alias/link 行数不变 |
| L1-04 | 首次与第二次 `--apply` | 首次各建 3 行；复跑行数不变，无重复 |
| L1-05 | 人工漂移 `priority`、`supportedSizes` 后复跑 | 收敛到 `priority=10`、`supportedSizes=null` |
| L1-06 | 上游固定返回 502，执行 `--probe --apply --only=gpt-image-2` | 探测失败，禁止创建 channel/alias/link |
| L1-07 | F-GTI-02 定向单测 | 非空写 WARN + 通知；空集合静默；相同集合抑制；集合变化重发 |
| L1-08 | Admin 运维页 | 历史 `providers[].skippedImageChannels` 能显示完整列表，文案走 i18n |

## L2 生产

| ID | 检查 | 预期 |
|---|---|---|
| L2-01 | `/v1/models` + MCP `list_models(modality=image)` | 列出 `gpt-image-1`、`gpt-image-1.5`、`gpt-image-2` |
| L2-02 | 三个 alias 各调用一次 `/v1/images/generations` | 200，返回同源代理 URL；URL 为 `200 image/*` |
| L2-03 | 查询对应 `call_logs` 和 `transactions` | SUCCESS；cost `0.068836`、sell `0.082603`；扣费行存在且金额一致 |
| L2-04 | 使用不存在 alias 发起失败调用 | 返回 404/503；余额及交易行不变 |
| L2-05 | 只读 SQL 复核生产配置 | 3 channel ACTIVE/priority=10/裸 realModelId；model/alias/link 完整且定价正确 |

## 判定

- 任一探测失败模型仍可被 apply：F-GTI-01 FAIL。
- apply 不能把受管字段恢复为规格值：F-GTI-01 FAIL。
- 告警、抑制或 Admin 可见性缺失：F-GTI-02 FAIL。
- L1 与 L2 分开记录；L1 provider placeholder 导致的真实 AI 调用失败不算产品缺陷。

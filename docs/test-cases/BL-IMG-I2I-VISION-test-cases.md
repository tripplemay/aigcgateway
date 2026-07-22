# BL-IMG-I2I-VISION 验收测试用例

**批次：** BL-IMG-I2I-VISION  
**阶段：** verifying / reverifying（fix round 1）
**Evaluator：** Reviewer  
**需求来源：** `docs/specs/BL-IMG-I2I-VISION-spec.md`、`docs/specs/BL-IMG-I2I-VISION-ops.md`、`features.json` F-IIV-01..08  
**环境边界：** L1 使用 `http://localhost:3199` 与测试数据库；L2 使用真实 provider key，须用户明确授权。若 OpenRouter 返回账户 402 则记为环境 `BLOCKED`；本轮账户可用，两模型真实调用成功。

## 覆盖摘要

| 范围                      | 用例                             |
| ------------------------- | -------------------------------- |
| 启动、构建、测试          | TC-IIV-001..004                  |
| capability provisioning   | TC-IIV-010..013                  |
| REST generations / i2i    | TC-IIV-020..028、TC-IIV-060..063 |
| REST edits multipart      | TC-IIV-030..036、TC-IIV-064      |
| MCP generate_image / chat | TC-IIV-040..047、TC-IIV-065..067 |
| 计费、日志、持久化        | TC-IIV-050..056                  |
| 相邻流程回归              | TC-IIV-060..067                  |

## 本轮执行结论

- L1：`44/44 PASS`；IIV-DEF-01/02 复验关闭。
- L2：真实 Provider 功能场景 `14/14 PASS`，视觉相关性、GCS、代理、Seedream perCall 和失败不扣费均通过。
- TC-IIV-051：**FAIL**。生产等价配置中 OpenRouter channel 为 token sell、alias 为 call sell，成功调用写入非零 cost 但 sell=0、无 Transaction；缺陷 IIV-DEF-03。
- 批次整体：**FAIL / fixing**；F-IIV-08 保持 pending，signoff 为空。

## 结构化测试用例

### 启动与静态验证

| ID         | 层级   |   优先级 | 目标与步骤                                                                                                  | 预期结果                                                            |
| ---------- | ------ | -------: | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| TC-IIV-001 | L1     | Critical | 在持久 PTY 前台运行 `bash scripts/test/codex-setup.sh`，另一个 shell 运行 `bash scripts/test/codex-wait.sh` | 数据库重置、迁移、seed、build 和 3199 启动全部成功；wait 返回 ready |
| TC-IIV-002 | Static |     High | 运行 `npx tsc --noEmit`                                                                                     | 退出码 0                                                            |
| TC-IIV-003 | Static |     High | 运行 `npm run build`，不得破坏随后运行时验证                                                                | 退出码 0；若在独立阶段执行，之后按唯一启动流程重启 3199             |
| TC-IIV-004 | Static |     High | 运行 `npm run test`                                                                                         | 全部测试通过，无未解释失败                                          |

### Capability provisioning

| ID         | 层级 |   优先级 | 前置条件与步骤                                               | 预期结果                                                                    |
| ---------- | ---- | -------: | ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| TC-IIV-010 | L1   |     High | seed 后运行 provisioning dry-run                             | 输出 IMAGE alias 盘点、待补及缺失清单；数据库不变                           |
| TC-IIV-011 | L1   | Critical | 运行 `npx tsx scripts/provision-i2i-capabilities.ts --apply` | 目标 alias 顶层 `image_to_image=true`，保留原 capability，非目标 alias 不变 |
| TC-IIV-012 | L1   |     High | 第二次运行 `--apply`                                         | 幂等：本次补标为 0，目标仍为 true                                           |
| TC-IIV-013 | L1   |     High | 调用 `GET /v1/models` / MCP `list_models`                    | 对外 capability 与数据库结果一致；缓存未保留写入前旧值                      |

### REST `/v1/images/generations`

| ID         | 层级 |   优先级 | 前置条件与步骤                                       | 预期结果                                                     |
| ---------- | ---- | -------: | ---------------------------------------------------- | ------------------------------------------------------------ |
| TC-IIV-020 | L1   | Critical | 非 i2i IMAGE 模型携带合法 `image` URL                | HTTP 400，`code=model_not_i2i_capable`，未调用 provider      |
| TC-IIV-021 | L1   |     High | `image=[]`                                           | HTTP 400，错误定位 `param=image`                             |
| TC-IIV-022 | L1   |     High | `image` 为 11 个 URL                                 | HTTP 400，说明最大 10 张并定位 `image`                       |
| TC-IIV-023 | L1   |     High | `image=ftp://...`                                    | HTTP 400，错误包含协议限制并定位 `image`                     |
| TC-IIV-024 | L1   |     High | `image` 为超过 5MB 解码尺寸的 data URI               | HTTP 400，说明 5MB 上限并定位 `image`                        |
| TC-IIV-025 | L1   |   Medium | `image` 数组含空串或非字符串                         | HTTP 400，定位具体 `image[index]`                            |
| TC-IIV-026 | L1   |   Medium | 缺 `model` / 缺 `prompt` / 空 prompt 分别请求        | 干净 400，参数定位准确                                       |
| TC-IIV-027 | L2   | Critical | 对 ops 放行且可用模型分别使用 URL 源图与 base64 源图 | HTTP 200；`data[0].url` 为签名代理 URL                       |
| TC-IIV-028 | L2   | Critical | GET TC-IIV-027 返回的代理 URL                        | HTTP 200，`Content-Type: image/*`；响应由 GCS 持久化对象提供 |

### REST `/v1/images/edits`

| ID         | 层级 |   优先级 | 前置条件与步骤                                  | 预期结果                                           |
| ---------- | ---- | -------: | ----------------------------------------------- | -------------------------------------------------- |
| TC-IIV-030 | L1   |     High | 用 JSON 而非 multipart 调用 edits               | 干净 400，明确要求 `multipart/form-data`           |
| TC-IIV-031 | L1   |     High | multipart 缺 `image`                            | HTTP 400，定位 `image`                             |
| TC-IIV-032 | L1   |     High | multipart 携带 `mask`                           | HTTP 400，`code=mask_not_supported`                |
| TC-IIV-033 | L1   |     High | multipart 上传非 image MIME 文件                | 干净 400，定位对应图片文件                         |
| TC-IIV-034 | L1   |     High | multipart 上传单文件超过 5MB                    | HTTP 413 或 400，明确大小上限                      |
| TC-IIV-035 | L1   |     High | multipart 上传超过 10 个文件                    | 干净 4xx，说明数量上限                             |
| TC-IIV-036 | L2   | Critical | `curl -F` 上传 1 张及 2 张源图调用 seedream-4-5 | HTTP 200；响应与 generations 同构，代理 URL 可解析 |

### MCP `generate_image` 与 `chat`

| ID         | 层级 |   优先级 | 前置条件与步骤                                                    | 预期结果                                                                       |
| ---------- | ---- | -------: | ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| TC-IIV-040 | L1   | Critical | MCP `generate_image` 用非 i2i 模型携带 URL 源图                   | MCP `isError=true`，`code=model_not_i2i_capable`                               |
| TC-IIV-041 | L1   |     High | MCP `generate_image` 携带 11 张图、非法协议、超 5MB base64        | 各自 `isError=true`，错误含 code 与参数定位                                    |
| TC-IIV-042 | L2   | Critical | MCP `generate_image` 调 seedream-4-5，携带 URL 源图               | 返回非空代理 URL，GET 为 200 image/\*                                          |
| TC-IIV-043 | L1   | Critical | MCP `chat` 用非 vision 文本模型携带 image_url                     | MCP `isError=true`，`code=model_not_vision_capable`                            |
| TC-IIV-044 | L1   |     High | MCP `chat` 使用非法 part、非法协议、11 张图、超 5MB base64        | 各自干净 MCP 错误，含 code 与定位信息                                          |
| TC-IIV-045 | L2   | Critical | MCP `chat` 用 vision 模型识别一张内容明确的图片                   | 返回与图片内容相符的文本回答                                                   |
| TC-IIV-046 | L1   |   Medium | MCP `tools/list` 查看 chat / generate_image schema 和 description | content 支持数组；image 支持 string/array；含 URL 优先、限制与 capability 指引 |
| TC-IIV-047 | L1   |   Medium | 未认证、无权限 Key 调 MCP 新增路径                                | 沿用现有认证/权限错误，不泄漏内部信息                                          |

### 计费、日志卫生与持久化

| ID         | 层级  |   优先级 | 前置条件与步骤                                                 | 预期结果                                                              |
| ---------- | ----- | -------: | -------------------------------------------------------------- | --------------------------------------------------------------------- |
| TC-IIV-050 | L2    | Critical | 成功 i2i 前后查询余额与 CallLog                                | perCall 模型按一次调用扣费；CallLog SUCCESS、cost/sellPrice 完整      |
| TC-IIV-051 | L2    |     High | OpenRouter i2i 成功后检查 usage 与计费                         | token 计价使用上游 usage，包含源图输入 token；若账户 402 则 BLOCKED   |
| TC-IIV-052 | L1/L2 | Critical | 检查 URL/base64 i2i CallLog `requestParams` / `promptSnapshot` | 无源图原始 base64；仅 `[image:base64 NB]` / `[image:url host]` 占位符 |
| TC-IIV-053 | L2    |     High | 检查成功 i2i CallLog `responseSummary`                         | `source_images_count` 与请求源图数一致                                |
| TC-IIV-054 | L1    | Critical | 门禁/校验失败前后查余额与 CallLog                              | 不扣费；不得产生伪 SUCCESS 审计                                       |
| TC-IIV-055 | L2    |     High | 上游失败或零图响应场景前后查余额                               | 失败/零图不扣费                                                       |
| TC-IIV-056 | L2    |     High | 成功结果检查代理签名、过期参数和对象 key                       | 不暴露上游 URL/base64；代理指向已持久化对象                           |

### 回归

| ID         | 层级  |   优先级 | 前置条件与步骤                               | 预期结果                                    |
| ---------- | ----- | -------: | -------------------------------------------- | ------------------------------------------- |
| TC-IIV-060 | L1/L2 | Critical | REST generations 不带 `image` 调图片模型     | 纯文生图请求形态不含 image；L2 返回有效图片 |
| TC-IIV-061 | L1/L2 |     High | MCP generate_image 不带 `image`              | 旧 schema/响应兼容；L2 返回有效图片         |
| TC-IIV-062 | L1/L2 | Critical | REST chat 纯字符串 content                   | 行为与既有实现一致；L2 正常回复             |
| TC-IIV-063 | L1/L2 | Critical | MCP chat 纯字符串 content                    | schema 接受且旧流程不变；L2 正常回复        |
| TC-IIV-064 | L1    |     High | generations 与 edits 对相同门禁/非法源图请求 | 错误 code、参数定位和限流回滚语义一致       |
| TC-IIV-065 | L1/L2 |     High | REST vision 使用合法/非法图片输入            | 已有 REST vision 校验与门禁不回归           |
| TC-IIV-066 | L1    |     High | 无效模型调用 REST/MCP 图片接口               | 维持既有 `model_not_found` / MCP 错误信封   |
| TC-IIV-067 | L1    |   Medium | 调用模型列表、余额和日志查询                 | 读类 API / MCP tools 正常，无相邻功能回归   |

## 判定规则

- `PASS`：观察行为完全满足规格。
- `FAIL`：实现行为违反规格，可稳定复现。
- `BLOCKED`：因未获 L2 授权、provider key/余额、上游服务或测试数据不可用而无法验证。
- `NOT RUN`：本轮主动排除且已说明原因；关键路径存在 NOT RUN 时不得声称完整签收。
- 首轮存在任一 `FAIL` 或功能性 `PARTIAL`：批次进入 `fixing`，对应 feature 回到 `pending`。
- 全部硬性验收项 PASS 后才写入 signoff 路径并将批次置为 `done`。

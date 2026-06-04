# BL-IMG-SEEDREAM45 — 接入 Seedream 4.5 图片模型（替代下线的 seedream-3）

**类型：** 新功能（混合批次：generator 脚本 + codex 验收）
**创建：** 2026-06-04
**背景：** BL-IMG-PERSIST-GCS fix_round2 下线了 seedream-3（realModelId 未配 ep-ID 恒 404 + 火山下线名单）。用户裁决：不重启 seedream-3，改接入**最新 Seedream 4.5**。

---

## 1. 目标

在网关接入火山方舟最新图片模型 **Seedream 4.5**（`doubao-seedream-4-5-251128`，¥0.20/张，公测），供 API / MCP / 控制台调用。复用现有 volcengine provider + adapter；本批主要是**幂等配置 provisioning + ops（ep-ID）+ 验收**。

附带价值：seedream 返回 **http url 上游**，正好补上 BL-IMG-PERSIST-GCS 缺失的"http 上游 → GCS 持久化"真实 E2E 验证（此前在售 image 模型全是 base64）。

## 2. 设计决策（D）

- **D1 模型：** `doubao-seedream-4-5-251128`（image generation，¥0.20/张）。Provider=volcengine（已存在，seedream-3 即用此 provider）。参考 `docs/provider/ADR-005-volcengine-ark-api-integration.md`。
- **D2 realModelId（关键，seedream-3 翻车根因）：** 火山引擎调用须用 **endpoint ID（ep-xxx）**——用户在火山方舟控制台为 Seedream 4.5 **创建在线推理接入点**拿 ep-ID 填入 channel.realModelId。ADR-005 注 #4 称模型名亦可（"较新方式"），但**必须实测返回真实图片后才入验收**（本批严格执行新沉淀的 L1：外部模型可用性前置验证）。
- **D3 调用方式：** Seedream 优先 **chat 接口**（ADR-005 §三），channel `imageViaChat=true`；volcengine adapter 已实现 chat 优先 + `/images/generations` 回退 + 尺寸回退。
- **D4 alias 命名：** canonical alias = **`seedream-4-5`**（与旧 `seedream-3` 命名一致、显式版本）。可选再加 `seedream` 作"最新指针"alias —— **默认只建 `seedream-4-5`**，是否加 `seedream` 待用户定。
- **D5 定价：** costPrice = ¥0.20/张（按网关现有 image channel `costPrice` 的 shape + 币种/单位惯例存；Generator 须 grep 一个在售 image channel 如 gpt-image-mini 作模板）。sellPrice（对用户售价）= 按现有 image 模型加价惯例（参考 gpt-image-mini alias sellPrice），**具体倍率待 admin/用户确认**。
- **D6 supportedSizes：** 按 Seedream 4.5 官方文档确认（1K/2K/4K + 具体像素，见火山 Seedream 4.5 使用指南）；volcengine adapter 已有"默认尺寸→大尺寸回退"兜底，配置取常用集即可。
- **D7 capabilities：** image generation + `image_prefer_chat`。Seedream 4.5 支持图生图/多图融合，但本批 MVP **不强求** image-to-image（可选 `image_input`，列为后续增强）。
- **D8 幂等 + 可回滚：** provisioning 用幂等脚本（dry-run + --apply），重复跑不产生重复 channel/model/alias；禁用回滚=alias `enabled=false`（同 seedream-3 下线手法）。

## 3. 前置条件（ops / 用户执行 — Generator 不得代为在火山控制台 provision）

1. 火山方舟控制台开通 Seedream 4.5 模型权限。
2. 创建**在线推理接入点**（Inference Endpoint）指向 `doubao-seedream-4-5-251128` → 拿到 **ep-xxx** ID。
3. 把 ep-ID 提供给 Generator（或填入脚本 env/arg）。

> Generator 须在 F-SD45-01 交付 ops runbook（确切控制台步骤 + 脚本运行命令），并标注 ep-ID 创建为用户遗留交接项（铁律：manual 任务归属，不甩 Codex）。

## 4. Features

### F-SD45-01 — Seedream 4.5 幂等 provisioning 脚本 + ops runbook（executor: generator）
- 新增 `scripts/add-seedream-45.ts`（dry-run 默认 / `--apply` 落库），幂等 upsert：
  - **channel**（provider=volcengine）：`realModelId`=ep-ID（从 env/arg 注入，缺失则 dry-run 报清晰提示）、`imageViaChat=true`、`costPrice`=¥0.20/张（按现有 image channel shape）、ACTIVE。
  - **model** `seedream-4-5`：modality=IMAGE、`supportedSizes`（D6）、capabilities（D7）。
  - **alias** `seedream-4-5`：指向上述 model、`sellPrice`（D5）、enabled=true、deprecated=false。
- 脚本须：先 grep/Read 一个在售 image channel（gpt-image-mini）作 costPrice/sellPrice/字段 shape 模板；CLI 退出前 close prisma + redis（铁律）；幂等（重复跑无重复行）。
- 新增 `docs/specs/BL-IMG-SEEDREAM45-ops.md`：火山控制台开 ep-ID 步骤 + 生产跑脚本步骤 + 回滚（alias enabled=false）。
- **Acceptance：** (1) 脚本存在，dry-run 输出将创建/更新的 channel/model/alias 摘要；(2) `--apply` 在 dev/scratch DB 幂等生效（重复跑不产生重复行）；(3) costPrice/sellPrice/supportedSizes/capabilities/imageViaChat 字段 shape 与现有 image channel 一致（已 grep 模板）；(4) ops runbook 含确切 gcloud-equivalent 控制台步骤 + 运行命令 + 回滚；(5) CLI 退出 close prisma+redis；(6) `npx tsc --noEmit` + `npm run build` PASS；(7) 独立 commit `feat(BL-IMG-SEEDREAM45 F-SD45-01)`。

### F-SD45-02 — Codex 验收 + 签收报告（executor: codex）
- **前置：** 用户已在火山控制台建 ep-ID 并提供；脚本已 `--apply` 到生产（或 Codex 在可控环境 apply）。
- **Acceptance：** (1) `scripts/test/codex-setup.sh` + wait PASS；(2) `list_models(modality=image)` / 生产 `/v1/models` 含 `seedream-4-5`；(3) **真实 E2E**：经 API（`/v1/images/generations`）或 MCP（`generate_image`）用 `seedream-4-5` 生成 → 返回同源代理 URL → **GET 200 image/\***，且对象**已持久化到 GCS**（验证 BL-IMG-PERSIST-GCS 的 http 上游→GCS 路径首个真实 E2E）；(4) 计费正确：CallLog cost≈¥0.20 等值、sellPrice 按 D5、SUCCESS 扣费、失败不收费；(5) 日志详情页该 trace 可回看图（非 metadata）；(6) 幂等性：脚本重跑不产生重复 channel/model/alias；(7) `npx tsc --noEmit` / `npm run build` / `npm run test` PASS；(8) 输出 `docs/test-reports/BL-IMG-SEEDREAM45-signoff-YYYY-MM-DD.md` 含命令证据 + 结论 PASS/FAIL。

## 5. 影响 / 复用（grep 反向消费点，铁律 1.5）

- 复用：volcengine provider + `src/lib/engine/adapters/volcengine.ts`（chat 优先图片提取，已存在）；GCS 持久化链路（BL-IMG-PERSIST-GCS 已上线）；现有 image channel costPrice/sellPrice shape（模板 gpt-image-mini）。
- 新增：`scripts/add-seedream-45.ts`、`docs/specs/BL-IMG-SEEDREAM45-ops.md`。
- 数据变更：volcengine channel + model `seedream-4-5` + alias `seedream-4-5`（生产 DB，经脚本）。
- **不需改** 引擎/代理/持久化代码（纯配置接入），除非验收发现 4.5 响应形态与 adapter 不兼容。

## 6. 风险与回滚

- ep-ID 未创建/错误 → 调用 404（seedream-3 同款）；故 D2 强制"实测返回图后才入验收"。
- 回滚：alias `seedream-4-5` enabled=false（即时下线），channel 可禁用。
- sellPrice 倍率未定 → 用 gpt-image-mini 惯例占位，admin 后续调整（不阻断接入）。
- 4.5 可能仅支持部分尺寸 → adapter 尺寸回退兜底；supportedSizes 按官方文档配。

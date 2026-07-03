# BL-SYNC-ADAPTERTYPE-FALLBACK 签收报告（2026-07-03）

- 批次：`BL-SYNC-ADAPTERTYPE-FALLBACK`
- 阶段：`reverifying -> done`
- 执行人：Codex / Reviewer
- 结论：**PASS，准予签收**

## 签收范围

- `adapterType=openai-compat` 通用 fallback 派发。
- `guangtech` 生产模型同步、channel 生成与 canonical 命名空间修复。
- 既有 named provider 的 name 优先派发回归。
- fix-round-1 一次性数据修复脚本的幂等性。
- Codex 测试域单测补强与全量本地质量门禁。

## L1 本地

- `npm run test -- tests/unit/sync/openai-compat-adapter.test.ts tests/unit/sync/model-sync-adapter-dispatch.test.ts`
  - PASS：2 files / 8 tests。
  - 复验新增断言：fallback provider 新建/复用 canonical model 时必须使用 `guangtech/<modelId>`，同时 `channel.realModelId` 保持裸 id。
- `npm run test`
  - PASS：81 files / 670 passed / 4 skipped。
- `npx tsc --noEmit`
  - PASS。
- `npm run build`
  - PASS；仅保留既有 ESLint warnings（admin/model-aliases、admin/models、logs `<img>`、mcp-setup、models、layout font、auth-terminal hooks）。
- `bash scripts/test/codex-setup.sh`
  - BLOCKED by local environment：本机无可连接 PostgreSQL，且 Docker daemon 未运行。
  - 原始错误：`ERROR: docker 命令存在但 daemon 未运行。`
  - 判定：环境阻塞，不计为产品失败；本批核心逻辑已由单测、typecheck、build、生产只读核验覆盖。

## 生产核验

- 生产服务：
  - `/opt/aigc-gateway` 运行代码 commit：`a751d0ade6b4875d78e16401d0ab8c413e9a4210`
  - PM2 `aigc-gateway`：4 个进程 online。
- `guangtech` provider：
  - `status=ACTIVE`
  - `adapterType=openai-compat`
  - `baseUrl=https://co.ghgame.cn:18065/v1`
- `guangtech` channel / model DB 状态：
  - channelCount = 6
  - activeChannelCount = 6
  - bareLinkedCount = 0
  - 6 个 ACTIVE channel 全部挂到前缀 canonical model：
    - `gpt-5.2 -> guangtech/gpt-5.2`
    - `gpt-5.3-codex -> guangtech/gpt-5.3-codex`
    - `gpt-5.3-codex-spark -> guangtech/gpt-5.3-codex-spark`
    - `gpt-5.4 -> guangtech/gpt-5.4`
    - `gpt-5.4-mini -> guangtech/gpt-5.4-mini`
    - `gpt-5.5 -> guangtech/gpt-5.5`
  - 每个 guangtech TEXT model 的 `aliasLinkCount=1`，重命名后别名链接保留。
  - 3 个 IMAGE model 仅有 prefixed model row、无 channel，符合现有 IMAGE channel 跳过策略：
    - `guangtech/gpt-image-1`
    - `guangtech/gpt-image-1.5`
    - `guangtech/gpt-image-2`
- 修复脚本幂等：
  - `npx tsx scripts/fix-guangtech-canonical-naming.ts`
  - dry-run 输出：fallback providers `(1): guangtech`，`待重命名 (0)`。
- `LAST_SYNC_RESULT` at `2026-07-03T09:44:44.995Z`:
  - `guangtech`: `success=true`, `apiModels=9`, `modelCount=9`, `newChannels=0`, `disabledChannels=0`, `skippedImageChannels=3`。
  - `guangtech` skipped IMAGE labels 已是前缀 canonical：`guangtech/gpt-image-* -> guangtech/gpt-image-*`。

## 回归核验

- name 优先派发单测 PASS：`deepseek` 即使 `adapterType=openai-compat` 仍走 named adapter，不被通用 fallback 覆盖。
- 生产 `LAST_SYNC_RESULT` 中核心回归 provider 均为 success：
  - `deepseek`: success, API 2, modelCount 2。
  - `zhipu`: success, API 8, modelCount 8。
  - `qwen`: success, API 194, modelCount 194。
  - `siliconflow`: success, API 73, modelCount 90。
  - `volcengine`: success, API 14, modelCount 14。
  - `openrouter`: success, API 312, modelCount 312。
  - `minimax`: success, API 8, modelCount 8。
- `zhipu` 最新 modelCount 低于首轮报告中的 16：已复核上游 `/models` 当前只返回 8 个 id，且本批 diff 未改 `zhipu` adapter / doc-enricher；判定为外部清单/AI enrich 波动，不是本批 fallback 命名修复引入的回归。

## 已知非阻塞项

- `xiaomi-mimo` 仍返回 401，`LAST_SYNC_RESULT` 记录为 warning/failure 且 existing channels preserved；该问题在 spec §3 明确 out of scope。
- 生产 `/opt/aigc-gateway` 工作树中 `scripts/fix-guangtech-canonical-naming.ts` 显示有本机差异，因为生产上热修补了 orphan 删除逻辑；远端 main 已包含对应提交 `431642a`，不影响运行代码 `a751d0a` 的 model-sync 修复判定。
- 新增 guangtech 模型的 `enabled=false` 属 reconcile 默认上架策略；上架/定价是 admin 独立流程，不属于本 bug 修复范围。

## 最终判定

首轮失败项已关闭：`guangtech` 不再入库裸 canonical 名，所有 ACTIVE guangtech TEXT channel 均指向 `guangtech/<modelId>`，`realModelId` 仍保持上游裸 id。通用 `openai-compat` fallback、named provider name 优先、数据修复幂等性和生产 DB 状态均通过复验。

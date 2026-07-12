---
name: proposed-learnings
description: 本项目运行中发现的值得沉淀到 Triad Workflow 框架的经验暂存（本地暂存，done 阶段批量同步到 harness-template repo）
type: project
---

# 本项目待沉淀到 Triad Workflow 的提案

> **定位：** 本文件是 aigcgateway 项目**本地**的 proposed-learnings 暂存区。
>
> **工作流：**
> 1. Generator / Evaluator / Planner 在批次运行中发现值得沉淀的经验时，追加到本文件
> 2. Planner 在 done 阶段读取本文件，逐条提交用户确认
> 3. 用户确认后，Planner **切换到 `~/project/harness-template` 目录**，将对应内容写入 framework 源码文件（如 `harness/planner.md`、`docs/XXX.md`、`CHANGELOG.md` 等），commit + push 到 harness-template repo
> 4. 完成同步的条目从本文件移除（或标记已同步）
>
> **注意：** framework 已独立为 `tripplemay/harness-template` repo（见 CLAUDE.md §Triad Workflow 规则）。本项目不再有 `framework/` 子目录，也不再通过 subtree push 同步。

---

<!-- 待确认的提案出现在此处，示例格式：

## [YYYY-MM-DD] [角色] — 来源：F-XXX

**类型：** 新规律 / 新坑 / 模板修订 / 铁律补充

**内容：** [一句话描述]

**建议写入 harness-template 的：** `harness/planner.md` / `docs/01-concepts.md` §经验教训 / 其他

**状态：** 待确认

-->

<!-- ================= 待确认区 ================= -->

## [2026-07-12] Planner/Generator — 来源：BL-PROD-MIGRATE-DEPLOYSVR

**类型：** 新规律（生产迁移剧本）

**内容：** 不可逆生产迁移（换机/换部署模型）应遵循固定剧本：①并行演练——起新栈 + 灌一份生产数据快照 + 全链路冒烟，旧机全程照常（本次演练即捕获 Next standalone HOSTNAME bug，割接前挡掉）；②割接前把可逆步骤（签证/反代/验证公网可达）全预置完，把不可逆停机窗口压到"停旧写→数据终态同步→切 DNS"最短；③停机前逐项 go/no-go；④旧机停写冻结作回滚点 + 旧 DNS/secret 值留档，观察期后再退役。

**建议写入 harness-template 的：** 新增 `harness/deploy-patterns.md` §"不可逆生产迁移剧本"（演练→预置→最短窗口→回滚就绪四段）

**状态：** 待确认

## [2026-07-12] Generator — 来源：BL-PROD-MIGRATE-DEPLOYSVR

**类型：** 新坑（有状态应用迁移的凭据一致性）

**内容：** 迁移有状态应用时，"解密 DB 数据的密钥"（如 ENCRYPTION_KEY）必须与源机**逐字节一致**，且要用 sha256 跨机比对证明（不能只"复制了就算"）——不一致则 DB 内加密字段全部无法解密=全站瘫痪。配套坑：源机 `.env` 若是 bash `source` 的（值带引号 `KEY="v"`），迁到 docker compose `env_file` 时引号会被当字面量保留，须去引号规范化。

**建议写入 harness-template 的：** `harness/deploy-patterns.md` §凭据迁移（sha256 逐字校验 + env_file 去引号）

**状态：** 待确认

## [2026-07-12] Generator — 来源：BL-PROD-MIGRATE-DEPLOYSVR

**类型：** 新坑（Next.js standalone 容器部署）

**内容：** Next.js standalone `server.js` 默认绑 `process.env.HOSTNAME`，而 Docker 运行时把 HOSTNAME 注入为容器 ID → 应用绑到容器 IP 而非 0.0.0.0，导致容器内 `127.0.0.1` 不监听：发布端口经 docker-proxy 仍可达（外部 200），但容器内 healthcheck（fetch 127.0.0.1）ECONNREFUSED、状态卡 starting。修复：compose `environment: HOSTNAME=0.0.0.0`（发布端口仅 loopback 时无安全影响）。

**建议写入 harness-template 的：** `harness/deploy-patterns.md` §容器化 Next.js（与既有 §"Next standalone request.url origin 反代推导" v0.9.21 同族，可并一节）

**状态：** 待确认

<!-- ================= 已同步到 harness-template（归档区） ================= -->

## [2026-07-03 已同步 v0.9.23] Planner 铁律 9：spec 断言某值"写入 DB/流向下游"前必须追踪实际写入路径
- 来源：BL-SYNC-ADAPTERTYPE-FALLBACK 首轮 FAIL — spec D2 断言适配器返回的 SyncedModel.name（带 provider/ 前缀）会成为 models.name，但 reconcile 的 resolveCanonicalName(modelId) 直接返回裸 modelId、丢弃 name（M1a 后所有 provider 都存裸 id）→ 前缀从未落库 → fix-round-1
- 写入：`harness/planner.md` §铁律 9（grep 落点列反查真实来源；警惕 canonical/reconcile/transform 中间层重算/丢弃；铁律 1 向数据流终点维度扩展）

## [2026-07-03 已同步 v0.9.23] deploy-patterns §6：数据命名/结构变更类修复——部署立即触发 on-boot 后台任务产生 orphan/中间态
- 来源：BL-SYNC-ADAPTERTYPE-FALLBACK fix-round-1 — 部署后 boot sync 立即用新命名逻辑跑，在旧裸名数据 + 新前缀逻辑间建了 6 个 orphan guangtech/* 模型（活跃 channel 仍挂裸名）→ 一次性重命名脚本需增强为"删 orphan 再 rename"
- 写入：`harness/deploy-patterns.md` §6（配套幂等数据修复脚本 + 自愈 orphan + 先部署后修数据 + dry-run 默认 + Reviewer 复验 dry-run=0）

## [2026-06-14 已同步 v0.9.22] Evaluator §2：E2E 测试素材必须先校验 content-type
- 来源：BL-VISION-INPUT L2 — 首轮图片 E2E 400，排查发现 wikipedia 缩略图 URL 返回 HTML 非 JPEG，base64 后上游正确判 invalid image（坏 fixture 伪装成产品 bug），换真实 JPEG 后全 200
- 写入：`harness/evaluator.md` §2 编写测试（fixture 用 file/magic-bytes 验类型 + URL 选稳定源 + 优先自带 base64）

## [2026-06-05 已同步 v0.9.21] Planner 铁律 8：spec 引用外部模型/服务做 E2E acceptance 前必须验证真实可用
- 来源：BL-IMG-PERSIST-GCS fix_round2 — acceptance 要求 seedream-3 http 上游 E2E 200，但 channel realModelId 是模型名（非 ep-ID，火山恒 404）+ 在下线名单 → 返工
- 写入：`harness/planner.md` §铁律 8（本地 enabled≠运行时可用；火山须 ep-ID + 非下线名单；高风险实测）。注：同步时 reset 本地 stale clone 到 origin/main(v0.9.20)，旧线存于 backup 分支

## [2026-06-05 已同步 v0.9.21] Generator §9：Next standalone request.url origin 取监听地址，反代后须从 forwarded headers 推导
- 来源：BL-IMG-PERSIST-GCS fix_round1 — 图片代理签发 origin=0.0.0.0:3000 → 客户端不可达 → Codex FAIL（修复 resolveRequestOrigin，commit 400f2af）
- 写入：`harness/generator.md` §9（X-Forwarded-Host/Proto 推导 + resolveRequestOrigin 范式 + nginx 前置）

<!-- ================= 已同步到 harness-template（归档区，历史） ================= -->

## [2026-05-02 已同步 v0.9.10] Planner 铁律 1 细化：jsonb 字段空判定三态枚举
- 来源：BL-SYNC-INTEGRITY-PHASE2 F-SI2-02 fix-round-1。spec D2 给的 `(sellPrice IS NULL OR sellPrice::text = '{}')` 漏了 JSON null 分支（jsonb null 的 `::text` 是 `'null'`），Codex 注入 `sellPrice: null` fixture 触发计数错配 → FAIL → fix-round-1
- 写入：`harness/planner.md` §铁律 1 末尾"jsonb 字段空判定三态枚举（2026-05-02 细化）"小节（四态判定表 + SQL 模板 + 抽 SQL helper 推荐）+ 自检 checklist 铁律 1 项追加 "jsonb/json 字段空判定 SQL 已枚举所有可能 shape"

## [2026-05-02 已同步 v0.9.9] Planner 铁律 1 细化：内部命名 grep 确认存在
- 来源：BL-SYNC-INTEGRITY-PHASE1 F-SI-02 acceptance #5 写"dev/scratch DB 上跑 syncSingleProvider"，但该函数/endpoint/npm script 项目内全部不存在；Generator 用 mock provider 走 runModelSync 全路径代偿，Codex 通过 — 没 fix-round 但浪费推理时间
- 写入：`harness/planner.md` §铁律 1 末尾追加"内部命名 grep 确认（2026-05-02 细化）"小节 + 模板 grep 命令；自检 checklist 铁律 1 项强化为"acceptance 引用的所有内部命名已 grep 确认存在；不存在的命名不进 acceptance"

## [2026-05-01 已同步 v0.9.8] Planner 铁律 1.8：复用现有 UI 组件时 acceptance 不得超出组件实际能力
- 来源：BL-ADMIN-ALIAS-UX-PHASE1 F-AAU-09 acceptance 字面要求"含 pageSize 选择器"，但已复用的 `src/components/pagination.tsx` 不渲染该 UI；Generator 按字面要求在设计稿加 selector → Codex FAIL → fix-round-1
- 写入：`harness/planner.md` §铁律 1.8（spec 引用复用组件必须先 Read props + 渲染分支，acceptance 仅可描述真实能力；业务需要新功能必须拆独立 feature）+ 自检 checklist 1.8 项

## [2026-05-01 已同步 v0.9.8] Generator 行为：Manual 任务归属（不得甩 Codex / 必须自完成或显式标注遗留）
- 来源：BL-ADMIN-ALIAS-UX-PHASE1 F-AAU-09 fix-round-1，Generator 上轮把截图任务在 session_notes 写"留 Codex 补"，触发 round-1 阻断
- 写入：`harness/generator.md` §4.1 "Manual 任务归属（2026-05-01 采纳）"（含禁止做法 + 4 类应对策略 — playwright 自动化/请求用户/显式标注遗留/cp 复用 Codex 产物）

## [2026-05-01 已同步 v0.9.7] Planner 铁律 1.5 范围细化：grep 不得限定单一子目录
- 来源：BL-HEALTH-PROBE-MIN-TOKENS F-HPMT-01（Planner 自检：spec D2 把 grep 限到 src/lib/health/，漏掉 src/lib/api/post-process.ts:216 同款 max_tokens:1）
- 写入：`harness/planner.md` §铁律 1.5（追加 "grep 范围必须是全项目代码" 小节 + 模板扩展为 src/+scripts/+docs/specs/+ 同义命名展开）+ 自检 checklist 强化

## [2026-04-30 已同步 v0.9.6] Planner 铁律 1.5：枚举/字段扩展必须前置 grep 所有反向消费点
- 来源：BL-EMBEDDING-MVP fix-round-2（isImage 硬编码漏定义）
- 写入：`harness/planner.md` §铁律 1.5 + 自检 checklist

## [2026-04-30 已同步 v0.9.6] Planner 铁律 1.6：调研类 spec 假设必须枚举三类根因
- 来源：BL-RECON-FIX-PHASE2 F-RP-01（漏掉「单价错位」根因）
- 写入：`harness/planner.md` §铁律 1.6 + 自检 checklist

## [2026-04-30 已同步 v0.9.6] Planner 铁律 1.7：跨 cron 周期 acceptance 必须标注时序口径
- 来源：BL-RECON-FIX-PHASE2 F-RP-04 tc8（T+1 出账假设未对齐）
- 写入：`harness/planner.md` §铁律 1.7 + 自检 checklist

## [2026-04-30 已同步 v0.9.6] Planner 铁律 3：不得在 acceptance 中将测试编写任务塞给 Generator
- 来源：BL-RECON-UX-PHASE1 F-RC-01（角色边界冲突两难）
- 写入：`harness/planner.md` §铁律 3 + 自检 checklist

## [2026-04-26 已同步 v0.9.5] Planner 铁律 1.4：周期性后台任务对数据的覆写必须显式 + 回归保护
- 来源：BL-IMAGE-PRICING-OR-P2 mid-impl 裁决（buildCostPrice 回归）
- 写入：`harness/planner.md` §铁律 1.4 + 自检 checklist

## [2026-04-26 已同步 v0.9.5] Generator CLI 脚本退出前 close 所有外部连接
- 来源：BL-IMAGE-PRICING-OR-P2 fix_round 2 Path A #4（pricing CLI Redis hang）
- 写入：`harness/generator.md` §测试相关经验

## [2026-04-25 已同步 v0.9.4] Generator 单测 mock 层级 — 穿透多层转换类修复
- 来源：BL-IMAGE-PARSER-FIX fix round 1
- 写入：`harness/generator.md` §测试相关经验；`harness/evaluator.md` §4 评分标准（核查 mock 层级）

## [2026-04-25 已同步 v0.9.4] Planner 铁律 1.2：acceptance 证据来源限定
- 来源：BL-IMAGE-PARSER-FIX round 3 adjudication
- 写入：`harness/planner.md` §铁律 1.2 + 自检 checklist；`harness/evaluator.md` §4（运维依赖触发 adjudication）

## [2026-04-25 已同步 v0.9.4] Planner 铁律 1.3：定量 acceptance 零基线边界 + 证据组合满足
- 来源：BL-IMAGE-PARSER-FIX round 3 adjudication round 2
- 写入：`harness/planner.md` §铁律 1.3 + 自检 checklist

## [2026-04-20 已同步 v0.9.3] Next.js App Router 私有目录约定
- 来源：BL-FE-QUALITY fix round 5
- 写入：`harness/generator.md` §前端相关经验

## [2026-04-20 已同步 v0.9.3] Mid-Impl 裁决机制（fixing 阶段规格冲突）
- 来源：BL-SEC-POLISH Round 1
- 写入：`harness/pre-impl-adjudication.md` §10 附录

## [2026-04-20 已同步 v0.9.3] Planner 铁律 1.1：实现形式 vs 语义意图
- 来源：BL-FE-PERF-01 F-PF-02
- 写入：`harness/planner.md` §铁律 1.1

## [2026-04-20 已同步 v0.9.3] Planner 铁律自检规则
- 来源：BL-SEC-POLISH（铁律 2.1 反例第二次发生）
- 写入：`harness/planner.md` §铁律自检规则

## [2026-04-20 已同步 v0.9.3] dynamic import 模块边界
- 来源：BL-FE-PERF-01 F-PF-01
- 写入：`harness/generator.md` §前端相关经验


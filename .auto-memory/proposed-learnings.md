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

<!-- ================= 已同步到 harness-template（归档区） ================= -->

## [2026-07-12 已同步 v1.0.1] deploy §7 不可逆生产迁移剧本（换机 / 换部署模型）
- 来源：BL-PROD-MIGRATE-DEPLOYSVR（GCP 原生 PM2 `34.180.93.185` → deploysvr `194.238.26.173` 容器化，用户手工验收）
- 写入：`patterns/deploy-patterns.md` §7（7.1 演练→预置→最短窗口→回滚四段剧本 + Planner checklist / 7.2 凭据 sha256 逐字一致红线 + env_file 引号坑 / 7.3 容器化 Next.js standalone HOSTNAME=0.0.0.0 坑）+ README deploy 触发扩展 + CHANGELOG v1.0.1

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


## [2026-07-22] Claude CLI — 来源：BL-IMG-I2I-VISION F-IIV-04/05

**类型：** 新规律

**内容：** Generator 自测外部上游集成的可复用模式：经 SSH 从生产 DB 提取 provider 真实 key（不落本地文件/git）→ 在本地测试库镜像 provider/channel/alias 配置 → 本地网关直连真实上游做全链路 E2E（含计费/日志断言）。比"只 tsc+build 等 Codex 验收"提前一轮发现契约问题（本批次借此实测出 seedream-4-5 chat API 整体不可用、1024 尺寸恒拒等 4 个上游事实）。

**建议写入 harness-template 的：** `harness/generator.md`（自测手段一节）

**状态：** 待确认

## [2026-07-22] Claude CLI — 来源：BL-IMG-I2I-VISION F-IIV-05

**类型：** 铁律补充

**内容：** 「外部契约前置实测」铁律的例外处理：探测被环境问题（如上游账户欠费）而非契约问题阻断时，不能直接判"探测不通→收缩"，应升级为用户裁决点——标准协议（如 OpenAI 兼容格式）可特批免探直上、验收阶段补真实验证；非标准/自有格式上游仍必须实测。裁决与理由记入 ops 文档。

**建议写入 harness-template 的：** `harness/planner.md` 或 `docs/`（铁律 L1 的例外条款）

**状态：** 待确认

## [2026-08-07] Claude CLI — 来源：BL-IMG-GUANGTECH-CHANNEL fix_round 1（首验 4 条缺陷全部同源）

**类型：** 铁律补充

**内容：** **护栏不能写成给人看的文字。** 本轮 4 条缺陷收敛到同一反模式：我在 `runProbe` 里打印「探测失败的模型不得 --apply」却不在代码里拦（上游 502 后照样落库并 exit 0）；在 generator_handoff 里写「部署后记得跑回填脚本」却不做成迁移（同一个坑此前已踩过三次，那个回填脚本至今没人跑过）。讽刺的是这个批次本身就是在修同款病根——sync 跳过 IMAGE channel 只 console.log，导致三个模型静默不可用一个月。自检问题应该是「这条规则如果没人读会怎样」，而不是「我说清楚了吗」。可执行判据：任何以「记得/须/不得」开头写给人的约束，都要问一遍能否降级成代码强制（非零退出、DB 约束、数据迁移、测试）；不能则必须说明为什么不能。

**建议写入 harness-template 的：** `harness/generator.md`（交付自检清单）+ 铁律补充

**状态：** 待确认

## [2026-08-07] Claude CLI — 来源：BL-IMG-GUANGTECH-CHANNEL GTI-DEF-03

**类型：** 新坑

**内容：** 「外部契约前置实测」这条已有铁律，**强度取决于验什么，不是验没验**。本轮我确实按 seedream-3 的沉淀打了真实生图请求，但 probe 只统计 base64 解码后的字节数就判 PASS——等于只验证了「上游回了点什么」，没验证「回的是不是我们声称的那个东西」。结果请求 1024x1024、上游实回 1254x1254，而 alias 对外声明 supported_sizes=1024x1024，`list_models`/MCP 的能力元数据失真。修法是解析图片头拿真实像素，不匹配则**整个字段不出现**（注意：写空数组也是一种声明）。推广：实测断言必须覆盖「我们准备对外声明的每一个属性」，而不只是「调用成功」。

**建议写入 harness-template 的：** `harness/generator.md` 或 `docs/`（外部契约实测的验收强度）

**状态：** 待确认

## [2026-08-07] Claude CLI — 来源：BL-IMG-GUANGTECH-CHANNEL GTI-DEF-04（本项目具体设计，待用户裁决）

**类型：** 新规律

**内容：** 通知偏好「新事件类型必须回填」这个坑已在本项目踩到第四次（CHANNEL_DOWN 三兄弟 / AUTH_ALERT / SYNC_RECONCILE_SKIPPED / SYNC_IMAGE_CHANNEL_SKIPPED）。本轮用数据迁移堵住了当次，但根因是 `dispatcher.sendNotification` 对「无偏好行」静默丢弃——只要这个语义不变，每加一个事件类型就要记得配一次迁移。**彻底解法是让 dispatcher 在无偏好行时回退到 `defaultNotificationPreferences(role)`，那样永远不需要回填。** 代价：会改变所有事件类型的投递行为（存量 5 个 ADMIN 会开始收到此前静默的 CHANNEL_DOWN 等），超出本批次范围，需用户裁决后单独立批。

**建议写入 harness-template 的：** 不入框架（本项目具体设计），仅供 done 阶段转 backlog

**状态：** 待确认

## [2026-08-07] Claude CLI — 来源：BL-IMG-GUANGTECH-CHANNEL 生产部署（本项目 deploy.yml 缺陷）

**类型：** 新坑

**内容：** `deploy.yml` 的回滚点逻辑在「连续用 `latest` 部署」这一常态路径下失效：`previous_tag` 取自 `.env` 的 `IMAGE_TAG`，而它长期就是 `latest`，与新 `IMAGE_TAG` 相等 → `if [ "$previous_tag" != "$IMAGE_TAG" ]` 不成立 → **`.deploy-state/last-known-good-tag` 永远不写**。同时 `docker compose pull` 会把本地 `latest` 标签指向新镜像，旧镜像变悬空，随后的 `docker image prune -f` 直接清除 → 回滚目标彻底消失。本次部署前手工 `docker tag ...:latest ...:rollback-<上一版 commit>` 才保住回滚能力。建议改法：pull 之前先把当前 `latest` 解析成 digest 并打上 `rollback-<当前部署 commit>` 标签，再写入 `last-known-good-tag`；或 build-push 阶段就让部署始终使用 sha tag 而非 `latest`。

**建议写入 harness-template 的：** 不入框架（本项目 CI 具体缺陷），仅供转 backlog

**状态：** 待确认

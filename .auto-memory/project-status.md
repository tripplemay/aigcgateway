---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-IMG-I2I-VISION**（**building**，2026-07-22 起）— 图生图 + MCP 图片输入。8 features（7 generator + 1 codex），spec `docs/specs/BL-IMG-I2I-VISION-spec.md`。角色默认映射：Kimi generator / Reviewer evaluator。
- 三项用户裁决：并入 BL-MCP-VISION-INPUT（已出 backlog）；generations 扩展 image 参数 + /v1/images/edits 兼容壳都做；首发 seedream-4-5 + OpenRouter gpt-5-image / gemini-3-pro-image。
- 关键设计：capability 定名 `image_to_image`（避开 reinferAllCapabilities 的 image_input→vision 剥离）；F-IIV-04/05 上游契约**前置实测硬门禁**（seedream-3 教训），探测不通收缩不硬上；源图仅 URL+base64 不 fetch 不落盘，限制复用 vision-limits。

## 上一批次遗留（仍有效）
- **BL-PROD-MIGRATE-DEPLOYSVR**（done 2026-07-12）：生产已迁 deploysvr(194.238.26.173，容器化)，`https://aigc.guangai.ai` LIVE。旧机 aigc 4 实例 STOPPED 冻结可回滚（DNS 旧值 34.180.93.185）、kolmatrix+staging 仍 online。**🔴P6 旧机退役**待用户择机 + **kolmatrix 迁移**（单列）。deploy pipeline secrets 已配但未实跑。

## Backlog（3 条）
- **BL-SEC-PAY-DEFERRED**（critical-deferred）— 支付 webhook 验签 + 幂等 CAS
- **BL-SEC-INFRA-GUARD-FOLLOWUP**（high-deferred）— Next.js 16 跨大版本迁移
- **BL-FE-DS-SHADCN**（low-deferred）— shadcn 大批量采用率提升

## 参考
- 生产：`https://aigc.guangai.ai`。图片能力勘察报告结论已固化进 spec §2（vision REST 已有 / MCP 缺 / i2i 全空白 / 存储计费门禁地基全就绪）。

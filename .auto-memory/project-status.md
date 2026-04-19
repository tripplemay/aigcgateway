---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-DATA-CONSISTENCY：`done`**（F-DC-04 验收 16/16 PASS，已签收）
- Path A 进度 8/11

## 本批次验收结论（Reviewer / 2026-04-19）
- migration/索引/FK/expiresAt：全部通过
- notifications TTL：null 保留 + BALANCE_LOW 默认 expiresAt 通过
- public templates latest 分页：EXPLAIN 含 `LIMIT 5`
- 回归：build / tsc / vitest（134/134）通过
- MCP：`list_public_templates` 分页返回正常（pageSize=5）
- 生产只读预检：`template_steps=45`，`notifications=0`
- 报告：`docs/test-reports/bl-data-consistency-verifying-local-2026-04-19.md`
- signoff：`docs/test-reports/BL-DATA-CONSISTENCY-signoff-2026-04-19.md`

## 上一批次（BL-FE-QUALITY done）
- fix_rounds=5，round8 签收完成

## Framework 仓库分离（v0.9.0）
- 项目不再维护 `framework/` 子目录（迁移到 `tripplemay/harness-template`）

## 生产状态
- main 已包含 BL-FE-QUALITY + BL-DATA-CONSISTENCY，待用户触发 deploy

## Path A 剩余路线
- P1：INFRA-RESILIENCE 1.5d
- P2：SEC-POLISH 1.5d / INFRA-ARCHIVE 1d / FE-DS-SHADCN 2d
- 延后：INFRA-GUARD-FOLLOWUP 2-3d / PAY-DEFERRED 1-2d

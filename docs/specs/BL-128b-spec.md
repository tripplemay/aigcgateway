# BL-128b — 首发 6 个中文营销模板录入规格

**批次：** BL-128b（运维性质，不走 harness 状态机）
**依赖：** BL-128a（4 个营销分类 seed，已完成 + 生产生效）
**创建：** 2026-04-17
**Prompt 源：** `docs/specs/template-library-content-batch-01-spec.md` 第 2-7 节（原创）

## 归属

- projectId：`cmnrcbgvm0007bn5ajdyybs2u`（复用现有 "System Templates" 项目，codex-admin 名下）
- 初始状态：`isPublic=false`（冒烟测试通过后手动 UPDATE 发布）

## 模型分配（8 Actions）

| Action 名 | 对应模板 | Step | alias | 理由 |
|---|---|---|---|---|
| marketing-wechat-moment | #1 朋友圈 | — | `deepseek-v3` | 4 provider 冗余，中文强 |
| marketing-comment-reply-classify | #2 评论回复 | 1 | `qwen3.5-flash` | 轻量 JSON 分类 |
| marketing-comment-reply-generate | #2 评论回复 | 2 | `deepseek-v3` | 中文生成 |
| marketing-ip-persona | #3 IP 人设 | — | `deepseek-v3` | Markdown 结构化 |
| marketing-short-video-outline | #4 短视频 | 1 | `qwen3.5-flash` | JSON 大纲 |
| marketing-short-video-script | #4 短视频 | 2 | `deepseek-v3` | 表格+长文 |
| marketing-product-showcase | #5 产品力 | — | `deepseek-v3` | JSON+证据链 |
| marketing-private-domain | #6 私域 | — | `qwen3.5-plus` | 策略长文，双 provider |

## 变量 UX 规则

- schema 保持生产现状 `{name, required, description, defaultValue?}`
- 枚举型字段：把所有可选值写进 `description`，格式 "字段释义。可选值：val1（中文名）/ val2（中文名）..."
- `defaultValue`：长度/时长/数字类给合理缺省；枚举给首选项
- 描述用中文（UI 渲染用），`name` 保留英文 key（prompt 引用用）

## 幂等逻辑（seed 脚本）

- Template 查重 key：`(projectId, name)`，已存在则 skip template + 所有 step
- Action 查重 key：`(projectId, name)`，已存在则复用 action.id（不重建 version）
- TemplateStep 查重 key：`(templateId, order)`，由 DB unique 约束保证
- **只追加不修改不删除**：若发现已存在数据结构有误，需人工 SQL 清理后重跑

## 冒烟测试（方案 B）

1. seed 脚本执行完，6 模板入库 `isPublic=false`
2. 用 admin API Key（`pk_aa6b13...`）通过 MCP `run_template` 逐个运行
3. 每个模板提供 1 组示例变量，输出贴在会话里人工审查
4. 全部通过后 `UPDATE templates SET "isPublic"=true WHERE name IN (...)` 批量发布
5. 任一模板输出不达标 → 迭代 prompt 在 seed 脚本中修正 → 重新 seed（用 `npx tsx scripts/seed-marketing-templates.ts --force-action=<name>` 强制重建该 action's version —此开关只在本次允许）

## 回滚

- 软下线：`UPDATE templates SET "isPublic"=false WHERE name IN (...)`（保留用户 fork 链）
- 硬删除：仅当没有任何 fork 时才执行 `DELETE FROM templates WHERE name = '...'`

## 示例变量（冒烟测试用）

| 模板 | 示例变量 |
|---|---|
| #1 朋友圈 | `content_type=result_feedback`, `raw_material="张姐孩子原本英语每次月考 70 分，用我们方法后三个月连续 90+"`, `brand_tone="克制真实"`, `length=100` |
| #2 评论回复 | `platform=xhs`, `post_context="小红书发的日常穿搭，讲秋冬叠穿"`, `comment_text="请问那件大衣在哪里买的呀？"` |
| #3 IP 人设 | `creator_bio="前大厂运营 8 年，做过 3 家母婴品牌 0-1"`, `target_audience="一二线职场妈妈 30-40 岁"`, `differentiation="用商业视角做育儿"` |
| #4 短视频 | `video_type=种草`, `hook_angle="反常识：奶瓶不刷洗越干净"`, `duration_sec=30`, `cta="评论区留言领清单"` |
| #5 产品力 | `product_name="AI 写作助手"`, `usp_list="多模型切换、团队共享、计费透明"`, `scenario="创业团队日常营销内容生产"`, `format="短视频脚本"` |
| #6 私域 | `biz_stage="1-10"`, `user_segment="老客"`, `goal="复购"`, `constraints="2 人运营团队，月预算 3000"` |

## 部署流程

1. 本地：`npx tsx scripts/seed-marketing-templates.ts` 在 dev DB 跑一次确认无错
2. push main（CI 跑 lint+tsc）
3. 用户 SSH 生产：`cd /opt/aigc-gateway && npx tsx scripts/seed-marketing-templates.ts`
4. 本会话用 MCP 冒烟测试 6 模板
5. 通过后 `UPDATE ... isPublic=true`

# TEMPLATE-LIBRARY-CONTENT-BATCH-02 规格

**批次：** BL-128c（运维性质，不走 harness 状态机）
**依赖：** BL-128b 首发 6 模板已生产（2026-04-17 seed + `isPublic=true`）
**创建：** 2026-04-17
**情报源：** `docs/research/stableisland/flow-catalog.md` 第 D/F 节 + `docs/specs/template-library-content-batch-01-spec.md` 冒烟瑕疵
**原则：** Prompt 全部原创。新模板覆盖 Batch 01 未触及的"爆款逆向 / 长访谈消化 / 线下探访"三条独立强需求。同步修两处首轮冒烟瑕疵。**所有 Action name 必须中文**（用户规则，2026-04-17 起强制）。

## 一、范围总览

| 子项 | 类型 | 对象 | 交付方式 |
|---|---|---|---|
| P1 | 修瑕疵 | #2 评论回复 Step 2（品牌臆造） | 新建 ActionVersion + 切 activeVersionId |
| P2 | 修瑕疵 | #4 短视频 Step 2（代码块格式） | 新建 ActionVersion + 切 activeVersionId |
| P3 | 新模板 | 抖音爆款链接仿写 | seed 脚本追加 |
| P4 | 新模板 | 访谈切片（2-step） | seed 脚本追加 |
| P5 | 新模板 | 线下探访内容策划 | seed 脚本追加 |
| P6 | 数据整改 | BL-128b 8 个 action 英文名改中文 | `UPDATE actions SET name='<中文>' WHERE name='<英文>'` |

所有 6 子项均属"纯运维"范围，不改产品代码、不新增 Action 或 Template 字段。

### 1.1 Action 命名规则（本批次开始强制）

所有 `actions.name` 必须为中文，且：
- 单 Action 模板：action 名 = template 名（例："抖音爆款链接仿写"）
- 多 Step 模板：action 名 = "模板名-步骤名"（例："访谈切片-选题大纲"、"访谈切片-成片脚本"）
- 长度控制在 20 字以内
- 不使用下划线/横线之外的符号

---

## 二、P1 — 修复 #2 评论回复"品牌臆造"

### 2.1 问题回顾
现有 `marketing-comment-reply-generate`（Step 2）在 `intent=question` 时，模型倾向**编造**产品名、价格、发货时间、门店位置等帖子上下文未提供的事实，误导用户。

### 2.2 根因
原 prompt 的 `question` 策略写"直接给答案+补充一个细节"，但**未设护栏**要求"答案必须基于 `post_context` 已有信息"。模型填空式补全自然会臆造。

### 2.3 修复后的 user 段（覆盖第 215-218 行附近的 content 字符串）

```
平台：{{platform}}
帖子上下文：{{post_context}}
评论：{{comment_text}}
评论分析：{{previous_output}}

【平台风格规则】
- xhs（小红书）：亲切、多用"姐妹/宝子"称呼、emoji 点缀、长度 20-50 字
- bilibili（B 站）：对等、可玩梗、避免过度营销、长度 15-40 字
- weixin_shipin（视频号）：克制、长辈友好、避免网络热梗、长度 20-60 字
- douyin（抖音）：节奏快、可直接引导行动、长度 10-30 字

【意图策略】
- question: 仅基于 post_context 已有信息作答；若 post_context 不含所需事实，回复应为引导路径（"私信了/主页有详情/评论区置顶"），**严禁**编造产品名、价格、规格、发货时间、库存、折扣码、门店位置、联系方式
- criticism: 先承认再解释，不辩论
- praise: 具体回应而非泛"谢谢"
- suggestion: 表明收到并说明处理节奏
- spam: reply 字段输出空字符串（表示不回复）
- unrelated: 简短引回主题
- fan_interaction: 回应关注点，适度预告

【通用红线（所有意图通用）】
- 不得出现 post_context 与 comment_text 中均未提及的具体数字、日期、价格、品牌名、人名、地名
- 不得承诺未授权的售后政策（退换/赔付/优先发货等）
- 不确定时改说引导路径，而不是填空
- 风格必须匹配平台规则，长度在区间内

输出 JSON 数组（不要 markdown 代码块），需求 3 条候选：
[{"reply": "...", "style_note": "<为什么这么回，一句话>"}, ...]
```

### 2.4 发布方式
1. seed 脚本写入新 `marketing-comment-reply-generate` 的 ActionVersion（versionNumber+1）
2. UPDATE `actions.activeVersionId` 指向新 version（回滚时可切回旧版本）
3. 冒烟：`post_context="小红书穿搭笔记"`, `comment_text="多少钱？"` — 期望输出引导而非臆造价格

---

## 三、P2 — 修复 #4 短视频脚本"代码块格式"

### 3.1 问题回顾
现有 `marketing-short-video-script`（Step 2）用 ` ```markdown ... ``` ` 或 ` ```...``` ` 包住整张表格，违反"输出 Markdown 表格（不要代码块）"要求，导致前端渲染失败。

### 3.2 根因
单一负向约束（"不要代码块"）对部分模型无效，需用**强化三连击**：(a) 正向示例 (b) 显式标记不允许出现的字符 (c) 输出前自检。

### 3.3 修复后的 user 段

```
基于以下大纲生成完整可拍摄脚本。

大纲：{{previous_output}}

【输出格式规范 — 必须逐条遵守】
1. 直接从表头 "| 时长" 开始输出，首字符必须是 "|"
2. 禁止在输出中出现任何 ``` 反引号序列（三个反引号）
3. 禁止输出 "```markdown" / "```md" / "```" 等任何形式的代码块标记
4. 表格之前不得有"以下是…"这类前言
5. 表格之后不得有任何说明、注释或总结

【正确示例开头】
| 时长 | 画面描述 | 口播台词 | 字幕/花字 | 镜头建议 |
|---|---|---|---|---|
| 0-3s | ... | ... | ... | ... |

【错误示例（禁止输出）】
```markdown
| 时长 | ... |
```

【列内容要求】
- 画面描述：主体+动作+环境三元素，不用"一个人在说话"
- 口播台词：口语化，单句 ≤20 字
- 字幕/花字：提炼口播关键词，≤8 字
- 镜头建议：景别（近/中/全）+ 运镜（固定/推拉/跟随）
- 全片不得出现"大家好我是…"式套话

【输出前自检】
生成完毕后在内心复核一次：第一个字符是不是 "|"？输出里有没有 ``` 序列？有则重写。
```

### 3.4 发布方式
同 2.4，新建 ActionVersion，切换 activeVersionId，保留旧版回滚路径。冒烟用 BL-128b 现成样例（video_type=种草，hook_angle="反常识：奶瓶不刷洗越干净"）。

---

## 四、P3 — 新模板：抖音爆款链接仿写

### 4.1 定位
创作者粘贴一条爆款抖音视频的 URL + 文案摘录 + 自己的产品/身份 → 输出同款结构的仿写脚本。

### 4.2 结构
| 项 | 值 |
|---|---|
| Template 名 | 抖音爆款链接仿写 |
| Action name | `抖音爆款链接仿写`（单 Action，同 Template 名） |
| category | `short-video` |
| 结构 | Sequential（1 Action） |
| 推荐模型 | `deepseek-v3`（中文语感 + 长文本遵从） |

### 4.3 变量

| name | required | 类型 | description |
|---|---|---|---|
| `reference_url` | true | multiline | 爆款视频 URL（用于记录，不爬取） |
| `reference_script` | true | multiline | 爆款视频的文案原文/口播逐字稿（用户自行复制粘贴） |
| `my_identity` | true | multiline | 自己的身份/产品/差异化（30-100 字） |
| `learn_angle` | false | text | 想学什么：`hook`（开场钩子） / `structure`（结构）/ `ending`（结尾钩子）/ `all`（全要）。默认 `all` |

### 4.4 Prompt 设计

```
system: 你是短视频文案模仿专家。给你一条爆款视频的文案，你要拆解它的"为什么爆"，再用同样的内在结构为用户的身份/产品重写一条。你只输出仿写稿和拆解，不写前言。

user:
【参考爆款文案】
{{reference_script}}
（原视频 URL：{{reference_url}}，仅用于记录）

【用户身份/产品】
{{my_identity}}

【学习焦点】
{{learn_angle}}

【任务拆三步】

## 一、爆款结构拆解（≤150 字）
用 Markdown bullet 列出以下 4 点：
- 钩子类型：识别开场 3 秒用了哪种钩子（反常识 / 数字悬念 / 角色反转 / 利益预告 / 冲突 / 其他）
- 主体结构：主体内容的展开逻辑（问题-方案 / 故事推进 / 对比 / 步骤列举 / 观点论证）
- 结尾驱动：结尾 CTA 用了什么动机（稀缺 / 互动 / 共鸣 / 好奇 / 利益）
- 情绪曲线：整段文案的情绪起伏（平-高-平 / 逐渐高涨 / 起伏交替）

## 二、仿写稿（完整口播逐字稿）
按原爆款**相同的内在结构**，为用户身份改写一条。
- 时长估算与原视频相当（按字数：中文 4 字/秒）
- 禁止抄原句子或原产品名
- 保留钩子类型 + 主体结构 + 结尾驱动三要素
- 结尾 CTA 必须和 {{my_identity}} 强相关，不要通用"点赞关注"

## 三、拍摄备注（3-5 条）
- 画面氛围建议
- 语速节奏建议
- 一个和爆款视觉风格呼应的画面 idea
- 一个"避免翻车"的执行提醒

【红线】
- 不虚构参考视频的数据（播放量/点赞数/博主身份）
- 不宣称"照着拍必爆"、"XX 天涨粉"等量化承诺
- 若 {{reference_script}} 字数 <30，输出"参考文案过短无法做结构分析，请提供完整逐字稿"后终止
```

### 4.5 示例变量（冒烟用）
- `reference_url=https://www.douyin.com/video/xxxxx`
- `reference_script="你知道为什么你家猫总是半夜拆家吗？不是它调皮，是白天你给它喂错了饭。我朋友家猫原来每天半夜 3 点准时抓门，改了这一件事，现在一觉睡到天亮..."`
- `my_identity="做儿童英语启蒙的前英语老师，主张场景化输入，不鸡娃"`
- `learn_angle=all`

---

## 五、P4 — 新模板：访谈切片

### 5.1 定位
把一段长访谈/播客/直播转写稿（1k-10k 字）消化成可独立传播的短视频切片选题 + 每条切片的成片脚本。
典型用户：知识主播、自媒体团队、内容二创团队。

### 5.2 结构（2-step）
| Step | Action 名 | 模型 | 作用 |
|---|---|---|---|
| 1 | `访谈切片-选题大纲` | `qwen3.5-flash` | 从长文本里挑 3-5 个切片选题（JSON） |
| 2 | `访谈切片-成片脚本` | `deepseek-v3` | 为每个切片生成成片脚本（Markdown） |

### 5.3 Template 级变量

| name | required | description |
|---|---|---|
| `transcript` | true | 访谈/播客逐字稿，纯文本 |
| `guest_identity` | true | 被访者身份 1-2 句（影响切片标题风格） |
| `platform_target` | false | 目标平台 xhs/douyin/bilibili/weixin_shipin。默认 douyin |
| `slice_count` | false | 期望切片数，默认 3，上限 5 |

### 5.4 Step 1 Prompt

```
system: 你是短视频选题编辑，擅长从长访谈里挑出"可独立成片"的金句/观点/故事段落。只输出 JSON，不写前言。

user:
【访谈逐字稿】
{{transcript}}

【被访者身份】
{{guest_identity}}

【目标平台】
{{platform_target}}

【任务】
从逐字稿里挑 {{slice_count}} 个最适合独立成片的选题。每个切片必须：
- 有明确的"单一信息点"（观点 / 故事 / 反常识 / 金句）
- 原稿摘录片段控制在 80-200 字（可剪辑到 30-60 秒视频）
- 标题适配 {{platform_target}} 平台调性

【平台标题规则】
- douyin: 12-20 字，钩子感强，可用"？"/"！"
- xhs: 15-25 字，可带 emoji 1 个，多用"我"第一人称
- bilibili: 18-30 字，可略带知识感或玩梗
- weixin_shipin: 12-20 字，克制，不用网络热词

【输出 JSON 结构】
{
  "slices": [
    {
      "title": "<适配平台的标题>",
      "hook_type": "question|surprise|story|quote|conflict",
      "source_excerpt": "<从 transcript 精确摘录 80-200 字>",
      "core_message": "<一句话，这条切片想让观众记住什么>",
      "estimated_seconds": <整数，30-60>
    }
  ]
}

【禁止】
- 不编造 transcript 里不存在的内容
- 不合并两段不相连的话（切片必须是单一段落或自然连续段落）
- 不使用"震惊""万万没想到"等标题党模板
```

### 5.5 Step 2 Prompt

```
system: 你是短视频成片编剧，把切片选题扩展成可直接拍摄/剪辑的脚本。

user:
切片大纲：{{previous_output}}
被访者身份：{{guest_identity}}
目标平台：{{platform_target}}

为 previous_output.slices 里每个切片生成一份脚本。

【输出 Markdown，每条切片用二级标题分节】

## 切片 1：<title>

- 时长：<s> 秒
- 钩子类型：<hook_type>

### 口播脚本（成片逐字稿）
（基于 source_excerpt 改写，去掉口头语/重复，保留核心信息。不得添加 transcript 未提供的事实）

### 封面文字建议（3 条候选）
1. ...
2. ...
3. ...

### 剪辑备注
- 原素材起止：（估算在原访谈中的位置）
- 建议加字幕类型：关键词字幕 / 全字幕 / 混合
- 一个可以做"钩子前置"的剪辑建议

---

## 切片 2：<title>
（同结构）

【格式红线】
- 整份输出**禁止出现 ``` 反引号序列**
- 直接从 "## 切片 1" 开始，不要前言
- 不合并切片，每条独立成段
```

### 5.6 示例变量（冒烟用）
- `transcript`: 粘贴一段 500-1000 字的真实播客节选（Planner 提供示例备用，详见附录）
- `guest_identity="前阿里产品经理，现做独立 SaaS 创业"`
- `platform_target=douyin`
- `slice_count=3`

---

## 六、P5 — 新模板：线下探访内容策划

### 6.1 定位
为计划去线下探店/探厂/探活动的创作者输出一份可执行的内容策划。覆盖"去之前要问什么/拍什么"+"回来怎么剪"。

### 6.2 结构
| 项 | 值 |
|---|---|
| Template 名 | 线下探访内容策划 |
| Action name | `线下探访内容策划`（单 Action，同 Template 名） |
| category | `short-video` |
| 结构 | Sequential（1 Action） |
| 模型 | `deepseek-v3` |

### 6.3 变量

| name | required | description |
|---|---|---|
| `visit_target` | true | 探访对象。例："深圳华强北手机元器件市场" / "一家本地咖啡烘焙工坊" / "某母婴展会 A 馆" |
| `creator_angle` | true | 创作者角度。例："做数码测评的博主" / "母婴选品博主" / "餐饮创业观察者" |
| `time_budget` | false | 现场时间预算。例："2 小时" / "半天" / "一整天"。默认 "2 小时" |
| `output_format` | false | 期望输出形式 `short-video` / `graphic-image` / `long-video`。默认 short-video |

### 6.4 Prompt

```
system: 你是线下探访类内容策划师，专门为创作者设计"去现场之前的准备清单 + 现场拍摄清单 + 回来的剪辑方案"。你输出 Markdown，不写任何前言或套话。

user:
探访对象：{{visit_target}}
创作者角度：{{creator_angle}}
现场时间预算：{{time_budget}}
期望输出形式：{{output_format}}

按以下四个固定章节输出，**禁止添加其他章节**：

## 一、核心主题判断（≤100 字）
基于 {{creator_angle}} 去看 {{visit_target}}，这次探访最该记录什么"只有现场能看到/问到"的信息。一段话直接陈述，不列 bullet。

## 二、出发前 — 信息清单（5-8 条）
要提前查证/联系/确认的事。每条一行，以"□ "开头。包含至少：
- 1 条"和探访对象预约/沟通的话术样例"
- 1 条"可能被拒绝拍摄的场景预判 + 预案"
- 1 条"合规提示"（肖像权 / 商业机密 / 未成年 / 食品卫生 / 广告法）

## 三、现场 — 拍摄 & 提问清单

### 3.1 必拍镜头（6-10 条）
表格：| 镜头类型 | 具体内容 | 时长建议 | 镜头难度（低/中/高）|
其中必须包含：
- 至少 1 个"关系镜头"（人 × 场景）
- 至少 1 个"细节特写"
- 至少 1 个"不可预期的空境素材"

### 3.2 必问问题（5-8 条）
用于和现场对象对话。要求每条问题：
- 不是"是/否"能回答的
- 带有 {{creator_angle}} 视角的独特性
- 避免刻奇和猎奇

## 四、回来后 — 剪辑方案（按 {{output_format}}）

### 4.1 信息密度分配
时长轴占比：钩子（? %）/ 核心发现（? %）/ 反差或冲突（? %）/ 结尾观点（? %）

### 4.2 封面/标题候选（3 条）
每条不超过 20 字。

### 4.3 可能翻车的 3 个点 + 应对
每条格式："<翻车点> → <应对>"。至少包含：
- 一个内容类翻车（节奏/信息量/偏题）
- 一个关系类翻车（被拍摄对象不满 / 平台违规）

【禁止】
- 不使用"沉浸式 vlog / 干货满满 / 保姆级" 等 3 年陈词
- 不把任何一条写成"具体取决于现场情况"这类空话
- 不臆造 visit_target 内部的品牌、人名、数字、场景细节
```

### 6.5 示例变量
- `visit_target="北京胡同里的一家手工皮具工作室"`
- `creator_angle="做小生意观察的自媒体人，主打创业者日常"`
- `time_budget="半天"`
- `output_format=short-video`

---

## 七、P6 — BL-128b 的 8 个英文 action 改中文

### 7.1 背景
BL-128b 的 8 个 action 均使用英文 slug 命名（违反本批次起强制的"Action name 必须中文"规则）。

### 7.2 改名映射（权威表，seed 脚本与数据整改必须一致）

| 当前英文 name | 目标中文 name | 所属模板 |
|---|---|---|
| `marketing-wechat-moment` | `朋友圈文案六型生成` | #1 朋友圈（单 Action） |
| `marketing-comment-reply-classify` | `评论回复-意图分类` | #2 评论回复 Step 1 |
| `marketing-comment-reply-generate` | `评论回复-候选生成` | #2 评论回复 Step 2 |
| `marketing-ip-persona` | `IP 人设画像生成` | #3 IP 人设（单 Action） |
| `marketing-short-video-outline` | `短视频脚本-三幕大纲` | #4 短视频 Step 1 |
| `marketing-short-video-script` | `短视频脚本-成片脚本` | #4 短视频 Step 2 |
| `marketing-product-showcase` | `产品力可视化脚本` | #5 产品力（单 Action） |
| `marketing-private-domain` | `私域营销策略方案` | #6 私域（单 Action） |

### 7.3 执行方式

在 seed 脚本的 patch 模式里追加一段 rename 操作：

```ts
// 伪代码
const RENAME_MAP = [
  { from: "marketing-wechat-moment", to: "朋友圈文案六型生成" },
  // ...其余 7 条
];
for (const { from, to } of RENAME_MAP) {
  await prisma.action.updateMany({
    where: { projectId: PROJECT_ID, name: from },
    data: { name: to },
  });
}
```

### 7.4 影响分析

| 引用方 | 是否受影响 | 说明 |
|---|---|---|
| `TemplateStep.actionId` | ✗ 不受影响 | 用 id 外键，不按 name 引用 |
| `ActionVersion.actionId` | ✗ 不受影响 | 同上 |
| MCP `list-templates` / `get-template-detail` | ✓ 展示变化 | 返回值里 actionName 从英文变中文，前端/用户直接看到更清晰 |
| 外部集成 / 硬编码引用 | ✓ 需排查 | seed 脚本自身是 dedup by name，改名后重跑会把 rename 后的视为新 action 再次创建 → **必须在 seed 脚本的 "已存在则跳过" 逻辑之前执行 rename** |
| 数据库 unique 约束 | ✓ 需确认 | `@@unique([projectId, name])` 存在，如存在同名冲突会失败（本批次新增的 3 个模板 name 与改后的 8 条无冲突，已核对） |

### 7.5 seed 脚本执行顺序（严格）

```
1. RENAME 阶段：先把 BL-128b 的 8 个 English→Chinese
2. UPSERT 阶段：再 seed BL-128c 的 3 个新模板（4 个新 action）
3. VERSION 阶段：最后为重命名后的 "评论回复-候选生成" 和 "短视频脚本-成片脚本" 创建新 ActionVersion（P1/P2）
4. ACTIVATE 阶段：UPDATE activeVersionId 切换到新 version
```

### 7.6 回滚

若改名后发现某外部依赖硬编码英文，回滚动作：
```sql
UPDATE actions SET name = '<原英文>' WHERE name = '<中文>' AND "projectId" = 'cmnrcbgvm0007bn5ajdyybs2u';
```

---

## 八、分类与归属

| 模板 | category | 来源分类 |
|---|---|---|
| P3 抖音爆款仿写 | `short-video` | 已有 |
| P4 访谈切片 | `short-video` | 已有 |
| P5 线下探访 | `short-video` | 已有 |

生产 `short-video` 分类目前只有 Batch 01 的 #4，本批次加 3 条后 `list_public_templates(category="short-video")` 将返回 4 条，曝光密度合理。

---

## 九、实施步骤

### 9.1 代码侧（Planner 起草，Generator/运维执行）
统一扩展 `scripts/seed-marketing-templates.ts`（或拆成 `scripts/seed-marketing-templates-batch-02.ts`），按严格顺序执行 4 个阶段：

1. **RENAME 阶段（P6）**：先 rename BL-128b 8 个英文 action → 中文（映射见第七章 7.2）
   - `UPDATE actions SET name = <中文> WHERE projectId = '<SYSTEM_TEMPLATES>' AND name = <英文>`
   - 必须在 UPSERT 之前，否则幂等 dedup 会按英文名找不到而重复创建
2. **UPSERT 阶段（P3-P5）**：追加 3 个 Template 常量 + 4 个新 Action
   - 新 action name 全中文（第四/五/六章已定义）
   - 现有幂等逻辑 (projectId, name) dedup 保证重跑安全
3. **VERSION 阶段（P1/P2）**：为 `评论回复-候选生成` 和 `短视频脚本-成片脚本`（改名后的新 name）各创建一个新 ActionVersion（messages = 新 prompt）
   - 操作前读取并记录旧 `activeVersionId` 到日志文件（为回滚留证据）
4. **ACTIVATE 阶段（P1/P2）**：UPDATE `actions.activeVersionId = <新 version.id>`

### 9.2 运维侧（用户执行）
1. 本地 dev：先备份 actions 表快照 `pg_dump ... -t actions > backup.sql`
2. 本地 dev：`npx tsx scripts/seed-marketing-templates.ts` — 4 阶段一次跑完
3. 本地 dev：用 MCP `run_template` 跑冒烟（见 9.3 检查点）
4. push main → CI 通过
5. 生产：SSH → 备份 actions → 跑 seed 脚本
6. 生产冒烟 3 新 + 2 补丁，通过后 `UPDATE templates SET "isPublic"=true WHERE name IN (...)`

### 9.3 冒烟检查点

| 子项 | 检查 |
|---|---|
| P1 | 评论 "多少钱？" + 空 post_context → 回复应是"私信了/主页有详情"，不含编造价格 |
| P2 | 输出首字符是 `|`，全文无 ``` 出现 |
| P3 | 输出三段分节（拆解 / 仿写 / 备注），仿写不含参考文案原句 |
| P4 | Step1 JSON 解析成功、slices 数 == slice_count；Step2 全文无 ``` |
| P5 | 输出严格四章节，不多不少；每个必填子项齐全 |
| P6 | `SELECT name FROM actions WHERE "projectId"='<SYSTEM_TEMPLATES>'` 返回全中文，无英文 slug 残留 |

---

## 十、验收标准

- [ ] BL-128b 8 个 action name 全部变更为中文，SQL 查询验证 0 条残留英文
- [ ] 3 个新模板全部 seed 到 `Template` 表（`isPublic=true`，`status=ACTIVE`，`category=short-video`）
- [ ] 3 个新模板的 action name 均为中文，长度 ≤ 20 字
- [ ] 3 个新模板冒烟测试通过，输出贴至 session 供人工复核
- [ ] #2 / #4 新 ActionVersion 已创建，`actions.activeVersionId` 已切换
- [ ] MCP `list_public_templates(category="short-video")` 返回 4 条（原 1 + 新 3）
- [ ] MCP `get-template-detail` 返回的 actionName 均为中文
- [ ] 运维日志记录：rename 前后映射 + 旧 activeVersionId（方便回滚）+ 新 activeVersionId + 切换时间
- [ ] 本规格 + seed 脚本 diff 进入同一 commit，commit 信息带 `BL-128c`

---

## 十一、回滚方案

| 场景 | 动作 |
|---|---|
| 某个新模板冒烟不通过 | `UPDATE templates SET "isPublic"=false WHERE name='<name>'` 软下线，prompt 迭代后重新切 activeVersion |
| P1/P2 新 version 输出变差 | `UPDATE actions SET "activeVersionId"='<old_id>' WHERE name IN ('评论回复-候选生成','短视频脚本-成片脚本')` 一键回退 |
| P6 改名后发现外部依赖英文 | `UPDATE actions SET name = '<英文>' WHERE name = '<中文>'` 按映射表反向执行 |
| 整批次回滚 | 上述三条合并执行（ACTIVATE → RENAME → 软下线新模板） |

---

## 十二、不在本批次

- 不做文件/图片输入类模板（证据链规划等）— 留 `BL-128d`，依赖产品侧新增 `file` 变量类型
- 不做 Template 的 i18n 英文版（首发仍限中文）
- 不新增分类（`short-video` 已能覆盖本批次全部 3 个新模板）
- 不做评分驱动的 prompt 调优（BL-128b decisions 约定 2 周后观察 F-TL-04 评分数据再决定是否做，本批次只修已确认的 #2 #4 瑕疵）

---

## 附录：P4 示例 transcript（备冒烟用）

> （此处可粘贴一段 500-1000 字的公开播客节选，Planner 补充前请确认来源可引用。或用本项目真实团队访谈存档。）

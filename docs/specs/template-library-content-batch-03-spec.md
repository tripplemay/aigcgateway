# TEMPLATE-LIBRARY-CONTENT-BATCH-03 规格

**批次：** BL-128d（运维性质，不走 harness 状态机）
**依赖：** BL-128c 3 个模板已上线（2026-04-17）
**创建：** 2026-04-17
**情报源：** `docs/research/stableisland/flow-catalog.md` 第 C/F 节
**原则：** Prompt 全部原创。补齐 IP pipeline 后半段（有了人设→持续输出→访谈反哺），同时加一条对谈策划。**所有 Action name 中文**（2026-04-17 起强制）。

## 一、范围

| 子项 | 类型 | 对象 | 交付方式 |
|---|---|---|---|
| P1 | 新模板 | IP 内容规划（4 周滚动选题） | seed 脚本追加 |
| P2 | 新模板 | IP 采访方案生成器 | seed 脚本追加 |
| P3 | 新模板 | 对谈内容策划 | seed 脚本追加 |

全部单 Action、纯文本输入、复用现有 seed 脚本，无代码改动。

---

## 二、P1 — IP 内容规划

### 2.1 定位
给定 IP 人设（来自 BL-128b #3 `IP 人设画像生成` 的输出）+ 周期（4 周） → 输出每周 3-5 条选题的滚动内容规划表。解决"有人设但不知道持续发什么"的问题。

### 2.2 结构
| 项 | 值 |
|---|---|
| Template name | IP 内容规划 |
| Action name | `IP 内容规划`（单 Action） |
| category | `ip-persona` |
| 模型 | `deepseek-v3` |

### 2.3 变量

| name | required | description |
|---|---|---|
| `persona_summary` | true | IP 人设摘要（可粘贴 BL-128b #3 输出，或手写 200-400 字） |
| `target_platform` | true | 主发平台 xhs/douyin/bilibili/weixin_shipin/wechat_moment。决定选题调性 |
| `current_stage` | true | 账号阶段 `0-1`（0-500 粉 起号期）/ `1-10`（500-5000 涨粉期）/ `10-100`（5000+ 稳定期） |
| `weeks` | false | 规划周数，默认 4，上限 8 |
| `constraints` | false | 约束（时间/资源/已拍素材/不做某类）。留空默认"无特殊约束" |

### 2.4 Prompt

```
system: 你是 IP 运营规划师，专门为个人 IP 设计可执行的滚动内容规划。你输出 Markdown 表格 + 简短策略总结，不写前言。

user:
【IP 人设】
{{persona_summary}}

【主发平台】
{{target_platform}}

【账号阶段】
{{current_stage}}

【规划周数】
{{weeks}}

【约束】
{{constraints}}

【输出结构 — 严格三部分】

## 一、本期策略一句话
≤60 字，指出本期 {{weeks}} 周内容的主轴（例："前 2 周验证'商业视角育儿'能否破圈，后 2 周聚焦高转化金句"）。

## 二、{{weeks}} 周滚动选题表

表头：| 周 | 日期（留空待填） | 内容类型 | 选题标题 | 钩子类型 | 发布节奏 |

其中：
- 每周 3-5 条选题，{{weeks}}=4 时共 12-20 条
- 内容类型限于：观点 / 故事 / 教程 / 热点借势 / 问答回复 / 对比评测 / 幕后日常
- 钩子类型：反常识 / 数字悬念 / 身份反转 / 利益预告 / 冲突 / 共鸣共情
- 发布节奏：用 "W{周号}D{日号}" 标注（W1D1 / W1D3 / W2D2 ...）
- 整体节奏需考虑平台调性和 {{current_stage}} 阶段特征

## 三、阶段性调整策略
三小节分别列 3 条：
### 3.1 如何判断某条选题是否跑通
（给出 2-3 个可观测的数据指标）
### 3.2 哪些选题需要马上调整
（明确的"止损信号"）
### 3.3 下一期（第 {{weeks}}+1 周起）的候补方向
（3 条延展选题，给下一批次预留入口）

【阶段约束】
- 0-1 阶段：优先选题密度，单一赛道反复强化认知
- 1-10 阶段：开始分支尝试，但不超过 2 个主线
- 10-100 阶段：允许多线并行，加入商业内容（产品介绍、课程）

【平台约束】
- xhs: 40% 生活日常 / 40% 干货 / 20% 故事
- douyin: 50% 钩子强型 / 30% 反转 / 20% 共鸣
- bilibili: 50% 长知识 / 30% 观点 / 20% 幕后
- weixin_shipin: 50% 中长故事 / 30% 观点 / 20% 生活
- wechat_moment: 60% 结果反馈 / 20% 产品 / 20% 价值观（对标 BL-128b #1 六型）

【禁止】
- 不照抄 {{persona_summary}} 的句子，必须产出新选题
- 不使用"打造 / 赋能 / 闭环 / 爆款套路"等 3 年陈词
- 不出现日期硬编码（用 W1D1 相对时间）
```

### 2.5 示例变量

```
persona_summary: "前大厂运营 8 年，做过 3 家母婴品牌 0-1。现做自媒体主张'用商业视角做育儿'，不鸡娃。面向一二线职场妈妈 30-40 岁。"
target_platform: "xhs"
current_stage: "1-10"
weeks: "4"
constraints: "每周不超过 3 条视频（精力有限），剩余用图文"
```

---

## 三、P2 — IP 采访方案生成器

### 3.1 定位
用 IP 的身份 + 采访目标 → 输出一份可直接拿去采访嘉宾的结构化提纲。本条与 BL-128c P4 `访谈切片` 形成闭环：这条做事前策划，切片做事后消化。

### 3.2 结构
| 项 | 值 |
|---|---|
| Template name | IP 采访方案生成器 |
| Action name | `IP 采访方案生成器`（单 Action） |
| category | `ip-persona` |
| 模型 | `deepseek-v3` |

### 3.3 变量

| name | required | description |
|---|---|---|
| `interviewer_identity` | true | 采访者（我方 IP）身份 1-2 句。决定提问视角 |
| `interviewee_profile` | true | 被访者背景 100-300 字（职业/成就/擅长话题/可能敏感点） |
| `interview_goal` | true | 本次采访的首要目标。可选值：`deep_profile`（人物深访）/ `expertise_extraction`（专业观点萃取）/ `story_collection`（故事素材收集）/ `tension_exploration`（争议话题探讨） |
| `duration_min` | false | 采访时长（分钟），默认 60，上限 180 |
| `delivery_format` | false | 后续交付形式 `long_video` / `short_clips` / `article` / `podcast`。默认 `short_clips` |

### 3.4 Prompt

```
system: 你是资深访谈编导。你的采访提纲有三个特点：(1) 每个问题都服务于特定叙事/信息目标 (2) 问题排列有情绪曲线设计 (3) 预判敏感区并给出预案。你只输出 Markdown 提纲，不写前言。

user:
【采访者（我方 IP）】
{{interviewer_identity}}

【被访者背景】
{{interviewee_profile}}

【首要目标】
{{interview_goal}}

【时长】
{{duration_min}} 分钟

【后续交付形式】
{{delivery_format}}

【输出严格按以下四章节，禁止添加其他章节】

## 一、采访核心主张（≤80 字）
一段话，回答"这次采访最想让观众/读者记住的一个信息点是什么"。

## 二、情绪曲线与节奏设计
三幕式：
- **预热段（前 20%）**：轻松破冰 + 个人背景建立。2-3 题
- **深潜段（中间 60%）**：围绕 {{interview_goal}} 的核心提问。根据时长分配题数（60 分钟约 8-10 题，120 分钟约 15-18 题）
- **收束段（最后 20%）**：反思 / 推荐 / 给观众寄语。2-3 题

## 三、具体提问清单（按顺序编号）

表格：| 序号 | 段落 | 问题文本 | 信息/叙事目标 | 预期回答时长 | 敏感度（低/中/高）|

要求：
- 问题必须开放式（不是"是/否"能回答）
- 每题必须有明确的"信息/叙事目标"（不能写"增进了解"这种泛化表述）
- 高敏感度问题标注原因（隐私 / 商业机密 / 争议立场）+ 备用软化版本放在下方说明
- 提问顺序需匹配第二章节的情绪曲线
- 时长总和应接近 {{duration_min}} × 0.85（留 15% 给自然聊天延伸）

## 四、风险与预案

### 4.1 可能的"卡壳"点（列 3 条）
每条格式："<场景描述> → <应对话术>"。至少包含：
- 1 条"被访者拒绝某问题"
- 1 条"回答过于宣传化/公关口径"
- 1 条"偏离主题"

### 4.2 后续交付伏笔
根据 {{delivery_format}} 给出 3 条"采访时要特别留意什么素材"：
- long_video: 关注能独立成段的 5-10 分钟故事块
- short_clips: 关注 30-60 秒可切片的金句/反差场景
- article: 关注可直接引用的精彩原话
- podcast: 关注音频节奏的自然起伏（沉默/笑声/激动）

【禁止】
- 问题不得透露 {{interviewer_identity}} 的预设立场（除非 interview_goal=tension_exploration 要求立场碰撞）
- 不使用"您对…怎么看？""能不能分享一下？"等无目标模板提问
- 不虚构 {{interviewee_profile}} 未提供的身份细节
```

### 3.5 示例变量

```
interviewer_identity: "做小生意观察的自媒体人，主打创业者日常"
interviewee_profile: "上海独立咖啡馆 KuKa 创始人，90 后女性，原大厂产品经理。2023 年辞职开店，现有 2 家门店月流水 40 万。擅长选品和供应链。敏感话题：融资情况、与前同事的合作关系。"
interview_goal: "story_collection"
duration_min: "60"
delivery_format: "short_clips"
```

---

## 四、P3 — 对谈内容策划

### 4.1 定位
和 IP 采访（1 对 1 深访）不同，对谈是 2-3 人围绕话题的碰撞。典型场景：播客、直播连麦、视频号对谈节目。

### 4.2 结构
| 项 | 值 |
|---|---|
| Template name | 对谈内容策划 |
| Action name | `对谈内容策划`（单 Action） |
| category | `short-video` |
| 模型 | `deepseek-v3` |

### 4.3 变量

| name | required | description |
|---|---|---|
| `host_identity` | true | 主持人/召集人身份 |
| `guest_profiles` | true | 嘉宾名单（2-3 人）。每人 1-2 句介绍，用换行分隔 |
| `topic` | true | 对谈核心话题。一句话清晰陈述（不是"聊聊 AI"这种泛化） |
| `format` | false | 形式。可选值：`podcast_audio` / `video_roundtable` / `livestream`。默认 `podcast_audio` |
| `duration_min` | false | 总时长分钟，默认 60 |

### 4.4 Prompt

```
system: 你是对谈节目策划。你设计的对谈有三个特点：(1) 观点不抱团（故意让嘉宾有立场差异）(2) 节奏有明确的冲突-和解-深化 三幕 (3) 每个嘉宾都有"非说不可"的专属话题。你输出 Markdown，不写前言。

user:
【主持人】
{{host_identity}}

【嘉宾名单】
{{guest_profiles}}

【核心话题】
{{topic}}

【形式】
{{format}}

【时长】
{{duration_min}} 分钟

【输出结构，禁止增减章节】

## 一、立场分布图
- 针对 {{topic}}，给每位嘉宾（含主持人）预判一个立场坐标：
  - 在"保守 ↔ 激进"一维打一个位置（1-5 分）
  - 标注 1-2 个支撑该立场的事实依据
  - 同时识别"他们可能互相踩到的红线"
- 若所有人立场相同（都是 3 分或都是 5 分），必须输出一句话："建议增加一位立场 X 的嘉宾"并给出画像建议

## 二、对谈三幕结构

### 第一幕·破冰与立场亮相（前 20%）
表格：| 时间段 | 内容设计 | 主持人引导台词（口播样例） |
至少 2 行，且要让每位嘉宾有 1 次发声机会。

### 第二幕·观点碰撞（中间 60%）
表格同上。围绕 {{topic}} 设计 3-5 个"冲突点"：
- 每个冲突点要求至少 2 位嘉宾立场对立
- 冲突点不得低于人身攻击层面，必须围绕观点/事实/方法论
- 主持人引导台词要"激活分歧"而非"和稀泥"（例："A 说 ...B 您显然不同意，分歧的关键在哪？"）

### 第三幕·共识与延展（最后 20%）
表格同上。要素：
- 找到 1 条所有嘉宾都认同的"最小公约数"（即使立场不同也能共识的点）
- 每位嘉宾给 1 个"如果重来会怎么做"的回答机会
- 给听众/观众 1 个可带走的 action（读什么书、做什么事、关注什么信号）

## 三、嘉宾专属料包
为每位嘉宾设计：
- 1 个"只有他能回答的问题"（用其背景/经历）
- 1 个"他容易被忽略的隐性视角"（主持人埋伏笔用）
- 1 个"如果他太少说话时的救场话术"

## 四、风险与禁区
三条：
- 1 条平台合规（涉及 {{format}} 的特定规则，如 podcast 不宜政治；直播不宜医疗）
- 1 条嘉宾关系（避免让彼此处于公开商业冲突中的人同场）
- 1 条话题漂移预案（当话题被带偏时主持人如何拉回）

【禁止】
- 不使用"有请""欢迎"等老套主持用语
- 不让嘉宾扮演"观众需要的角色"（不预设立场后强推）
- 不虚构 {{guest_profiles}} 未提供的嘉宾背景
```

### 4.5 示例变量

```
host_identity: "做独立开发者观察的播客主持人，本人也做独立 SaaS"
guest_profiles: "嘉宾 A：前字节 PM，今年创业做 AI 工作流产品，MRR 2 万美元\n嘉宾 B：做独立游戏 10 年的老兵，坚持不融资"
topic: "独立开发者在 AI 时代：是该用 AI 加速迭代，还是警惕'快但薄'的陷阱"
format: "podcast_audio"
duration_min: "75"
```

---

## 五、实施步骤

### 5.1 代码（Planner 起草，Generator/运维执行）
扩展 `scripts/seed-marketing-templates.ts`：
- 追加 3 个 TemplateDef 常量（TEMPLATE_IP_CONTENT_PLAN / TEMPLATE_IP_INTERVIEW_PLAN / TEMPLATE_PANEL_CONTENT_PLAN）
- 在 TEMPLATES 数组追加
- 现有 4 阶段幂等逻辑（RENAME / UPSERT / VERSION / ACTIVATE）保证重跑安全；本批次只涉及 UPSERT 阶段

### 5.2 运维
1. 本地 dev：跑 seed 脚本确认 3 新模板落库
2. push main → CI
3. 生产：SSH → 跑 seed 脚本
4. MCP `run_action` 冒烟 3 模板（因 MCP `run_template` 在 nginx 60s 超时，单 Action 直接 run_action 更稳）
5. 通过后批量 `UPDATE "isPublic"=true`

### 5.3 冒烟检查点

| 子项 | 检查 |
|---|---|
| P1 | 输出严格 3 章节，第 2 章节表格含 12-20 条选题，发布节奏用 "W{}D{}" 相对格式 |
| P2 | 输出 4 章节，第 3 章节提问清单带敏感度标注，高敏感度问题有软化版本 |
| P3 | 输出 4 章节，第 1 章节立场分布有 1-5 分评分，第 2 幕至少 3 个冲突点 |

---

## 六、验收标准

- [ ] 3 新模板全部 seed 到 Template 表（`isPublic=true`，`status=ACTIVE`）
- [ ] ip-persona 分类 1→3，short-video 分类 5→6
- [ ] MCP `get_template_detail` 返回的 actionName 全部中文
- [ ] 3 模板冒烟通过，输出贴至 session 供人工复核
- [ ] 本规格 + seed 脚本 diff 在同一 commit，commit 信息带 `BL-128d`

---

## 七、不在本批次

- 不做文件/图片输入类模板（证据链规划等延后为 BL-128e）
- 不做 IP 与 short-video 分类下"产品视频脚本"类（与 BL-128b #4 短视频脚本重叠）
- 不做多人网络热点追踪类（平台风险高，合规成本高）

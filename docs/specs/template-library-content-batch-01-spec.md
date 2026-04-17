# TEMPLATE-LIBRARY-CONTENT-BATCH-01 规格

**目标：** 扩充公共模板库的中文本土营销类模板，填补当前 6 类模板（偏工具向）对**内容创作者/私域运营/小商家**场景的空白。
**情报输入：** `docs/research/stableisland/flow-catalog.md`（竞品 28 个流程的用例分布）
**原则：** Prompt 全部**原创**。所有设计基于公开用例描述，不引用任何第三方 prompt 原文。

## 一、选题（6 个首发模板）

| # | 模板 ID | 名称 | 分类 | Template 结构 | 变量 |
|---|---|---|---|---|---|
| 1 | `marketing-wechat-moment` | 朋友圈文案六型生成 | social-content | Sequential（1 Action） | content_type, raw_material, brand_tone, length |
| 2 | `marketing-comment-reply` | 社交平台评论区回复 | social-content | Sequential（2 Action: 分类 → 回复） | platform, post_context, comment_text |
| 3 | `marketing-ip-persona` | IP 人设画像生成 | ip-persona | Sequential（1 Action） | creator_bio, target_audience, differentiation |
| 4 | `marketing-short-video-script` | 短视频脚本 | short-video | Sequential（2 Action: 大纲 → 脚本） | video_type, hook_angle, duration_sec, cta |
| 5 | `marketing-product-showcase` | 产品力可视化脚本 | marketing-strategy | Sequential（1 Action） | product_name, usp_list, scenario, format |
| 6 | `marketing-private-domain` | 私域营销策略方案 | marketing-strategy | Sequential（1 Action） | biz_stage, user_segment, goal, constraints |

## 二、Template 1：朋友圈文案六型生成

### 2.1 定位
给运营者原始素材（聊天记录 / 反馈截图 OCR / 活动信息 / 产品卖点）+ 指定"内容型态"，产出可直接发布的朋友圈文案。

### 2.2 内容型态枚举（六型）
- `result_feedback`: 结果反馈类（客户成果展示）
- `behind_the_scenes`: 花絮类（日常/幕后）
- `activity`: 活动类（促销/预告/直播预热）
- `values`: 文化与价值观类（品牌理念输出）
- `product`: 产品型（卖点/功能）
- `credibility`: 企业基建/资质类（权威背书）

### 2.3 Prompt 设计（原创）

```
你是一位中文社交媒体内容编辑，专精微信朋友圈文案。

【创作目标】
根据运营者提供的原始素材，生成 {{content_type}} 类型的朋友圈文案。

【类型释义】
- result_feedback: 以客户/用户获得的具体结果为核心，用"原本—变化"结构呈现真实感
- behind_the_scenes: 以日常/工作片段为切入，体现团队人味与专业度
- activity: 以限时性和稀缺性为动因，结构为"事件—价值—行动"
- values: 以价值主张为主线，避免说教，用行动或故事承载观点
- product: 以具体场景+卖点为核心，一段文案聚焦一个决策痛点
- credibility: 以可验证的事实（认证/数量/时长/合作方）建立信任

【风格约束】
- 品牌调性：{{brand_tone}}（若为空默认"克制、真实、去广告化"）
- 目标长度：{{length}} 字左右（默认 80-150）
- 禁止使用：夸张修辞（全网最/震惊体）、空洞形容词（优质/卓越/领先）、营销黑话
- 要求：口语化但不口水化；可以有一个悬念或反转；结尾自然收束，不强行喊话

【输入素材】
{{raw_material}}

【输出要求】
直接输出正文，不要任何前言、解释、说明、"这是朋友圈文案："之类的套话。
若素材不足以支撑 {{content_type}} 型态，用一句话指出缺失信息即可。
```

### 2.4 模型选择
推荐 `claude-sonnet-4` 或 `gpt-4o`（中文语感 + 长文本遵从）；`haiku` 走低价档。

---

## 三、Template 2：社交平台评论区回复

### 3.1 定位
用户粘贴一条具体评论 + 帖子上下文 + 平台，输出 3-5 条候选回复。第一个 Action 做意图分类，第二个 Action 基于意图生成回复。

### 3.2 Action A — 评论意图分类

```
你是社交平台评论区运营专家，当前平台：{{platform}}（小红书 / B站 / 视频号 / 抖音）

分析这条评论的**首要意图**，从以下分类中选择且只选一个：
- question: 问产品/使用/价格/购买路径
- praise: 纯赞美，无具体内容
- criticism: 负面评价或吐槽
- suggestion: 提建议或改进意见
- spam: 水军/灌水/广告
- unrelated: 话题偏离
- fan_interaction: 表达关注/期待内容

帖子上下文：{{post_context}}
评论内容：{{comment_text}}

只输出一个 JSON 对象：
{"intent": "<分类>", "sentiment": "pos|neu|neg", "needs_private_chat": true|false}
```

### 3.3 Action B — 生成回复候选

```
你是 {{platform}} 评论区运营人员。基于以下信息生成 3 条回复候选。

帖子上下文：{{post_context}}
评论：{{comment_text}}
评论分析：{{previous_output}}

【平台风格规则】
- 小红书：亲切、多用"姐妹/宝子"称呼、emoji 点缀、长度 20-50 字
- B 站：对等、可玩梗、避免过度营销、长度 15-40 字
- 视频号：克制、长辈友好、避免网络热梗、长度 20-60 字
- 抖音：节奏快、可直接引导行动、长度 10-30 字

【意图策略】
- question: 直接给答案+补充一个细节，不反问
- criticism: 先承认再解释，不辩论
- praise: 具体回应而非泛"谢谢"
- suggestion: 表明收到并说明处理节奏
- spam: 输出空字符串（不回复）
- unrelated: 简短引回主题

输出 JSON 数组：
[{"reply": "...", "style_note": "<为什么这么回>"}, ...]
需求条数：3
```

---

## 四、Template 3：IP 人设画像生成

### 4.1 定位
创作者提供**自传式素材** + 目标受众 + 差异化主张 → 输出一份结构化的 IP 人设画像（可作为后续脚本/内容创作的锚点）。

### 4.2 Prompt 设计

```
你是资深人设策划，专门为个人 IP 设计"可持续输出的人设"。

输入：
- 创作者自述：{{creator_bio}}
- 目标受众：{{target_audience}}
- 差异化主张：{{differentiation}}

输出一份 Markdown 人设画像，必须包含以下 8 个字段，**禁止添加其他章节**：

1. **一句话自我介绍**（≤25 字，用"我是…+我帮…+实现…"公式）
2. **身份三维**：职业 / 生活状态 / 经验年限
3. **价值主张**：解决什么具体问题
4. **内容边界**：做什么 / 不做什么（各列 3 条）
5. **人设语气**：3 个关键词 + 1 个反例（"不是那种…"）
6. **视觉锚点**：可识别的穿着/场景/道具建议 3 个
7. **口头禅候选**：3 句（具体，非空泛鸡汤）
8. **起号前 10 条内容选题方向**（不写完整稿，每条一行）

禁止：
- 空泛形容词（真诚/专业/有温度）→ 必须具象
- 通用鸡汤口头禅 → 必须和身份强绑定
- 选题跳出差异化主张 → 必须围绕 {{differentiation}}
```

---

## 五、Template 4：短视频脚本（2-step）

### 5.1 Action A — 脚本大纲

```
你是短视频编剧。根据以下参数设计一个 {{duration_sec}} 秒视频的**三幕式大纲**：

视频类型：{{video_type}}（种草/教程/故事/观点/测评）
钩子角度：{{hook_angle}}
结尾 CTA：{{cta}}

输出 JSON：
{
  "hook": "前 3 秒开场（台词+画面）",
  "body": [
    {"beat": 1, "seconds": "3-8s", "purpose": "...", "content": "..."},
    ...
  ],
  "cta": "结尾 CTA（台词+画面）",
  "tension_check": "全片有无至少一个悬念/反转？是/否+位置"
}

beat 数量按 duration_sec 分配：15s=2个，30s=3个，60s=4-5个，>60s=6+。
```

### 5.2 Action B — 成片脚本

```
基于大纲生成完整可拍摄脚本。

大纲：{{previous_output}}

输出 Markdown 表格（不要代码块）：
| 时长 | 画面描述 | 口播台词 | 字幕/花字 | 镜头建议 |

要求：
- 画面描述具体到主体+动作+环境，不用"一个人在说话"
- 口播台词口语化，单句不超过 20 字
- 字幕提炼口播关键词，最多 8 字
- 镜头建议指定景别（近/中/全）+ 运镜（固定/推拉/跟随）
- 全片不出现"大家好我是…"式套话
```

---

## 六、Template 5：产品力可视化脚本

### 6.1 Prompt 设计

```
你是 B2B/B2C 产品营销内容策划。目标：把产品的卖点拆解成可视化的内容素材清单。

产品：{{product_name}}
核心卖点（USP 列表）：{{usp_list}}
目标使用场景：{{scenario}}
输出格式：{{format}}（短视频脚本 / 图文长文 / 直播话术 / 提案 PPT 大纲）

输出 JSON，字段：
{
  "evidence_chain": [
    {"usp": "<卖点>", "evidence_type": "数据|对比|场景|用户口碑|权威背书", "specific_evidence": "<具体可验证的事实>"}
  ],
  "narrative_arc": "<整体叙事主线，一句话>",
  "content_outline": [
    {"section": "...", "key_message": "...", "visual_hint": "<推荐的镜头/配图>"}
  ],
  "risk_flags": ["<可能触发广告法/虚假宣传/行业监管的风险点>"]
}

每个 USP 必须配至少一个**可验证**的 evidence（不接受"很多客户反馈好"这种无法核实的）。
risk_flags 若无风险，输出 []。
```

---

## 七、Template 6：私域营销策略方案

### 7.1 Prompt 设计

```
你是私域运营顾问。基于以下情况输出一份可执行的私域策略方案。

业务阶段：{{biz_stage}}（0-1 / 1-10 / 10-100）
用户分层：{{user_segment}}（新客 / 老客 / 沉睡 / 高价值）
首要目标：{{goal}}（获客 / 转化 / 复购 / 拉新转介）
约束条件：{{constraints}}（人力 / 预算 / 合规）

输出 Markdown，必须包含以下四个部分（禁止添加其他部分）：

## 一、核心判断
一段话（≤120 字），指出当前阶段的最大杠杆点。

## 二、触点设计
表格：| 触点 | 内容形式 | 频次 | 考核指标 |
至少 3 行，最多 5 行。触点限于：企业微信 / 社群 / 朋友圈 / 公众号 / 视频号 / 小红书账号。

## 三、30 天行动路径
按周拆分：Week 1 / Week 2 / Week 3 / Week 4
每周 3-5 个可执行动作，带负责角色（运营/客服/内容）。

## 四、风险与禁区
列出 3 条本方案容易踩的坑，以及如何规避。必须包含：
- 至少一条合规风险（广告法/微信生态封号/个保法）
- 至少一条人力可行性风险

禁止使用"打造/赋能/闭环/抓手/心智"等黑话。
```

---

## 八、实现阶段拆分（建议）

**批次一（本规格）：** 6 个首发模板接入，验证分类扩展与实际使用反馈
**批次二：** 根据首发模板的评分（F-TL-04 评分系统）迭代 prompt
**批次三：** 扩充到 15-20 个，覆盖"访谈切片""爆款逆向""探访内容"等长尾需求

## 九、验收标准

- [ ] 6 个模板全部 seed 到 `Template` 表（`isPublic=true`, `status=ACTIVE`）
- [ ] 每个模板绑定正确的 `category`（来自 `category-mapping.md` 新增项）
- [ ] `description` 字段清晰描述输入/输出预期
- [ ] `MCP list_public_templates(category="social-content")` 能返回对应子集
- [ ] 对每个模板跑一次冒烟测试（真实输入），输出质量通过 1 个人工检查
- [ ] 内容类 Template 的样例输入/输出存在 `scripts/test/template-content-smoke.ts`

## 十、不在本批次的工作

- 不做 UI 改动（模板卡片展示复用 F-TL-01 的现有渲染）
- 不做 RAG / 文件上传处理（我们 Template 暂不支持文件输入，首发模板全部基于文本输入）
- 不做多语言版本（首发仅中文模板，英文模板另开批次）

/**
 * 中文营销模板 seed 脚本（BL-128b + BL-128c）
 *
 * 用法：
 *   本地：npx tsx scripts/seed-marketing-templates.ts
 *   生产：ssh → cd /opt/aigc-gateway && npx tsx scripts/seed-marketing-templates.ts
 *
 * 执行四阶段（严格顺序，均幂等）：
 *   1. RENAME   — BL-128b 的 8 个英文 action name 改中文（P6）
 *   2. UPSERT   — seed 9 个 template（BL-128b 6 + BL-128c P3-P5 新增 3），已存在则跳过
 *   3. VERSION  — 为 P1/P2 涉及的 2 个 action 创建新 ActionVersion
 *   4. ACTIVATE — 切换这些 action 的 activeVersionId 指向新 version
 *
 * 幂等细节：
 *   - Template 查重 (projectId, name)，已存在跳过
 *   - Action 查重 (projectId, name)，已存在复用 id
 *   - RENAME 若目标中文名已存在说明已经跑过，skip
 *   - PROMPT_PATCHES 最新 version 的 changelog 匹配则跳过
 *
 * 详见 docs/specs/BL-128b-spec.md + docs/specs/template-library-content-batch-02-spec.md
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// System Templates 项目 ID（codex-admin 名下）
const PROJECT_ID = "cmnrcbgvm0007bn5ajdyybs2u";

interface VarDef {
  name: string;
  required: boolean;
  description: string;
  defaultValue?: string;
}

interface ActionDef {
  name: string;
  description: string;
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  variables: VarDef[];
}

interface TemplateDef {
  name: string;
  description: string;
  category: string;
  actions: ActionDef[];
}

// ============================================================
// Template 1：朋友圈文案六型生成
// ============================================================

const TEMPLATE_WECHAT_MOMENT: TemplateDef = {
  name: "朋友圈文案六型生成",
  description:
    "根据原始素材（客户反馈/活动/产品卖点）和内容型态，生成可直接发布的微信朋友圈文案。支持 6 种型态：结果反馈 / 花絮 / 活动 / 价值观 / 产品 / 资质。",
  category: "social-content",
  actions: [
    {
      name: "朋友圈文案六型生成",
      description: "朋友圈文案生成（六型）",
      model: "deepseek-v3",
      variables: [
        {
          name: "content_type",
          required: true,
          description:
            "内容型态。可选值：result_feedback（结果反馈-客户成果）/ behind_the_scenes（花絮-日常幕后）/ activity（活动-促销预告）/ values（价值观-品牌理念）/ product（产品-卖点功能）/ credibility（资质-权威背书）。",
          defaultValue: "result_feedback",
        },
        {
          name: "raw_material",
          required: true,
          description: "原始素材。例：客户反馈截图 OCR 文字 / 活动详情 / 产品卖点原文。",
        },
        {
          name: "brand_tone",
          required: false,
          description: "品牌调性。例：克制专业 / 温暖治愈 / 幽默亲切。留空默认克制真实去广告化。",
          defaultValue: "克制、真实、去广告化",
        },
        {
          name: "length",
          required: false,
          description: "目标长度（字数）。留空默认 120 字。",
          defaultValue: "120",
        },
      ],
      messages: [
        {
          role: "system",
          content:
            "你是一位中文社交媒体内容编辑，专精微信朋友圈文案。你只输出正文，不写任何前言或解释。",
        },
        {
          role: "user",
          content: `【创作目标】
根据运营者提供的原始素材，生成 {{content_type}} 类型的朋友圈文案。

【类型释义】
- result_feedback: 以客户/用户获得的具体结果为核心，用"原本—变化"结构呈现真实感
- behind_the_scenes: 以日常/工作片段为切入，体现团队人味与专业度
- activity: 以限时性和稀缺性为动因，结构为"事件—价值—行动"
- values: 以价值主张为主线，避免说教，用行动或故事承载观点
- product: 以具体场景+卖点为核心，一段文案聚焦一个决策痛点
- credibility: 以可验证的事实（认证/数量/时长/合作方）建立信任

【风格约束】
- 品牌调性：{{brand_tone}}
- 目标长度：{{length}} 字左右
- 禁止使用：夸张修辞（全网最/震惊体）、空洞形容词（优质/卓越/领先）、营销黑话
- 要求：口语化但不口水化；可以有一个悬念或反转；结尾自然收束，不强行喊话

【输入素材】
{{raw_material}}

【输出要求】
直接输出正文，不要任何前言、解释、说明、"这是朋友圈文案："之类的套话。
若素材不足以支撑 {{content_type}} 型态，用一句话指出缺失信息即可。`,
        },
      ],
    },
  ],
};

// ============================================================
// Template 2：社交平台评论区回复（2-step）
// ============================================================

const TEMPLATE_COMMENT_REPLY: TemplateDef = {
  name: "社交平台评论区回复",
  description:
    "粘贴一条评论+帖子上下文+平台，先自动识别评论意图，再生成 3 条符合平台风格的候选回复。支持小红书/B站/视频号/抖音。",
  category: "social-content",
  actions: [
    {
      name: "评论回复-意图分类",
      description: "评论回复 Step 1 — 意图分类",
      model: "qwen3.5-flash",
      variables: [
        {
          name: "platform",
          required: true,
          description:
            "平台。可选值：xhs（小红书）/ bilibili（B 站）/ weixin_shipin（视频号）/ douyin（抖音）。",
          defaultValue: "xhs",
        },
        {
          name: "post_context",
          required: true,
          description: "帖子上下文。用一段话描述帖子的主题、观点和目标人群。",
        },
        {
          name: "comment_text",
          required: true,
          description: "评论原文。直接粘贴需要回复的评论内容。",
        },
      ],
      messages: [
        {
          role: "system",
          content: "你是社交平台评论区运营专家，输出严格 JSON，不要任何解释或代码块标记。",
        },
        {
          role: "user",
          content: `当前平台：{{platform}}

分析这条评论的首要意图，从以下分类中选择且只选一个：
- question: 问产品/使用/价格/购买路径
- praise: 纯赞美，无具体内容
- criticism: 负面评价或吐槽
- suggestion: 提建议或改进意见
- spam: 水军/灌水/广告
- unrelated: 话题偏离
- fan_interaction: 表达关注/期待内容

帖子上下文：{{post_context}}
评论内容：{{comment_text}}

只输出一个 JSON 对象（不要 markdown 代码块）：
{"intent": "<分类>", "sentiment": "pos|neu|neg", "needs_private_chat": true|false}`,
        },
      ],
    },
    {
      name: "评论回复-候选生成",
      description: "评论回复 Step 2 — 生成候选回复",
      model: "deepseek-v3",
      variables: [], // 继承 template 级变量 + previous_output
      messages: [
        {
          role: "system",
          content: "你是熟悉各社交平台风格差异的评论区运营，按要求输出 JSON 数组。",
        },
        {
          role: "user",
          content: `平台：{{platform}}
帖子上下文：{{post_context}}
评论：{{comment_text}}
评论分析：{{previous_output}}

【平台风格规则】
- xhs（小红书）：亲切、多用"姐妹/宝子"称呼、emoji 点缀、长度 20-50 字
- bilibili（B 站）：对等、可玩梗、避免过度营销、长度 15-40 字
- weixin_shipin（视频号）：克制、长辈友好、避免网络热梗、长度 20-60 字
- douyin（抖音）：节奏快、可直接引导行动、长度 10-30 字

【意图策略】
- question: 直接给答案+补充一个细节，不反问
- criticism: 先承认再解释，不辩论
- praise: 具体回应而非泛"谢谢"
- suggestion: 表明收到并说明处理节奏
- spam: reply 字段输出空字符串（表示不回复）
- unrelated: 简短引回主题
- fan_interaction: 回应关注点，适度预告

输出 JSON 数组（不要 markdown 代码块），需求 3 条候选：
[{"reply": "...", "style_note": "<为什么这么回>"}, ...]`,
        },
      ],
    },
  ],
};

// ============================================================
// Template 3：IP 人设画像生成
// ============================================================

const TEMPLATE_IP_PERSONA: TemplateDef = {
  name: "IP 人设画像生成",
  description:
    "输入创作者自传式素材 + 目标受众 + 差异化主张，输出一份包含 8 个字段的结构化 IP 人设画像，可作为后续脚本/选题创作的锚点。",
  category: "ip-persona",
  actions: [
    {
      name: "IP 人设画像生成",
      description: "IP 人设画像（Markdown 结构化）",
      model: "deepseek-v3",
      variables: [
        {
          name: "creator_bio",
          required: true,
          description: "创作者自述。例：从业背景、经验年限、做过的项目、生活状态。",
        },
        {
          name: "target_audience",
          required: true,
          description: "目标受众画像。例：一二线职场妈妈 30-40 岁 / 小城创业女性。",
        },
        {
          name: "differentiation",
          required: true,
          description: "差异化主张。一句话描述和同类创作者的区别。",
        },
      ],
      messages: [
        {
          role: "system",
          content:
            "你是资深人设策划，专门为个人 IP 设计'可持续输出的人设'。只输出 Markdown 正文，严格按 8 个字段编排。",
        },
        {
          role: "user",
          content: `输入：
- 创作者自述：{{creator_bio}}
- 目标受众：{{target_audience}}
- 差异化主张：{{differentiation}}

输出一份 Markdown 人设画像，必须包含以下 8 个字段，禁止添加其他章节：

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
- 选题跳出差异化主张 → 必须围绕差异化主张展开`,
        },
      ],
    },
  ],
};

// ============================================================
// Template 4：短视频脚本（2-step）
// ============================================================

const TEMPLATE_SHORT_VIDEO: TemplateDef = {
  name: "短视频脚本",
  description:
    "两步生成：先根据时长和钩子角度设计三幕式大纲，再基于大纲扩展出完整可拍摄脚本（画面/口播/字幕/镜头）。",
  category: "short-video",
  actions: [
    {
      name: "短视频脚本-三幕大纲",
      description: "短视频脚本 Step 1 — 三幕式大纲",
      model: "qwen3.5-flash",
      variables: [
        {
          name: "video_type",
          required: true,
          description: "视频类型。可选值：种草 / 教程 / 故事 / 观点 / 测评。决定整体叙事节奏。",
          defaultValue: "种草",
        },
        {
          name: "hook_angle",
          required: true,
          description: "钩子角度。开场 3 秒怎么抓住观众，例：'反常识：奶瓶不刷洗越干净'。",
        },
        {
          name: "duration_sec",
          required: false,
          description:
            "视频时长（秒）。留空默认 30 秒。beat 数量按时长分配（15s=2，30s=3，60s=4-5）。",
          defaultValue: "30",
        },
        {
          name: "cta",
          required: true,
          description: "结尾 CTA 动作。例：'评论区留言领清单' / '点击关注看下集'。",
        },
      ],
      messages: [
        {
          role: "system",
          content: "你是短视频编剧，输出严格 JSON，不要任何代码块或解释。",
        },
        {
          role: "user",
          content: `根据以下参数设计一个 {{duration_sec}} 秒视频的三幕式大纲：

视频类型：{{video_type}}
钩子角度：{{hook_angle}}
结尾 CTA：{{cta}}

输出 JSON（不要 markdown 代码块）：
{
  "hook": "前 3 秒开场（台词+画面）",
  "body": [
    {"beat": 1, "seconds": "3-8s", "purpose": "...", "content": "..."}
  ],
  "cta": "结尾 CTA（台词+画面）",
  "tension_check": "全片有无至少一个悬念/反转？是/否+位置"
}

beat 数量按 duration_sec 分配：15s=2个，30s=3个，60s=4-5个，>60s=6+。`,
        },
      ],
    },
    {
      name: "短视频脚本-成片脚本",
      description: "短视频脚本 Step 2 — 成片脚本",
      model: "deepseek-v3",
      variables: [], // 继承 template 级变量 + previous_output
      messages: [
        {
          role: "system",
          content: "你是短视频成片编剧，把大纲扩展成可拍摄的 Markdown 表格脚本。",
        },
        {
          role: "user",
          content: `基于以下大纲生成完整可拍摄脚本。

大纲：{{previous_output}}

输出 Markdown 表格（不要代码块），列如下：
| 时长 | 画面描述 | 口播台词 | 字幕/花字 | 镜头建议 |

要求：
- 画面描述具体到主体+动作+环境，不用"一个人在说话"
- 口播台词口语化，单句不超过 20 字
- 字幕提炼口播关键词，最多 8 字
- 镜头建议指定景别（近/中/全）+ 运镜（固定/推拉/跟随）
- 全片不出现"大家好我是…"式套话
- 表格之外不要任何说明文字`,
        },
      ],
    },
  ],
};

// ============================================================
// Template 5：产品力可视化脚本
// ============================================================

const TEMPLATE_PRODUCT_SHOWCASE: TemplateDef = {
  name: "产品力可视化脚本",
  description:
    "把产品 USP 卖点拆解成可视化的内容素材清单，包含证据链、叙事主线、分章大纲和广告法风险提示。支持短视频/图文/直播/提案多种输出格式。",
  category: "marketing-strategy",
  actions: [
    {
      name: "产品力可视化脚本",
      description: "产品力可视化脚本（证据链 + 内容清单 + 风险提示）",
      model: "deepseek-v3",
      variables: [
        {
          name: "product_name",
          required: true,
          description: "产品名称。",
        },
        {
          name: "usp_list",
          required: true,
          description: "核心卖点列表。逗号分隔，例：'多模型切换, 团队共享, 计费透明'。",
        },
        {
          name: "scenario",
          required: true,
          description: "目标使用场景。例：'创业团队日常营销内容生产' / '小红书博主选品'。",
        },
        {
          name: "format",
          required: true,
          description:
            "输出格式。可选值：短视频脚本 / 图文长文 / 直播话术 / 提案 PPT 大纲。决定叙事节奏和内容密度。",
          defaultValue: "短视频脚本",
        },
      ],
      messages: [
        {
          role: "system",
          content:
            "你是 B2B/B2C 产品营销内容策划，输出严格 JSON，不要代码块。每个卖点必须配可验证的证据，不接受泛泛的'客户反馈好'。",
        },
        {
          role: "user",
          content: `目标：把产品的卖点拆解成可视化的内容素材清单。

产品：{{product_name}}
核心卖点（USP 列表）：{{usp_list}}
目标使用场景：{{scenario}}
输出格式：{{format}}

输出 JSON（不要 markdown 代码块）：
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

每个 USP 必须配至少一个可验证的 evidence（不接受"很多客户反馈好"这种无法核实的）。
risk_flags 若无风险，输出 []。`,
        },
      ],
    },
  ],
};

// ============================================================
// Template 6：私域营销策略方案
// ============================================================

const TEMPLATE_PRIVATE_DOMAIN: TemplateDef = {
  name: "私域营销策略方案",
  description:
    "输入业务阶段/用户分层/首要目标/约束，输出一份可执行的 30 天私域策略方案：核心判断 / 触点设计 / 周行动路径 / 风险禁区。",
  category: "marketing-strategy",
  actions: [
    {
      name: "私域营销策略方案",
      description: "私域营销策略方案（Markdown 四段式）",
      model: "qwen3.5-plus",
      variables: [
        {
          name: "biz_stage",
          required: true,
          description:
            "业务阶段。可选值：0-1（从 0 到 1 起步） / 1-10（验证扩规模） / 10-100（成熟扩张）。",
          defaultValue: "1-10",
        },
        {
          name: "user_segment",
          required: true,
          description: "用户分层。可选值：新客 / 老客 / 沉睡 / 高价值。决定触点内容和节奏。",
          defaultValue: "老客",
        },
        {
          name: "goal",
          required: true,
          description: "首要目标。可选值：获客 / 转化 / 复购 / 拉新转介。",
          defaultValue: "复购",
        },
        {
          name: "constraints",
          required: true,
          description: "约束条件。例：'2 人运营团队，月预算 3000' / '合规要求严，不能做拼团'。",
        },
      ],
      messages: [
        {
          role: "system",
          content:
            "你是私域运营顾问，输出 Markdown 四段式方案。严禁使用'打造/赋能/闭环/抓手/心智'等黑话。",
        },
        {
          role: "user",
          content: `基于以下情况输出一份可执行的私域策略方案。

业务阶段：{{biz_stage}}
用户分层：{{user_segment}}
首要目标：{{goal}}
约束条件：{{constraints}}

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

禁止使用"打造/赋能/闭环/抓手/心智"等黑话。`,
        },
      ],
    },
  ],
};

// ============================================================
// Template 7（BL-128c P3）：抖音爆款链接仿写
// ============================================================

const TEMPLATE_DOUYIN_VIRAL_COPY: TemplateDef = {
  name: "抖音爆款链接仿写",
  description:
    "粘贴一条爆款抖音视频的 URL + 文案原文 + 自己的身份/产品，输出三段式：爆款结构拆解 / 同款仿写逐字稿 / 拍摄备注。不爬取 URL，仅用于记录。",
  category: "short-video",
  actions: [
    {
      name: "抖音爆款链接仿写",
      description: "爆款结构拆解 + 同款仿写 + 拍摄备注（三段）",
      model: "deepseek-v3",
      variables: [
        {
          name: "reference_url",
          required: true,
          description: "爆款视频 URL（仅用于记录，不会实际访问）。",
        },
        {
          name: "reference_script",
          required: true,
          description: "爆款视频文案原文/口播逐字稿。用户自行复制粘贴，字数建议 ≥30 字。",
        },
        {
          name: "my_identity",
          required: true,
          description: "自己的身份/产品/差异化（30-100 字）。仿写稿将围绕此展开。",
        },
        {
          name: "learn_angle",
          required: false,
          description:
            "学习焦点。可选值：hook（开场钩子）/ structure（结构）/ ending（结尾钩子）/ all（全要）。留空默认 all。",
          defaultValue: "all",
        },
      ],
      messages: [
        {
          role: "system",
          content:
            "你是短视频文案模仿专家。给你一条爆款视频的文案，你要拆解它的'为什么爆'，再用同样的内在结构为用户的身份/产品重写一条。你只输出仿写稿和拆解，不写前言。",
        },
        {
          role: "user",
          content: `【参考爆款文案】
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
按原爆款相同的内在结构，为用户身份改写一条。
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
- 若 {{reference_script}} 字数 <30，输出"参考文案过短无法做结构分析，请提供完整逐字稿"后终止`,
        },
      ],
    },
  ],
};

// ============================================================
// Template 8（BL-128c P4）：访谈切片（2-step）
// ============================================================

const TEMPLATE_INTERVIEW_SLICE: TemplateDef = {
  name: "访谈切片",
  description:
    "把长访谈/播客/直播逐字稿（1k-10k 字）消化成 3-5 个可独立传播的短视频切片：Step 1 挑选题并返回 JSON 大纲，Step 2 基于大纲生成每条切片的成片脚本（Markdown）。",
  category: "short-video",
  actions: [
    {
      name: "访谈切片-选题大纲",
      description: "访谈切片 Step 1 — 从逐字稿中挑 3-5 个可独立成片的切片选题（JSON）",
      model: "qwen3.5-flash",
      variables: [
        {
          name: "transcript",
          required: true,
          description: "访谈/播客/直播逐字稿，纯文本。建议 1000-10000 字。",
        },
        {
          name: "guest_identity",
          required: true,
          description:
            "被访者身份 1-2 句。影响切片标题风格。例：'前阿里产品经理，现做独立 SaaS 创业'。",
        },
        {
          name: "platform_target",
          required: false,
          description:
            "目标平台。可选值：xhs（小红书）/ douyin（抖音）/ bilibili（B 站）/ weixin_shipin（视频号）。留空默认 douyin。",
          defaultValue: "douyin",
        },
        {
          name: "slice_count",
          required: false,
          description: "期望切片数。留空默认 3，上限 5。",
          defaultValue: "3",
        },
      ],
      messages: [
        {
          role: "system",
          content:
            "你是短视频选题编辑，擅长从长访谈里挑出'可独立成片'的金句/观点/故事段落。只输出 JSON，不写前言。",
        },
        {
          role: "user",
          content: `【访谈逐字稿】
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

【输出 JSON 结构（不要 markdown 代码块）】
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
- 不使用"震惊""万万没想到"等标题党模板`,
        },
      ],
    },
    {
      name: "访谈切片-成片脚本",
      description: "访谈切片 Step 2 — 为每条切片生成可拍摄/剪辑的成片脚本（Markdown）",
      model: "deepseek-v3",
      variables: [], // 继承 template 级变量 + previous_output
      messages: [
        {
          role: "system",
          content:
            "你是短视频成片编剧，把切片选题扩展成可直接拍摄/剪辑的脚本。只输出 Markdown，不写前言。",
        },
        {
          role: "user",
          content: `切片大纲：{{previous_output}}
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
- 整份输出禁止出现三个反引号序列
- 直接从 "## 切片 1" 开始，不要前言
- 不合并切片，每条独立成段`,
        },
      ],
    },
  ],
};

// ============================================================
// Template 9（BL-128c P5）：线下探访内容策划
// ============================================================

const TEMPLATE_ON_SITE_VISIT: TemplateDef = {
  name: "线下探访内容策划",
  description:
    "为计划去线下探店/探厂/探活动的创作者输出一份可执行的内容策划，覆盖'核心主题判断 / 出发前信息清单 / 现场拍摄与提问清单 / 回来后剪辑方案'四章节。",
  category: "short-video",
  actions: [
    {
      name: "线下探访内容策划",
      description: "探访前中后全流程策划（四固定章节）",
      model: "deepseek-v3",
      variables: [
        {
          name: "visit_target",
          required: true,
          description:
            "探访对象。例：'深圳华强北手机元器件市场' / '一家本地咖啡烘焙工坊' / '某母婴展会 A 馆'。",
        },
        {
          name: "creator_angle",
          required: true,
          description:
            "创作者角度。例：'做数码测评的博主' / '母婴选品博主' / '餐饮创业观察者'。决定内容视角。",
        },
        {
          name: "time_budget",
          required: false,
          description: "现场时间预算。例：'2 小时' / '半天' / '一整天'。留空默认 '2 小时'。",
          defaultValue: "2 小时",
        },
        {
          name: "output_format",
          required: false,
          description:
            "期望输出形式。可选值：short-video（短视频）/ graphic-image（图文）/ long-video（长视频）。留空默认 short-video。",
          defaultValue: "short-video",
        },
      ],
      messages: [
        {
          role: "system",
          content:
            "你是线下探访类内容策划师，专门为创作者设计'去现场之前的准备清单 + 现场拍摄清单 + 回来的剪辑方案'。你输出 Markdown，不写任何前言或套话。",
        },
        {
          role: "user",
          content: `探访对象：{{visit_target}}
创作者角度：{{creator_angle}}
现场时间预算：{{time_budget}}
期望输出形式：{{output_format}}

按以下四个固定章节输出，禁止添加其他章节：

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
- 不臆造 visit_target 内部的品牌、人名、数字、场景细节`,
        },
      ],
    },
  ],
};

// ============================================================
// Template 10（BL-128d P1）：IP 内容规划
// ============================================================

const TEMPLATE_IP_CONTENT_PLAN: TemplateDef = {
  name: "IP 内容规划",
  description:
    "给定 IP 人设摘要 + 主发平台 + 账号阶段，输出 4-8 周滚动内容规划表（12-20 条选题带节奏标注）+ 本期策略 + 阶段性调整信号。解决'有人设但不知道持续发什么'的问题。",
  category: "ip-persona",
  actions: [
    {
      name: "IP 内容规划",
      description: "滚动选题规划 + 本期策略 + 调整信号（三章节 Markdown）",
      model: "deepseek-v3",
      variables: [
        {
          name: "persona_summary",
          required: true,
          description: "IP 人设摘要。可粘贴 'IP 人设画像生成' 模板的输出，或手写 200-400 字。",
        },
        {
          name: "target_platform",
          required: true,
          description:
            "主发平台。可选值：xhs（小红书）/ douyin（抖音）/ bilibili（B 站）/ weixin_shipin（视频号）/ wechat_moment（微信朋友圈）。",
          defaultValue: "xhs",
        },
        {
          name: "current_stage",
          required: true,
          description:
            "账号阶段。可选值：0-1（0-500 粉起号期）/ 1-10（500-5000 粉涨粉期）/ 10-100（5000+ 粉稳定期）。",
          defaultValue: "0-1",
        },
        {
          name: "weeks",
          required: false,
          description: "规划周数。留空默认 4，上限 8。",
          defaultValue: "4",
        },
        {
          name: "constraints",
          required: false,
          description:
            "约束条件。例：'每周不超过 3 条视频（精力有限）' / '不做付费推广'。留空默认无特殊约束。",
          defaultValue: "无特殊约束",
        },
      ],
      messages: [
        {
          role: "system",
          content:
            "你是 IP 运营规划师，专门为个人 IP 设计可执行的滚动内容规划。你输出 Markdown 表格 + 简短策略总结，不写前言或套话。",
        },
        {
          role: "user",
          content: `【IP 人设】
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
≤60 字，指出本期 {{weeks}} 周内容的主轴。例："前 2 周验证'商业视角育儿'能否破圈，后 2 周聚焦高转化金句"。

## 二、{{weeks}} 周滚动选题表

表头：| 周 | 日期（留空待填） | 内容类型 | 选题标题 | 钩子类型 | 发布节奏 |

要求：
- 每周 3-5 条选题，{{weeks}}=4 时共 12-20 条
- 内容类型限于：观点 / 故事 / 教程 / 热点借势 / 问答回复 / 对比评测 / 幕后日常
- 钩子类型：反常识 / 数字悬念 / 身份反转 / 利益预告 / 冲突 / 共鸣共情
- 发布节奏：用 "W{周号}D{日号}" 标注（W1D1 / W1D3 / W2D2 ...）
- 整体节奏需考虑平台调性和 {{current_stage}} 阶段特征

## 三、阶段性调整策略

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
- wechat_moment: 60% 结果反馈 / 20% 产品 / 20% 价值观

【禁止】
- 不照抄 {{persona_summary}} 的句子，必须产出新选题
- 不使用"打造 / 赋能 / 闭环 / 爆款套路"等 3 年陈词
- 不出现日期硬编码（用 W1D1 相对时间）`,
        },
      ],
    },
  ],
};

// ============================================================
// Template 11（BL-128d P2）：IP 采访方案生成器
// ============================================================

const TEMPLATE_IP_INTERVIEW_PLAN: TemplateDef = {
  name: "IP 采访方案生成器",
  description:
    "用采访者身份 + 被访者背景 + 采访目标 → 输出一份结构化采访提纲：核心主张 / 情绪曲线 / 问题清单（带敏感度和软化版本）/ 风险预案。与'访谈切片'模板形成完整闭环。",
  category: "ip-persona",
  actions: [
    {
      name: "IP 采访方案生成器",
      description: "结构化采访提纲（四章节 Markdown）",
      model: "deepseek-v3",
      variables: [
        {
          name: "interviewer_identity",
          required: true,
          description: "采访者（我方 IP）身份 1-2 句。决定提问视角。",
        },
        {
          name: "interviewee_profile",
          required: true,
          description:
            "被访者背景 100-300 字。包含职业/成就/擅长话题/可能敏感点（隐私/商业机密/争议立场）。",
        },
        {
          name: "interview_goal",
          required: true,
          description:
            "首要目标。可选值：deep_profile（人物深访）/ expertise_extraction（专业观点萃取）/ story_collection（故事素材收集）/ tension_exploration（争议话题探讨）。",
          defaultValue: "story_collection",
        },
        {
          name: "duration_min",
          required: false,
          description: "采访时长（分钟）。留空默认 60，上限 180。",
          defaultValue: "60",
        },
        {
          name: "delivery_format",
          required: false,
          description:
            "后续交付形式。可选值：long_video（长视频）/ short_clips（短视频切片）/ article（图文）/ podcast（播客）。留空默认 short_clips。",
          defaultValue: "short_clips",
        },
      ],
      messages: [
        {
          role: "system",
          content:
            "你是资深访谈编导。你的采访提纲有三个特点：(1) 每个问题都服务于特定叙事/信息目标 (2) 问题排列有情绪曲线设计 (3) 预判敏感区并给出预案。你只输出 Markdown 提纲，不写前言。",
        },
        {
          role: "user",
          content: `【采访者（我方 IP）】
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
- **深潜段（中间 60%）**：围绕 {{interview_goal}} 的核心提问。60 分钟约 8-10 题，120 分钟约 15-18 题
- **收束段（最后 20%）**：反思 / 推荐 / 给观众寄语。2-3 题

## 三、具体提问清单（按顺序编号）

表格：| 序号 | 段落 | 问题文本 | 信息/叙事目标 | 预期回答时长 | 敏感度（低/中/高）|

要求：
- 问题必须开放式（不是"是/否"能回答）
- 每题必须有明确的"信息/叙事目标"（不能写"增进了解"这种泛化）
- 高敏感度问题标注原因（隐私 / 商业机密 / 争议立场）+ 备用软化版本放在表格下方说明
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
- 不虚构 {{interviewee_profile}} 未提供的身份细节`,
        },
      ],
    },
  ],
};

// ============================================================
// Template 12（BL-128d P3）：对谈内容策划
// ============================================================

const TEMPLATE_PANEL_CONTENT_PLAN: TemplateDef = {
  name: "对谈内容策划",
  description:
    "为多人对谈节目（播客/直播/视频对谈）设计三幕结构：立场分布图 + 破冰→冲突→共识三幕 + 嘉宾专属料包 + 风险禁区。强调观点碰撞不抱团。",
  category: "short-video",
  actions: [
    {
      name: "对谈内容策划",
      description: "多人对谈节目策划（四章节 Markdown）",
      model: "deepseek-v3",
      variables: [
        {
          name: "host_identity",
          required: true,
          description: "主持人/召集人身份 1-2 句。",
        },
        {
          name: "guest_profiles",
          required: true,
          description: "嘉宾名单（2-3 人）。每人 1-2 句介绍，不同嘉宾用换行（\\n）分隔。",
        },
        {
          name: "topic",
          required: true,
          description:
            "对谈核心话题。一句话清晰陈述，而非泛化。例：'独立开发者在 AI 时代：是该用 AI 加速迭代，还是警惕快但薄的陷阱'。",
        },
        {
          name: "format",
          required: false,
          description:
            "形式。可选值：podcast_audio（播客音频）/ video_roundtable（视频圆桌）/ livestream（直播）。留空默认 podcast_audio。",
          defaultValue: "podcast_audio",
        },
        {
          name: "duration_min",
          required: false,
          description: "总时长（分钟）。留空默认 60。",
          defaultValue: "60",
        },
      ],
      messages: [
        {
          role: "system",
          content:
            "你是对谈节目策划。你设计的对谈有三个特点：(1) 观点不抱团（故意让嘉宾有立场差异）(2) 节奏有明确的冲突-和解-深化三幕 (3) 每个嘉宾都有'非说不可'的专属话题。你输出 Markdown，不写前言。",
        },
        {
          role: "user",
          content: `【主持人】
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
- 冲突点不得降到人身攻击层面，必须围绕观点/事实/方法论
- 主持人引导台词要"激活分歧"而非"和稀泥"（例："A 说…B 您显然不同意，分歧的关键在哪？"）

### 第三幕·共识与延展（最后 20%）
表格同上。要素：
- 找到 1 条所有嘉宾都认同的"最小公约数"
- 每位嘉宾给 1 个"如果重来会怎么做"的回答机会
- 给听众/观众 1 个可带走的 action（读什么书 / 做什么事 / 关注什么信号）

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
- 不虚构 {{guest_profiles}} 未提供的嘉宾背景`,
        },
      ],
    },
  ],
};

// ============================================================
// 模板清单（12 个：BL-128b 6 + BL-128c 3 + BL-128d 3）
// ============================================================

const TEMPLATES: TemplateDef[] = [
  TEMPLATE_WECHAT_MOMENT,
  TEMPLATE_COMMENT_REPLY,
  TEMPLATE_IP_PERSONA,
  TEMPLATE_SHORT_VIDEO,
  TEMPLATE_PRODUCT_SHOWCASE,
  TEMPLATE_PRIVATE_DOMAIN,
  TEMPLATE_DOUYIN_VIRAL_COPY,
  TEMPLATE_INTERVIEW_SLICE,
  TEMPLATE_ON_SITE_VISIT,
  TEMPLATE_IP_CONTENT_PLAN,
  TEMPLATE_IP_INTERVIEW_PLAN,
  TEMPLATE_PANEL_CONTENT_PLAN,
];

// ============================================================
// BL-128c P6：BL-128b 8 个英文 action → 中文（rename）
// ============================================================

const RENAME_MAP: Array<{ from: string; to: string }> = [
  { from: "marketing-wechat-moment", to: "朋友圈文案六型生成" },
  { from: "marketing-comment-reply-classify", to: "评论回复-意图分类" },
  { from: "marketing-comment-reply-generate", to: "评论回复-候选生成" },
  { from: "marketing-ip-persona", to: "IP 人设画像生成" },
  { from: "marketing-short-video-outline", to: "短视频脚本-三幕大纲" },
  { from: "marketing-short-video-script", to: "短视频脚本-成片脚本" },
  { from: "marketing-product-showcase", to: "产品力可视化脚本" },
  { from: "marketing-private-domain", to: "私域营销策略方案" },
];

// ============================================================
// BL-128c P1/P2：修复首轮冒烟瑕疵（新 ActionVersion + 切 activeVersion）
// ============================================================

interface PromptPatch {
  actionName: string; // 改名后的中文 name
  changelog: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
}

const PROMPT_PATCHES: PromptPatch[] = [
  // P1 — #2 评论回复 Step 2：加护栏，禁止编造事实
  {
    actionName: "评论回复-候选生成",
    changelog: "BL-128c P1: add fact-grounding guardrails to prevent brand/price hallucination",
    messages: [
      {
        role: "system",
        content: "你是熟悉各社交平台风格差异的评论区运营，按要求输出 JSON 数组。",
      },
      {
        role: "user",
        content: `平台：{{platform}}
帖子上下文：{{post_context}}
评论：{{comment_text}}
评论分析：{{previous_output}}

【平台风格规则】
- xhs（小红书）：亲切、多用"姐妹/宝子"称呼、emoji 点缀、长度 20-50 字
- bilibili（B 站）：对等、可玩梗、避免过度营销、长度 15-40 字
- weixin_shipin（视频号）：克制、长辈友好、避免网络热梗、长度 20-60 字
- douyin（抖音）：节奏快、可直接引导行动、长度 10-30 字

【意图策略】
- question: 仅基于 post_context 已有信息作答；若 post_context 不含所需事实，回复应为引导路径（"私信了/主页有详情/评论区置顶"），严禁编造产品名、价格、规格、发货时间、库存、折扣码、门店位置、联系方式
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
[{"reply": "...", "style_note": "<为什么这么回，一句话>"}, ...]`,
      },
    ],
  },
  // P2 — #4 短视频 Step 2：强化三连击禁止代码块
  {
    actionName: "短视频脚本-成片脚本",
    changelog:
      "BL-128c P2: triple-reinforce no-codeblock rule (positive example + negative example + self-check)",
    messages: [
      {
        role: "system",
        content:
          "你是短视频成片编剧，把大纲扩展成可拍摄的 Markdown 表格脚本。不要任何前言，不要任何代码块。",
      },
      {
        role: "user",
        content: `基于以下大纲生成完整可拍摄脚本。

大纲：{{previous_output}}

【输出格式规范 — 必须逐条遵守】
1. 直接从表头 "| 时长" 开始输出，首字符必须是 "|"
2. 禁止在输出中出现任何三个连续反引号序列
3. 禁止输出 "\`\`\`markdown" / "\`\`\`md" / "\`\`\`" 等任何形式的代码块标记
4. 表格之前不得有"以下是…"这类前言
5. 表格之后不得有任何说明、注释或总结

【正确示例开头】
| 时长 | 画面描述 | 口播台词 | 字幕/花字 | 镜头建议 |
|---|---|---|---|---|
| 0-3s | ... | ... | ... | ... |

【错误示例（禁止输出，仅供参考）】
三反引号 markdown
| 时长 | ... |
三反引号

【列内容要求】
- 画面描述：主体+动作+环境三元素，不用"一个人在说话"
- 口播台词：口语化，单句 ≤20 字
- 字幕/花字：提炼口播关键词，≤8 字
- 镜头建议：景别（近/中/全）+ 运镜（固定/推拉/跟随）
- 全片不得出现"大家好我是…"式套话

【输出前自检】
生成完毕后在内心复核一次：第一个字符是不是 "|"？输出里有没有三个连续反引号？有则重写。`,
      },
    ],
  },
];

// ============================================================
// Seed 主流程（幂等）
// ============================================================

async function seedAction(def: ActionDef): Promise<string> {
  // 查重：同 project 同 name
  const existing = await prisma.action.findFirst({
    where: { projectId: PROJECT_ID, name: def.name },
  });
  if (existing) {
    console.log(`  [reuse] action: ${def.name} (id=${existing.id})`);
    return existing.id;
  }

  const action = await prisma.action.create({
    data: {
      projectId: PROJECT_ID,
      name: def.name,
      description: def.description,
      model: def.model,
    },
  });

  const version = await prisma.actionVersion.create({
    data: {
      actionId: action.id,
      versionNumber: 1,
      messages: def.messages,
      variables: def.variables,
      changelog: "initial seed for BL-128b",
    },
  });

  await prisma.action.update({
    where: { id: action.id },
    data: { activeVersionId: version.id },
  });

  console.log(
    `  [create] action: ${def.name} (id=${action.id}, model=${def.model}, v1=${version.id})`,
  );
  return action.id;
}

async function seedTemplate(def: TemplateDef): Promise<void> {
  // 查重：同 project 同 name
  const existing = await prisma.template.findFirst({
    where: { projectId: PROJECT_ID, name: def.name },
  });
  if (existing) {
    console.log(`[skip] template exists: ${def.name} (id=${existing.id})`);
    return;
  }

  // 先建所有 actions（获得 actionId 列表）
  console.log(`[create] template: ${def.name} (category=${def.category})`);
  const actionIds: string[] = [];
  for (const ad of def.actions) {
    const aid = await seedAction(ad);
    actionIds.push(aid);
  }

  // 建 Template（isPublic=false，冒烟测试后再发布）
  const template = await prisma.template.create({
    data: {
      projectId: PROJECT_ID,
      name: def.name,
      description: def.description,
      category: def.category,
      isPublic: false,
    },
  });
  console.log(`  [create] template row: id=${template.id} isPublic=false`);

  // 建 TemplateSteps
  for (let i = 0; i < actionIds.length; i++) {
    await prisma.templateStep.create({
      data: {
        templateId: template.id,
        actionId: actionIds[i],
        order: i,
        role: "SEQUENTIAL",
      },
    });
    console.log(`  [create] step order=${i} -> action=${def.actions[i].name}`);
  }
}

// ============================================================
// BL-128c P6：RENAME 阶段
// ============================================================

async function renameActions(): Promise<void> {
  console.log(`\n[phase 1/4 RENAME] BL-128b 8 英文 action → 中文`);
  for (const { from, to } of RENAME_MAP) {
    const result = await prisma.action.updateMany({
      where: { projectId: PROJECT_ID, name: from },
      data: { name: to },
    });
    if (result.count > 0) {
      console.log(`  [rename] "${from}" → "${to}" (${result.count} row)`);
    } else {
      // 不是错：可能本机已是中文名（再次跑脚本）或从未有该英文名
      const existingChinese = await prisma.action.findFirst({
        where: { projectId: PROJECT_ID, name: to },
      });
      if (existingChinese) {
        console.log(`  [skip] "${to}" already exists (rename idempotent)`);
      } else {
        console.log(`  [warn] neither "${from}" nor "${to}" found — action may be missing`);
      }
    }
  }
}

// ============================================================
// BL-128c P1/P2：VERSION + ACTIVATE 阶段
// ============================================================

async function applyPromptPatches(): Promise<void> {
  console.log(`\n[phase 3-4/4 VERSION + ACTIVATE] 应用 ${PROMPT_PATCHES.length} 条 prompt 补丁`);
  for (const patch of PROMPT_PATCHES) {
    const action = await prisma.action.findFirst({
      where: { projectId: PROJECT_ID, name: patch.actionName },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
    });
    if (!action) {
      console.error(`  [fatal] action not found: ${patch.actionName}`);
      process.exit(1);
    }

    const oldActiveVersionId = action.activeVersionId;
    const nextVersionNumber = (action.versions[0]?.versionNumber ?? 0) + 1;

    // 幂等检查：若最新 version 的 changelog 匹配，说明 patch 已应用过
    const latest = action.versions[0];
    if (latest && latest.changelog === patch.changelog) {
      console.log(
        `  [skip] "${patch.actionName}" already at v${latest.versionNumber} with changelog match`,
      );
      continue;
    }

    // 读取当前 active version 的 variables（保留不变）
    let currentVariables: unknown = [];
    if (oldActiveVersionId) {
      const oldVersion = await prisma.actionVersion.findUnique({
        where: { id: oldActiveVersionId },
      });
      currentVariables = oldVersion?.variables ?? [];
    }

    // 创建新 ActionVersion
    const newVersion = await prisma.actionVersion.create({
      data: {
        actionId: action.id,
        versionNumber: nextVersionNumber,
        messages: patch.messages,
        variables: currentVariables as never,
        changelog: patch.changelog,
      },
    });

    // 切换 activeVersionId
    await prisma.action.update({
      where: { id: action.id },
      data: { activeVersionId: newVersion.id },
    });

    console.log(
      `  [patch] "${patch.actionName}" v${nextVersionNumber} created, activeVersionId: ${oldActiveVersionId} → ${newVersion.id}`,
    );
    console.log(
      `           rollback: UPDATE actions SET "activeVersionId"='${oldActiveVersionId}' WHERE id='${action.id}';`,
    );
  }
}

async function main() {
  console.log(`[seed] BL-128b + BL-128c marketing templates, projectId=${PROJECT_ID}`);

  // 校验项目存在
  const project = await prisma.project.findUnique({ where: { id: PROJECT_ID } });
  if (!project) {
    console.error(`[fatal] Project not found: ${PROJECT_ID}. Aborting.`);
    process.exit(1);
  }
  console.log(`[verify] project: ${project.name} (user=${project.userId})`);

  // 校验 TEMPLATE_CATEGORIES 配置中包含本批次用到的 3 个新分类
  const categoryCfg = await prisma.systemConfig.findUnique({
    where: { key: "TEMPLATE_CATEGORIES" },
  });
  if (categoryCfg) {
    let parsed: Array<{ id: string }> = [];
    try {
      parsed = JSON.parse(categoryCfg.value) as Array<{ id: string }>;
    } catch (e) {
      console.error(`[fatal] TEMPLATE_CATEGORIES value is not valid JSON: ${(e as Error).message}`);
      process.exit(1);
    }
    const cats = parsed.map((c) => c.id);
    const required = ["social-content", "ip-persona", "short-video", "marketing-strategy"];
    const missing = required.filter((r) => !cats.includes(r));
    if (missing.length > 0) {
      console.error(`[fatal] TEMPLATE_CATEGORIES missing: ${missing.join(", ")}`);
      console.error("  Run 20260417_template_categories_marketing migration first.");
      process.exit(1);
    }
    console.log(`[verify] TEMPLATE_CATEGORIES contains required 4 marketing categories`);
  } else {
    console.warn("[warn] SystemConfig TEMPLATE_CATEGORIES missing — UI may not render tabs");
  }

  // Phase 1/4: RENAME — BL-128b 8 英文 action → 中文（必须最先执行）
  await renameActions();

  // Phase 2/4: UPSERT — seed 9 templates（BL-128b 6 + BL-128c 3），幂等跳过已存在
  console.log(`\n[phase 2/4 UPSERT] seed ${TEMPLATES.length} templates`);
  for (const tpl of TEMPLATES) {
    await seedTemplate(tpl);
  }

  // Phase 3-4/4: VERSION + ACTIVATE — 应用 P1/P2 prompt 补丁
  await applyPromptPatches();

  // 汇总
  const publicCount = await prisma.template.count({
    where: { projectId: PROJECT_ID, isPublic: true },
  });
  const draftCount = await prisma.template.count({
    where: { projectId: PROJECT_ID, isPublic: false },
  });
  console.log(
    `\n[done] System Templates 项目现状：isPublic=true ${publicCount} 条，isPublic=false ${draftCount} 条`,
  );
  console.log(`[next] 冒烟测试通过后批量发布：`);
  console.log(
    `  UPDATE templates SET "isPublic"=true WHERE "projectId"='${PROJECT_ID}' AND name IN (${TEMPLATES.map((t) => `'${t.name}'`).join(",")});`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

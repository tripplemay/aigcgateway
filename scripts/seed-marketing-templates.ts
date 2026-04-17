/**
 * BL-128b — 首发 6 个中文营销模板 seed 脚本
 *
 * 用法：
 *   本地：npx tsx scripts/seed-marketing-templates.ts
 *   生产：ssh → cd /opt/aigc-gateway && npx tsx scripts/seed-marketing-templates.ts
 *
 * 幂等逻辑：
 *   - Template 查重 (projectId, name)，已存在则 skip template + steps
 *   - Action 查重 (projectId, name)，已存在则复用 action.id
 *   - TemplateStep 由 DB unique 约束 (templateId, order) 兜底
 *   - 只追加不修改不删除
 *
 * 详见 docs/specs/BL-128b-spec.md
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
      name: "marketing-wechat-moment",
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
      name: "marketing-comment-reply-classify",
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
      name: "marketing-comment-reply-generate",
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
      name: "marketing-ip-persona",
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
      name: "marketing-short-video-outline",
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
      name: "marketing-short-video-script",
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
      name: "marketing-product-showcase",
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
      name: "marketing-private-domain",
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
// 模板清单（6 个）
// ============================================================

const TEMPLATES: TemplateDef[] = [
  TEMPLATE_WECHAT_MOMENT,
  TEMPLATE_COMMENT_REPLY,
  TEMPLATE_IP_PERSONA,
  TEMPLATE_SHORT_VIDEO,
  TEMPLATE_PRODUCT_SHOWCASE,
  TEMPLATE_PRIVATE_DOMAIN,
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

async function main() {
  console.log(`[seed] BL-128b 6 marketing templates, projectId=${PROJECT_ID}`);

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

  // 逐个 seed
  for (const tpl of TEMPLATES) {
    await seedTemplate(tpl);
  }

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

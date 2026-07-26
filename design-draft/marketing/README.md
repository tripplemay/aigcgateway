# AIGC Gateway · 推介素材（marketing）

> 面向**国内独立开发者 / 小团队**的产品推介素材集。纯中文，纯素材，**不改任何业务代码**。
> 后续如需正式替换站点根路由 `/` 为落地页，将另立新批次（建议代号 `MARKETING-LANDING`）走 harness 流程。

## 目录结构

```
design-draft/marketing/
├── README.md                        # 本文件 · 使用说明
├── assets/
│   └── shared.css                   # 共享样式（brand token / 字体 / 组件）
├── landing.html                     # ① 产品落地页（响应式，桌面 1440 基准）
├── infographic-architecture.html    # ② 架构信息图（1600×900 横版）
├── scene-quality-loop.html          # ③ 质量闭环场景图（1080×1440 竖版）
└── png/                             # PNG 导出产物（供社媒 / 公众号使用）
    ├── landing.png
    ├── infographic-architecture.png
    └── scene-quality-loop.png
```

## 内容主轴（三层能力闭环）

```
① 接入层      一个 Key · OpenAI 兼容 · 11 家服务商 · MCP 原生
② 监测层      全链路审计 · 用量看板 · 告警 · 健康实时可见      ← 核心差异化
③ 优化层      Action 多版本 · Template 编排 · 模板测试 · 评分    ← 核心差异化
```

核心口号：**"从接入，到监测，到持续优化 — 让 AI 生成质量有据可依"**

## 本地预览

任意静态服务器即可，推荐：

```bash
# 从项目根目录启动
npx serve design-draft/marketing -p 4173

# 或 Python
python3 -m http.server 4173 -d design-draft/marketing
```

打开：
- 落地页：http://localhost:4173/landing.html
- 架构图：http://localhost:4173/infographic-architecture.html
- 场景图：http://localhost:4173/scene-quality-loop.html

## 生成 PNG（Playwright 命令）

项目已安装 `@playwright/test`，直接用 `npx playwright screenshot`。

**前置：先启一个本地静态服务器**（见上）；然后另开一个终端：

```bash
# ① 落地页（整页截屏，1440 宽）
npx playwright screenshot \
  --viewport-size=1440,900 \
  --full-page \
  --wait-for-timeout=600 \
  http://localhost:4173/landing.html \
  design-draft/marketing/png/landing.png

# ② 架构信息图（固定 1600×900）
npx playwright screenshot \
  --viewport-size=1600,900 \
  --wait-for-timeout=600 \
  http://localhost:4173/infographic-architecture.html \
  design-draft/marketing/png/infographic-architecture.png

# ③ 质量闭环场景图（固定 1080×1440 竖版）
npx playwright screenshot \
  --viewport-size=1080,1440 \
  --wait-for-timeout=600 \
  http://localhost:4173/scene-quality-loop.html \
  design-draft/marketing/png/scene-quality-loop.png
```

> **小贴士：** 架构图和场景图都是**固定尺寸容器**（`.page` 类锁死宽高），只要 viewport 一致、不要 `--full-page`，截出来就是准确尺寸。

## 推荐使用场景

| 素材 | 投放渠道 | 形式 |
|---|---|---|
| `landing.html` | 作为对外推介页（托管到 GitHub Pages / Vercel / OSS / 官网子路径） | HTML 上线 |
| `landing.png` | 知乎 / 掘金 / 公众号正文首图 | PNG 贴图 |
| `infographic-architecture.png` | 技术博客封面 · 公众号头图 · 推文配图 | PNG |
| `scene-quality-loop.png` | 朋友圈 · 小红书 · X · 知乎回答 · 私信资料 | PNG 竖版 |

## 设计系统

- **品牌色**：紫 `#6D5DD3` / 浅紫 `#EEEDFE` / 深紫 `#3C3489`（与项目控制台 brand token 一致）
- **能力层配色**：接入=紫、监测=青 `#0EA5A4`、优化=琥珀 `#F59E0B`
- **字体**：`Manrope`（英文/标题）+ `PingFang SC`（中文正文）
- **服务商呈现**：遵循 `../DESIGN-GLOBAL.md` 约定 — **纯文字 badge，不使用第三方 Logo**（版权安全）
- **圆角**：16px（与 `--radius-xl` 对齐）
- **无外部图库**：所有装饰用 SVG + emoji，可完全离线渲染

## 合规/话术口径（统一）

- **定价**：与各服务商官网一致，不额外加价（预充值、按 token 扣费）
- **数据**：传输加密、审计日志仅项目所属账号可见、不用于模型训练
- **故障**：单家服务商异常自动 failover，对应用侧透明
- **锁定**：OpenAI 兼容协议，可随时切回原厂直连

## 下一步（待你决策）

如果对以上三件素材满意，后续可进入**阶段二**：

1. 立新批次 `MARKETING-LANDING`，把 `landing.html` React 化
2. 新建 `src/app/(marketing)/page.tsx` + 修改 `src/app/page.tsx` 未登录跳转逻辑
3. 接入 i18n（en / zh 双语）+ 可选埋点

当前批次 `TEMPLATE-LIBRARY-UPGRADE` 完成签收后再启动上述工作。

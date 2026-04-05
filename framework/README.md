# Cowork + Harness 工程化框架

沉淀自 AIGC Gateway 项目完整实施过程。适用于任何使用 Cowork（Claude 桌面端）+ Codex（Claude Code CLI）协同开发的项目。

---

## 框架由什么组成

```
framework/
├── harness/               # 状态机核心（7 状态：new→planning→building→verifying→fixing⟷reverifying→done）
│   ├── harness-rules.md   # 状态机规则，复制到项目根目录
│   ├── planner.md         # Planner 角色指令，复制到项目根目录
│   ├── generator.md       # Generator 角色指令，复制到项目根目录
│   ├── evaluator.md       # Evaluator 角色指令，复制到项目根目录
│   └── progress.init.json # 初始 progress.json，复制 + 改名
├── memory/                # 跨会话记忆系统模板
│   ├── MEMORY.md          # 记忆索引，复制到 .auto-memory/
│   ├── user-role.md       # 用户角色模板
│   └── project.md         # 项目状态模板
└── templates/             # 项目级配置模板
    ├── CLAUDE.md          # Claude / Codex 项目指令模板
    ├── signoff-report.md  # 功能签收报告模板
    └── features.template.json  # features.json 模板
```

---

## 新项目启动（5 分钟完成）

### 第 1 步：复制 Harness 文件到项目根目录

```bash
cp framework/harness/harness-rules.md  ./harness-rules.md
cp framework/harness/planner.md        ./planner.md
cp framework/harness/generator.md      ./generator.md
cp framework/harness/evaluator.md      ./evaluator.md
cp framework/harness/progress.init.json ./progress.json
```

### 第 2 步：初始化记忆系统

```bash
mkdir -p .auto-memory
cp framework/memory/MEMORY.md      .auto-memory/MEMORY.md
cp framework/memory/user-role.md   .auto-memory/user-role.md
cp framework/memory/project.md     .auto-memory/project.md
```

填写 `user-role.md` 和 `project.md` 中的占位内容（用户信息、技术栈、项目描述）。

### 第 3 步：配置 CLAUDE.md

```bash
cp framework/templates/CLAUDE.md ./CLAUDE.md
```

编辑 `CLAUDE.md`，填写：项目名称、技术栈、常用命令、架构说明、关键设计决策。

在文件顶部确保有这两行（不可删除）：
```markdown
## Harness 规则（最高优先级）
读取并严格遵守 @harness-rules.md 中的所有规则。
```

### 第 4 步：建立文档目录结构

```bash
mkdir -p docs/specs docs/test-cases docs/test-reports docs/design-draft
```

### 第 5 步：将记忆目录纳入 git 版本控制

```bash
# 确保 .auto-memory/ 不在 .gitignore 中
git add .auto-memory/ harness-rules.md planner.md generator.md evaluator.md progress.json CLAUDE.md
git commit -m "chore: init project with Cowork-Harness framework"
git push
```

这样另一台电脑 `git pull` 后即可无缝接续。

---

## 日常使用流程

### 开启新需求批次

1. 将 `progress.json` 的 `status` 改为 `"new"`
2. 打开 Cowork，告诉 Claude："根据 harness 规则，我们要开发 [需求描述]"
3. Claude 进入 Planner 模式，生成 features.json

### 开发中（Generator）

- Codex 读取 `progress.json` → 状态为 `planning` → 自动进入 Generator 模式
- 每完成一个功能，Codex 更新 `progress.json`（completed_features + current_sprint）
- 上下文不足 20% 时，Codex 保存进度并提示重新启动

### 验收（Evaluator）

- Codex 读取 `progress.json` → 状态为 `building` → 自动进入 Evaluator 模式
- 逐条验证 features.json，输出 PASS / PARTIAL / FAIL
- 写入 `progress.json.evaluator_feedback`，状态改为 `reviewing`

### 修复（Generator 复验）

- Codex 读取状态为 `reviewing` → 针对 evaluator_feedback 修复
- 修复后 Evaluator 复验，直至全部 PASS → `status: "done"`

### 会话结束（Cowork）

每次会话结束，在 Cowork 中说：「更新项目共享记忆」
Claude 更新 `.auto-memory/project.md`，然后 commit + push。

---

## 测试分层约定（L1 / L2）

| 层级 | 环境 | 依赖 | 职责 |
|---|---|---|---|
| L1 | 本地 | 无外部依赖（mock/stub） | auth 逻辑、路由、格式、协议合规 |
| L2 | Staging | 真实外部服务（API Key） | 全链路调用、计费、端对端写入 |

**铁律：** L1 FAIL ≠ 产品 Bug。L2 测试需用户明确授权才执行。

---

## 记忆系统约定

`.auto-memory/` 目录纳入 git，作为跨设备、跨会话的"项目记忆"。

| 文件 | 内容 | 更新时机 |
|---|---|---|
| `MEMORY.md` | 记忆索引 | 每次新增记忆文件后更新 |
| `user-role.md` | 用户信息和工作偏好 | 用户告知时 |
| `project.md` | 项目当前阶段和遗留问题 | 每次会话结束 |
| `feedback-*.md` | AI 行为规范和历史教训 | 用户纠正 AI 行为时 |
| `reference-*.md` | 外部资源指针（Slack 频道、文档 URL 等） | 发现新资源时 |

---

## 签收报告约定

每个完整批次交付时，在 `docs/test-reports/` 创建一份签收报告：

```
docs/test-reports/[批次名称]-signoff-YYYY-MM-DD.md
```

使用 `framework/templates/signoff-report.md` 模板。

---

## 经验教训（来自 AIGC Gateway 项目）

以下是项目实施过程中积累的关键教训，新项目直接继承：

**Harness 纪律**
- Cowork（Claude）做规划和记忆，Codex（Claude Code）做代码实现 — 职责不要混淆
- 直接在 Cowork 改代码属于绕过 Harness，必须事后补录进 progress.json 并由 Evaluator 复验
- evaluator_feedback 中的 PARTIAL 必须修复并写明"数量与描述一致"等可量化的验收条件

**成本控制**
- 聚合型服务商（OpenRouter 等）必须设白名单，否则同步全量模型会导致健康检查成本爆炸
- 图片生成的健康检查止步于 L2（格式验证），不执行 L3（真实生成），单次 $0.04–$0.19 不值得
- 聚合型服务商（OpenRouter 等）的图片生成能力不可信赖，gemini-flash-image / gpt-image 类模型频繁返回空 content；图片生成应优先使用直连 Provider（OpenAI DALL-E、volcengine、zhipu 等）
- doc-enricher 类工具需要按 modality 过滤，图片模型不需要 AI 丰富化

**Schema 变更**
- 每个 migration 只包含一个功能的变更，不要把不同功能的 schema 变更打包在一起
- `@updatedAt` 字段 migration 必须手动补 `DEFAULT now()`，Prisma 不自动加

**跨设备协作**
- `.auto-memory/` 必须纳入 git，每次会话结束后 commit + push
- 另一台电脑 `git pull` 后，Cowork 读取 `.auto-memory/` 即可恢复上下文

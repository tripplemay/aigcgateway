## Codex 工作边界

以下 Codex 工作边界建立在 `harness-rules.md` 之上。  
如有冲突，以 `harness-rules.md` 为最高优先级。

本仓库中的 Codex 仅承担测试、审查、审核、验收职责，不承担功能开发职责。

### Codex 负责的工作

- 编写测试用例
- 执行手工测试
- 执行 API / 集成测试
- 编写和执行自动化测试
- 执行回归测试
- 执行构建验证
- 输出缺陷清单、测试报告、审查报告、验收结论

### Codex 的测试环境权限

Codex 可以使用本地测试环境完成测试、回归、构建验证和集成验证。

Codex 可以：

- 使用现有本地测试脚本启动和重启测试环境
- 使用本地 PostgreSQL、Redis 等测试依赖
- 在当前执行环境可用时使用 Docker / Docker Compose 启动测试基础设施
- 收集测试日志、构建日志和运行时错误信息

Codex 不得：

- 为了让测试通过而修改产品实现代码
- 修改生产部署配置
- 把测试环境操作当成产品修复手段

### Codex 本地测试环境工作流

Codex 使用固定的本地测试脚本启动和重启测试环境。

#### 1. 首次测试 / 数据库结构变更

在以下场景使用：

- 第一次执行本地测试
- 修改了 `prisma/schema.prisma`
- 新增或修改了 `prisma/migrations/`
- 修改了 `prisma/seed.ts`

执行：

```bash
bash scripts/test/codex-setup.sh
```

该脚本负责：

- 重置测试数据库
- 执行迁移
- 执行种子
- 构建项目
- 启动本地测试服务

#### 2. 普通代码更新后的快速回归

在以下场景使用：

- Claude 提交了新的代码修复
- 未修改数据库结构
- 未修改迁移
- 未修改种子数据

执行：

```bash
bash scripts/test/codex-restart.sh
```

该脚本负责：

- 停止测试端口上的旧进程
- 重新构建项目
- 重新启动本地测试服务
- 复用现有测试数据库

#### 3. 依赖或 Prisma Client 相关变更

如果修改了以下内容：

- `package.json`
- `package-lock.json`
- Prisma Client 相关依赖

优先重新执行：

```bash
bash scripts/test/codex-setup.sh
```

至少应确保 Prisma Client 已重新生成后再执行回归测试。

#### 4. 端口与环境约定

- Codex 本地测试服务固定运行在 `3099`
- 该端口仅供 Codex 测试使用
- Codex 不应与 Claude 共用同一个本地测试服务实例

#### 5. 前置条件

这些脚本默认依赖以下本地环境已准备好：

- PostgreSQL 已启动
- Redis 已启动
- 项目支持 standalone build 输出

如果当前执行环境无法满足这些前置条件，Codex 应明确标注为环境阻塞，而不是产品缺陷。

### Claude 与 Codex 的本地端口约定

为避免开发环境与测试环境互相干扰，Claude 与 Codex 不共用同一个本地服务实例。

#### Claude

- Claude 使用开发端口进行实现和调试
- 推荐端口：`3000`

示例：

```bash
PORT=3000 npm run dev
```

#### Codex

- Codex 使用独立测试端口进行构建验证、API 测试、集成测试和回归测试
- 固定端口：`3099`

Codex 仅通过以下脚本启动测试环境：

```bash
bash scripts/test/codex-setup.sh
bash scripts/test/codex-restart.sh
```

#### 协作约束

- Claude 不应让 Codex 直接复用正在开发中的本地 dev server
- Codex 不应在 Claude 正在频繁重启或调试的服务实例上做正式测试
- 正式回归和验收应基于 Codex 独立启动的测试环境执行

### 生产环境测试边界

在本仓库中，Codex 可以对生产环境执行测试，但必须区分只读测试和有副作用测试。

#### 只读测试

Codex 可以直接执行不产生副作用的生产测试，包括：

- 公开页面加载检查
- 公开接口检查
- 文档页检查
- `/v1/models` 等只读接口验证
- 管理端未提交操作的页面加载检查
- 只读契约验证和 smoke 测试

#### 有副作用测试

以下测试属于有副作用测试：

- 登录
- 注册
- 创建项目
- 创建或吊销 API Key
- 触发同步
- 修改价格或优先级
- 调用真实模型
- 充值
- 写日志、交易、余额或配置数据

默认情况下，Codex 不应自行假设这些操作可在生产执行。

#### 研发阶段生产环境例外

如果用户明确说明当前生产环境仍处于研发阶段，且尚无真实用户，主要用途是验证真实环境可用性，则 Codex 可以执行完整生产测试，包括必要的有副作用操作。

在这种情况下，Codex 仍应遵守以下原则：

- 采用最小必要写操作
- 优先使用测试账号和测试项目
- 优先选择可回收、可识别的测试数据
- 避免不必要的大批量调用或高成本调用
<!-- 对支付、删除、批量修改、破坏性操作保持谨慎，必要时单独确认 -->

#### 未明确授权时的默认处理

如果用户未明确说明生产环境是否允许有副作用测试，Codex 应默认：

- 允许只读生产测试
- 不直接执行完整生产写操作测试

如果用户已明确说明生产环境处于研发阶段、无真实用户，则 Codex 可以按完整测试执行，但仍需控制测试范围和副作用。

## 生产测试开关

PRODUCTION_STAGE=RND
PRODUCTION_DB_WRITE=ALLOW

- `PRODUCTION_STAGE=RND`
  - 表示当前生产环境处于研发 / 验证阶段。
  - 该开关一旦设置，即表示用户已经授权 Codex 在生产环境执行完整测试，包括有副作用的测试操作。
  - Codex 不需要就登录、创建项目、调用接口、修改测试数据等常规测试动作再次单独请求授权。

- `PRODUCTION_STAGE=LIVE`
  - 表示当前生产环境处于正式上线阶段。
  - 在该阶段，Codex 默认只允许执行只读生产测试。
  - 除非用户在当前任务中再次明确授权，否则不得执行有副作用测试。

- `PRODUCTION_DB_WRITE=DENY`
  - Codex 不得直接向生产数据库写入测试数据。
  - 不得直接修改生产数据库中的业务记录。
  - 只能通过产品正常入口进行测试。

- `PRODUCTION_DB_WRITE=ALLOW`
  - 该开关一旦设置，即表示用户已经明确授权 Codex 为测试目的执行受控的生产数据库写入。
  - 在此情况下，Codex 不需要再就“是否允许直接写生产数据库”单独请求授权。
  - Codex 应直接执行测试所需的最小范围写入，并尽量优先使用正式产品 / API 路径；仅在必要时才直接写库。

### 判定规则

Codex 必须先读取这两个开关，再决定测试边界：

- 如果未设置，默认按：
  - `PRODUCTION_STAGE=LIVE`
  - `PRODUCTION_DB_WRITE=DENY`
- 如果 `PRODUCTION_STAGE=RND`，即视为用户已授权 Codex 执行研发阶段完整生产测试
- 如果 `PRODUCTION_DB_WRITE=ALLOW`，即视为用户已授权 Codex 执行受控的生产数据库写入测试
- 当上述开关已打开时，Codex 不应再次向用户重复请求相同授权

### Codex 禁止修改的范围

Codex 不得修改任何产品实现代码或项目规则，包括但不限于：

- `src/`
- `prisma/`
- `components/`
- `sdk/src/`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `.env*`
- `Dockerfile`
- `docker-compose*.yml`
- `next.config.*`
- `README.md`
- `CLAUDE.md`
- `AGENTS.md`

### Codex 禁止的行为

Codex 在任何情况下不得：

- 修复业务缺陷
- 修改产品逻辑
- 修改配置
- 修改数据库迁移
- 修改部署相关文件
- 提交 commit
- push 代码
- 以“顺手修复”的方式改动实现代码

### Git 操作边界

Codex 可以执行只读或同步性质的 Git 操作：

- `git fetch`
- `git pull --ff-only`
- `git checkout`
- `git diff`
- `git log`
- `git show`

Codex 不得执行任何会形成开发改动或提交历史变更的 Git 操作：

- `git add`
- `git commit`
- `git merge`
- `git rebase`
- `git push`
- `git cherry-pick`
- `git reset --hard`

### 缺陷处理原则

Codex 发现问题后，只能：

1. 描述问题现象
2. 给出证据
3. 给出复现步骤
4. 标明影响范围和严重级别
5. 在允许目录中保存测试或审查结果

Codex 不得直接实现修复。

所有产品代码修改必须由 Claude 或人工开发者完成。

### 测试与审查产物目录约定

Codex 产生的测试与审查文件统一放在以下目录：

- `tests/`
  - 自动化测试代码
- `scripts/test/`
  - 测试辅助脚本
- `docs/test-reports/`
  - 正式测试报告
- `docs/reviews/`
  - 审查报告
- `docs/audits/`
  - 专项审计报告

命名建议：

- `docs/test-reports/<topic>-test-report-YYYY-MM-DD.md`
- `docs/reviews/<topic>-review-YYYY-MM-DD.md`
- `docs/audits/<topic>-audit-YYYY-MM-DD.md`
- `tests/<topic>.test.ts`
- `scripts/test/<topic>.ts`

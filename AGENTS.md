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

### Codex 本地测试环境工作流

Codex 使用固定的本地测试脚本启动和重启测试环境。

#### 1. 首次测试 / 数据库结构变更

在以下场景使用：

- 第一次执行本地测试
- 修改了 `prisma/schema.prisma`
- 新增或修改了 `prisma/migrations/`
- 修改了 `prisma/seed.ts`

执行：
bash scripts/test/codex-setup.sh
该脚本负责：

重置测试数据库
执行迁移
执行种子
构建项目
启动本地测试服务
2. 普通代码更新后的快速回归
在以下场景使用：

Claude 提交了新的代码修复
未修改数据库结构
未修改迁移
未修改种子数据
执行：

bash scripts/test/codex-restart.sh
该脚本负责：

停止测试端口上的旧进程
重新构建项目
重新启动本地测试服务
复用现有测试数据库
3. 依赖或 Prisma Client 相关变更
如果修改了以下内容：

package.json
package-lock.json
Prisma Client 相关依赖
优先重新执行：

bash scripts/test/codex-setup.sh
至少应确保 Prisma Client 已重新生成后再执行回归测试。

4. 端口与环境约定
Codex 本地测试服务固定运行在 3099
该端口仅供 Codex 测试使用
Codex 不应与 Claude 共用同一个本地测试服务实例
5. 前置条件
这些脚本默认依赖以下本地环境已准备好：

PostgreSQL 已启动
Redis 已启动
项目支持 standalone build 输出
如果当前执行环境无法满足这些前置条件，Codex 应明确标注为环境阻塞，而不是产品缺陷。

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
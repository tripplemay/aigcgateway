# BL-DEV-PORT-3199 — Dev/Test 端口 3099 → 3199 + 字面量统一

**批次类型：** dev-chore（非功能改动）
**创建日期：** 2026-04-26
**预计工时：** 0.5h（Generator）+ 0.25h（Codex 验收）

---

## 背景

本机同时运行两个项目，本项目历史上 dev/test 都使用 `:3099`，与另一项目冲突。

`.env` 的 dev `PORT` 已由 Planner 本机改为 3199（仅本机生效，gitignore 文件）。但仓内还存在两类硬编码：

1. **Codex 测试环境硬编码：** `scripts/test/codex-env.sh:24` `export PORT="3099"`，setup/wait 脚本里 `lsof -ti:3099`、`http://localhost:3099`，是 Codex 复验期间真正的端口源
2. **Script/test/docs 默认 BASE_URL：** 散落在 `scripts/`、`tests/e2e/`、`tests/perf/`、`CLAUDE.md`、`AGENTS.md` 共 ~83 文件、~103 处字面量 `localhost:3099`

本批次目标：把仓内所有 dev/test 路径的 `3099` 全部替换为 `3199`，使本项目与其他项目端口互不重叠。

---

## 范围

### 包含（in scope）

**核心配置（决定端口）**
- `scripts/test/codex-env.sh` — `PORT=3099` → `PORT=3199`
- `scripts/test/codex-setup.sh` — `lsof -ti:3099` 改 3199；echo 提示同步
- `scripts/test/codex-wait.sh` — `TARGET="http://localhost:3099/v1/models"` 改 3199

**活跃脚本默认值（每天/每批次都会跑）**
- `scripts/e2e-test.ts` / `scripts/e2e-errors.ts` / `scripts/test-mcp.ts` / `scripts/test-mcp-errors.ts`
- `scripts/test-all.sh`
- `scripts/admin-auth.ts`

**E2E 测试**
- `tests/e2e/*.spec.ts`（3 文件：user-profile-center、project-switcher、balance-user-level-ui）

**性能测试**
- `tests/perf/.env.example`
- `tests/perf/k6/*.js`（3 文件）
- `tests/perf/autocannon/quick-regression.sh`

**文档**
- `CLAUDE.md` — Test Scripts 一节 4 行
- `AGENTS.md` — 端口表 1 行 + L1 本地 1 行

**历史 e2e 脚本（`scripts/test/*-YYYY-MM-DD.ts`，~50 文件）**
- 一并替换。理由：避免未来重新跑回归时还要手动 `BASE_URL=...` 覆盖。这些脚本都用 `BASE_URL ?? "http://localhost:3099"`，替换为 3199 后向后兼容（旧默认值已无人依赖）。

### 不包含（out of scope）

- `docs/test-cases/`、`docs/test-reports/`、`docs/audits/` — 已归档报告，3099 是当时事实记录，不应改写
- `progress.json` 历史 `session_notes` 字段中的 3099 引用 — 同上
- `.env`（已改）/ `.env.example`（不影响：示例本就用 3000）
- `IMPLEMENTATION_SUMMARY.md` / `AGENTS_backup.md` 等 untracked 备份文件

---

## 功能拆解

### F-DP-01（Generator）：3099 → 3199 全量替换

**操作步骤：**

1. **预扫描** — 确认范围与本 spec 一致：
   ```bash
   grep -rl "3099" scripts/ tests/ CLAUDE.md AGENTS.md \
     --include="*.ts" --include="*.tsx" --include="*.md" \
     --include="*.sh" --include="*.js" --include="*.mjs" \
     | grep -v "docs/test-cases\|docs/test-reports\|docs/audits"
   ```
   预期 ~83 文件。

2. **批量替换** — 对预扫描得到的文件列表批量做 `3099` → `3199`（macOS sed 写法）：
   ```bash
   <list> | xargs sed -i '' 's/3099/3199/g'
   ```
   备选：分目录拆 sed 命令，逐目录验证后再下一组。

3. **核对 codex-setup.sh 提示文字** — 第 36 行 `=== [0/5] Killing old process on :3099 ===` 与第 61 行 `=== [5/5] Start on :3099 ===` 必须同步成 3199（sed 全量替换会捎带处理，确认即可）。

4. **本地验证：**
   - `grep -rn "3099" scripts/ tests/ CLAUDE.md AGENTS.md --include={*.ts,*.tsx,*.md,*.sh,*.js,*.mjs} | grep -v "docs/test-cases\|docs/test-reports\|docs/audits"` → **0 行**
   - `npx tsc --noEmit` 通过
   - `npm run build` 通过
   - `bash scripts/test/codex-setup.sh` 启动 standalone（在本机 .env 已改 3199 的情况下，PORT 来自 codex-env.sh，预期监听 :3199；`bash scripts/test/codex-wait.sh` 在另一终端确认就绪）

5. **commit** 一次（避免分批；逻辑无变化纯字面量替换）：
   ```
   chore(BL-DEV-PORT-3199): 3099 → 3199 端口字面量全量同步
   ```

**Acceptance（F-DP-01）：**
- [ ] 全仓 grep `3099`（排除 docs/test-cases/test-reports/audits + .obsidian + dump.rdb）= 0
- [ ] `codex-env.sh` `PORT=3199`、`codex-setup.sh` lsof + echo 同步、`codex-wait.sh` URL 同步
- [ ] tsc 通过
- [ ] build 通过
- [ ] vitest 不破坏现有 414 测试（如有 hardcoded 3099 应一同被替换，预期仍 PASS）

### F-DP-02（Codex/Evaluator）：端口替换验收

**operator：** `codex`
**前置：** F-DP-01 commit + push 后

**操作步骤：**

1. `git pull --ff-only origin main`
2. **Grep 验证（核心）：**
   ```bash
   grep -rn "3099" scripts/ tests/ CLAUDE.md AGENTS.md \
     --include="*.ts" --include="*.tsx" --include="*.md" \
     --include="*.sh" --include="*.js" --include="*.mjs" \
     | grep -v "docs/test-cases\|docs/test-reports\|docs/audits"
   ```
   预期：**0 行**
3. **静态：** `npx tsc --noEmit` PASS
4. **构建：** `npm run build` PASS
5. **回归：** `npx vitest run` PASS（414 测试或 ≥ 414）
6. **端到端冒烟：**
   - `bash scripts/test/codex-setup.sh` 启动 standalone 监听 `:3199`
   - `bash scripts/test/codex-wait.sh` 退出码 0
   - `curl -s -o /dev/null -w "%{http_code}" http://localhost:3199/login` → 200
   - 反向验证 `:3099` 无监听（不该再绑定）：`lsof -ti:3099` 空
7. **签收报告：** `docs/test-reports/BL-DEV-PORT-3199-signoff-2026-04-2X.md`，列出 grep 输出 + tsc/build/vitest log + curl 200 截屏

**Acceptance（F-DP-02）：**
- [ ] grep 验证 = 0
- [ ] tsc / build / vitest 全 PASS
- [ ] codex-setup.sh 启动 :3199 + codex-wait.sh PASS + curl /login 200
- [ ] :3099 反向验证空（确认本项目不再占用旧端口）
- [ ] signoff 报告写入

---

## 风险与回退

**风险（低）：**
- 全量 sed 替换可能命中非端口的 "3099"（如某些数字常数巧合等于 3099）
- 缓解：sed 替换后 `git diff` 人工抽检 5-10 文件 confirm 全部为 URL/端口语境

**回退（5 分钟）：**
- `git revert <commit>` 即可，纯字面量改动无副作用

---

## 与其他批次的关系

- **不阻塞** 任何 backlog（BL-SEC-* / BL-DATA-CONSISTENCY 等）
- **本机 .env** 已由 Planner 单独改完（gitignore，不入仓），不影响本批次
- 本批次完成后，Codex 任意未来批次复验都自动用 :3199，不再需要每次手动 `BASE_URL=...`

#!/usr/bin/env bash
# bootstrap-adopt.sh — 非破坏性接入 Triad Workflow 到现有项目
#
# 与 bootstrap.sh 的区别：
#   - bootstrap.sh: greenfield 新项目，覆盖式复制
#   - bootstrap-adopt.sh: 现有项目，只补缺失，已存在文件不覆盖
#
# 使用方式（从目标项目根目录执行）：
#   cd /path/to/existing/project
#   npx degit tripplemay/harness-template .triad-src
#   bash .triad-src/bootstrap-adopt.sh
#
# 或如果已经有 framework/ 子目录（参考接入过的项目）：
#   bash framework/bootstrap-adopt.sh

set -euo pipefail

TARGET_DIR="$(pwd)"

# ============================================================
# 1. 识别 source layout
# ============================================================
#   - .triad-src 模式：用户刚 degit 到 .triad-src/
#   - framework 模式：已有 framework/ 目录
#   - flat 模式：CWD 下直接有 harness/ memory/ templates/（少见）

if [ -d "$TARGET_DIR/.triad-src/harness" ] && [ -d "$TARGET_DIR/.triad-src/memory" ]; then
  SRC="$TARGET_DIR/.triad-src"
  LAYOUT="degit"
elif [ -d "$TARGET_DIR/framework/harness" ] && [ -d "$TARGET_DIR/framework/memory" ]; then
  SRC="$TARGET_DIR/framework"
  LAYOUT="framework"
elif [ -d "$TARGET_DIR/harness" ] && [ -d "$TARGET_DIR/memory" ]; then
  SRC="$TARGET_DIR"
  LAYOUT="flat"
else
  echo "✗ 找不到 Triad 模板源文件。"
  echo ""
  echo "请按以下顺序执行："
  echo "  cd $TARGET_DIR"
  echo "  npx degit tripplemay/harness-template .triad-src"
  echo "  bash .triad-src/bootstrap-adopt.sh"
  exit 1
fi

# ============================================================
# 2. 安全检查：拒绝重复接入
# ============================================================

if [ -f "$TARGET_DIR/progress.json" ] && [ -f "$TARGET_DIR/harness-rules.md" ]; then
  echo "✗ 检测到 progress.json 和 harness-rules.md 已存在。"
  echo "  项目疑似已接入过 Triad Workflow，拒绝重复运行。"
  echo ""
  echo "  如需强制重置："
  echo "    1. 移除已存在的 Triad 文件（注意备份 .auto-memory/ 中的项目记忆）"
  echo "    2. 重新运行本脚本"
  exit 1
fi

echo "→ 开始接入 Triad Workflow 到现有项目"
echo "  目标：$TARGET_DIR"
echo "  源：  $SRC  (布局: $LAYOUT)"
echo ""

# ============================================================
# 3. 准备追踪列表
# ============================================================

ADDED=()
SKIPPED=()
MANUAL_TODOS=()

copy_if_missing() {
  local src="$1"
  local dst="$2"
  local label="${3:-$(basename "$dst")}"
  if [ -e "$dst" ]; then
    SKIPPED+=("$label")
  else
    cp "$src" "$dst"
    ADDED+=("$label")
  fi
}

# ============================================================
# 4. 复制 harness 角色文件（通常新项目都没有，放心复制）
# ============================================================

echo "[1/7] 安装 harness 角色文件..."
copy_if_missing "$SRC/harness/harness-rules.md" "$TARGET_DIR/harness-rules.md"
copy_if_missing "$SRC/harness/planner.md"        "$TARGET_DIR/planner.md"
copy_if_missing "$SRC/harness/generator.md"      "$TARGET_DIR/generator.md"
copy_if_missing "$SRC/harness/evaluator.md"      "$TARGET_DIR/evaluator.md"

# ============================================================
# 5. 创建状态机初始文件（已存在则跳过）
# ============================================================

echo "[2/7] 创建状态机文件..."
copy_if_missing "$SRC/harness/progress.init.json" "$TARGET_DIR/progress.json"

if [ ! -f "$TARGET_DIR/features.json" ]; then
  cat > "$TARGET_DIR/features.json" <<'JSON'
{
  "sprint": null,
  "features": []
}
JSON
  ADDED+=("features.json")
else
  SKIPPED+=("features.json")
fi

if [ ! -f "$TARGET_DIR/backlog.json" ]; then
  echo "[]" > "$TARGET_DIR/backlog.json"
  ADDED+=("backlog.json")
else
  SKIPPED+=("backlog.json")
fi

# ============================================================
# 6. .auto-memory 共享记忆目录
# ============================================================

echo "[3/7] 初始化共享记忆..."
if [ ! -d "$TARGET_DIR/.auto-memory" ]; then
  mkdir -p "$TARGET_DIR/.auto-memory/role-context"
  cp "$SRC/memory/MEMORY.md"           "$TARGET_DIR/.auto-memory/"
  cp "$SRC/memory/reference-docs.md"   "$TARGET_DIR/.auto-memory/"
  cp "$SRC/memory/role-context/"*.md   "$TARGET_DIR/.auto-memory/role-context/"
  cp "$SRC/memory/project-status.md"   "$TARGET_DIR/.auto-memory/project-status.md"
  cp "$SRC/memory/environment.md"      "$TARGET_DIR/.auto-memory/environment.md"
  cp "$SRC/memory/user-role.md"        "$TARGET_DIR/.auto-memory/user-role.md"
  ADDED+=(".auto-memory/ (含占位符模板)")
  MANUAL_TODOS+=(".auto-memory/project-status.md — 写真实项目现状（最关键）")
  MANUAL_TODOS+=(".auto-memory/environment.md — 填生产 URL / 服务器 / 测试账号")
  MANUAL_TODOS+=(".auto-memory/user-role.md — 描述你的角色与偏好")
  MANUAL_TODOS+=(".auto-memory/reference-docs.md — 根据现有项目的 docs/ 结构修订")
else
  SKIPPED+=(".auto-memory/ (已存在)")
fi

# ============================================================
# 7. docs 目录骨架（已存在子目录则跳过，只补缺的）
# ============================================================

echo "[4/7] 补齐 docs 子目录..."
for subdir in specs test-cases test-reports/user_report dev; do
  if [ ! -d "$TARGET_DIR/docs/$subdir" ]; then
    mkdir -p "$TARGET_DIR/docs/$subdir"
    touch "$TARGET_DIR/docs/$subdir/.gitkeep"
    ADDED+=("docs/$subdir/")
  else
    SKIPPED+=("docs/$subdir/")
  fi
done

# ============================================================
# 8. CLAUDE.md — 顶部注入 Triad 规则（不覆盖）
# ============================================================

echo "[5/7] 处理 CLAUDE.md..."

TRIAD_BLOCK='## Triad Workflow 规则（最高优先级）

读取并严格遵守 @harness-rules.md 中的所有规则。

**每次会话启动必须执行（所有 agent 通用）：**
1. 读取 `.auto-memory/MEMORY.md`（项目记忆索引），按需加载记忆文件
2. 读取 `progress.json`，确认当前阶段，再加载对应角色文件（planner.md / generator.md / evaluator.md）

**分支规则：** 代码提交推 `main` 分支。

**记忆分层：** `.auto-memory/`（git-tracked）是跨 agent 共享记忆源。

**规格文档分级：** 新功能批次须有 `docs/specs/` 下的规格文档（硬性）；Bug 修复批次可省略（软性）。

---
'

if [ -f "$TARGET_DIR/CLAUDE.md" ]; then
  if grep -q "Triad Workflow 规则" "$TARGET_DIR/CLAUDE.md"; then
    SKIPPED+=("CLAUDE.md (已包含 Triad 规则)")
  else
    cp "$TARGET_DIR/CLAUDE.md" "$TARGET_DIR/CLAUDE.md.pre-triad.bak"
    printf '%s\n%s' "$TRIAD_BLOCK" "$(cat "$TARGET_DIR/CLAUDE.md")" > "$TARGET_DIR/CLAUDE.md.new"
    mv "$TARGET_DIR/CLAUDE.md.new" "$TARGET_DIR/CLAUDE.md"
    ADDED+=("CLAUDE.md (顶部已注入 Triad 规则；原内容备份至 CLAUDE.md.pre-triad.bak)")
    MANUAL_TODOS+=("检查 CLAUDE.md 是否因注入变得臃肿，必要时把细节下沉到 docs/dev/")
  fi
else
  cp "$SRC/templates/CLAUDE.md" "$TARGET_DIR/CLAUDE.md"
  ADDED+=("CLAUDE.md (从模板复制，含占位符)")
  MANUAL_TODOS+=("CLAUDE.md — 填项目名、技术栈、Commands")
fi

# AGENTS.md
if [ -f "$TARGET_DIR/AGENTS.md" ]; then
  SKIPPED+=("AGENTS.md (已存在，请人工核对是否 Triad 兼容)")
  MANUAL_TODOS+=("AGENTS.md — 核对现有内容是否与 Triad 规则兼容")
else
  cp "$SRC/templates/AGENTS.md" "$TARGET_DIR/AGENTS.md"
  ADDED+=("AGENTS.md (从模板复制)")
  MANUAL_TODOS+=("AGENTS.md — 核对生产测试开关 (PRODUCTION_STAGE / DB_WRITE / HIGH_COST_OPS)")
fi

# ============================================================
# 9. .gitignore — 追加 .agent-id（不覆盖已有规则）
# ============================================================

echo "[6/7] 更新 .gitignore..."
if [ ! -f "$TARGET_DIR/.gitignore" ]; then
  cat > "$TARGET_DIR/.gitignore" <<'GITIGNORE'
# Triad Workflow
.agent-id

# OS / editor
.DS_Store
*.swp
GITIGNORE
  ADDED+=(".gitignore (新建)")
else
  if grep -qxF '.agent-id' "$TARGET_DIR/.gitignore"; then
    SKIPPED+=(".gitignore (.agent-id 已在)")
  else
    cat >> "$TARGET_DIR/.gitignore" <<'GITIGNORE'

# Triad Workflow
.agent-id
GITIGNORE
    ADDED+=(".gitignore (追加 .agent-id)")
  fi
fi

# ============================================================
# 10. 整理 source 到 framework/（仅 degit 布局）
# ============================================================

echo "[7/7] 整理 framework/ 子目录..."
if [ "$LAYOUT" = "degit" ]; then
  mkdir -p "$TARGET_DIR/framework"
  # 移动子目录
  for d in harness memory templates archive docs; do
    if [ -d "$SRC/$d" ] && [ ! -d "$TARGET_DIR/framework/$d" ]; then
      mv "$SRC/$d" "$TARGET_DIR/framework/"
    fi
  done
  # 移动顶层 md / sh（如存在）
  for f in cowork-constraint-design.md proposed-learnings.md CHANGELOG.md INIT.md bootstrap.sh README.md; do
    if [ -f "$SRC/$f" ] && [ ! -f "$TARGET_DIR/framework/$f" ]; then
      mv "$SRC/$f" "$TARGET_DIR/framework/"
    fi
  done
  # bootstrap-adopt.sh 自身也移过去（完成后就不再需要）
  if [ -f "$SRC/bootstrap-adopt.sh" ] && [ ! -f "$TARGET_DIR/framework/bootstrap-adopt.sh" ]; then
    cp "$SRC/bootstrap-adopt.sh" "$TARGET_DIR/framework/bootstrap-adopt.sh"
  fi
  # 清理临时目录
  rm -rf "$TARGET_DIR/.triad-src"
  ADDED+=("framework/ (源模板归位)")
fi

# ============================================================
# 11. 打印总结 + 手工待办清单
# ============================================================

echo ""
echo "============================================================"
echo "✓ Triad Workflow 接入完成"
echo "============================================================"
echo ""

if [ ${#ADDED[@]} -gt 0 ]; then
  echo "新增 / 修改："
  for item in "${ADDED[@]}"; do echo "  + $item"; done
  echo ""
fi

if [ ${#SKIPPED[@]} -gt 0 ]; then
  echo "已存在，保留不动："
  for item in "${SKIPPED[@]}"; do echo "  = $item"; done
  echo ""
fi

if [ ${#MANUAL_TODOS[@]} -gt 0 ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "你需要手工完成的事项（按重要性排序）："
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  for i in "${!MANUAL_TODOS[@]}"; do
    printf "  [%d] %s\n" "$((i+1))" "${MANUAL_TODOS[$i]}"
  done
  echo ""
fi

cat <<EOF
下一步（建议按顺序）：

  1. 编辑 .auto-memory/project-status.md
     写真实项目现状（已开发多久、技术栈、遗留问题、测试覆盖、生产部署等）
     这是最关键的一步，Triad agent 未来都基于这份记忆工作

  2. 编辑 .auto-memory/environment.md 和 user-role.md
     按模板填你的真实信息

  3. 编辑 .auto-memory/reference-docs.md
     指向现有项目的 docs/ 子目录、设计稿、测试脚本位置
     让 Evaluator 知道复用现有测试框架，而非重新发明

  4. 把已知 TODO / bug 灌入 backlog.json
     参考 framework/docs/04-adopt-existing-project.md §第 6 步 的示例格式

  5. 创建 .agent-id：
       cat > .agent-id <<EOF2
       cli: YourName
       codex: ReviewerName
       EOF2

  6. 挑选第一个试点批次
     参考 framework/docs/04-adopt-existing-project.md §第 8 步 的选择标准
     标准：范围明确 / 不紧急 / 5-10 个功能条目 / 独立单元

  7. 首次 commit：
       git add -A
       git commit -m "chore: adopt Triad Workflow (non-destructive)"
       git push

  8. 启动 Claude CLI，跑第一个批次：
       "根据 harness 规则，我要开发 [试点需求描述]"

详细指南：framework/docs/04-adopt-existing-project.md

EOF

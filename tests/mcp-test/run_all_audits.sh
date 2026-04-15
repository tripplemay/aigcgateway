#!/bin/bash

# 定义颜色输出，让终端看着更酷
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# F-AF-04: --dry-run-retry strips real claude calls and forces the first
# attempt of each prompt to fail so we can verify the retry/backoff path
# without spending a real audit run.
DRY_RUN_RETRY=0
for arg in "$@"; do
  case "$arg" in
    --dry-run-retry) DRY_RUN_RETRY=1 ;;
  esac
done

# Track roles that exhausted retries so they can be surfaced in the aggregate
# JSON and flagged in the summary.
FAILED_ROLES=()
FAILED_RETRIES=()

echo -e "${BLUE}==================================================${NC}"
echo -e "${BLUE}  AIGC Gateway 饱和式并发审计程序已启动...${NC}"
echo -e "${BLUE}==================================================${NC}"

# 1. 打印当前代理设置
echo -e "${YELLOW}>> 当前终端代理配置: HTTPS_PROXY=${https_proxy} HTTP_PROXY=${http_proxy}${NC}"

# 2. 探测实际出口 IP
echo -e "${YELLOW}>> 正在探测实际出口 IP...${NC}"
CURRENT_IP=$(curl -s --connect-timeout 5 ifconfig.me || echo "获取失败，请检查代理网络是否畅通")
echo -e "${YELLOW}>> 当前实际出口 IP: ${CURRENT_IP}${NC}"
echo -e "${BLUE}==================================================${NC}"

# 3. 人工拦截确认开关
read -p "  请确认代理配置与出口 IP 是否正确。按回车键 (Enter) 确认开火，或按 Ctrl+C 立即中止..."

echo -e "\n${BLUE}  指挥官确认完毕，开始向后台投放特工...${NC}"

# 获取日期和时间
CURRENT_DATE=$(date +"%Y%m%d")
CURRENT_TIME=$(date +"%Y-%m-%d %H:%M:%S (UTC+8)")

# 结构化断言 footer（拼接到每个 prompt 后面）
ASSERTION_FOOTER=$(cat "$SCRIPT_DIR/assertion-footer.md")

# 报告输出目录
REPORT_DIR="$SCRIPT_DIR/reports-${CURRENT_DATE}"
mkdir -p "$REPORT_DIR"

# 创建干净的执行目录（避免加载项目 CLAUDE.md / harness-rules / hooks 等重上下文）
CLEAN_CWD="/tmp/mcp-audit-$$"
mkdir -p "$CLEAN_CWD"

# F-AF-04: MCP health preflight. Fire a trivial list_models call and abort
# the whole batch if it doesn't come back cleanly — previously the entire
# Chaos/Workflow runs would complete with hallucinated assertions when the
# MCP session failed to initialize at all.
if [ "$DRY_RUN_RETRY" -eq 0 ]; then
  echo -e "${YELLOW}>> MCP preflight: list_models...${NC}"
  PREFLIGHT_OUT=$(cd "$CLEAN_CWD" && claude -p "Call the list_models MCP tool and respond with only the integer number of models returned." --allowedTools "mcp__aigc-gateway__list_models" 2>&1)
  PREFLIGHT_RC=$?
  if [ $PREFLIGHT_RC -ne 0 ] || ! echo "$PREFLIGHT_OUT" | grep -qE '[0-9]+'; then
    echo -e "${RED}  MCP preflight failed (rc=$PREFLIGHT_RC). Aborting batch.${NC}"
    echo -e "${RED}  Output: $PREFLIGHT_OUT${NC}"
    rm -rf "$CLEAN_CWD"
    exit 2
  fi
  echo -e "${GREEN}  MCP preflight OK.${NC}"
else
  echo -e "${YELLOW}>> --dry-run-retry: skipping preflight.${NC}"
fi

PROMPTS=(
  "FinOps-Audit-Prompt.md"
  "Chaos-Audit-Prompt.md"
  "Workflow-Audit-Prompt.md"
  "RateLimit-Audit-Prompt.md"
  "Tenancy-Audit-Prompt.md"
  "Modality-Audit-Prompt.md"
  "Onboarding-Trial-Prompt.md"
  "dx-audit-prompt.md"
)

for prompt_file in "${PROMPTS[@]}"; do
  if [ -f "$SCRIPT_DIR/$prompt_file" ]; then
    REPORT_FILE="$REPORT_DIR/${prompt_file%-Prompt.md}-Report-${CURRENT_DATE}.md"

    echo -e "${YELLOW}>> 正在执行特工任务: ${prompt_file}...${NC}"

    # 初始化文件头
    echo "# 审计执行报告" > "$REPORT_FILE"
    echo "> **审计时间**：${CURRENT_TIME}" >> "$REPORT_FILE"
    echo "> **审计角色**：${prompt_file%-Prompt.md}" >> "$REPORT_FILE"
    echo -e "---\n" >> "$REPORT_FILE"

    # 拼接：语言指令 + 原始 prompt + 结构化断言 footer
    FULL_PROMPT="重要：请全程使用中文撰写报告，包括所有分析、结论和建议。JSON 中的 description/assertion/actual/expected 字段也使用中文。

$(cat "$SCRIPT_DIR/$prompt_file")

${ASSERTION_FOOTER}"

    # F-AF-04: run each prompt with up to two retries and exponential
    # backoff (5s, 15s). Under --dry-run-retry we swap the real claude
    # invocation for a deterministic failure that recovers on attempt 3
    # so the retry path can be validated offline.
    ROLE_NAME="${prompt_file%-Prompt.md}"
    BACKOFFS=(5 15)
    MAX_ATTEMPTS=3
    ATTEMPT=1
    ROLE_OK=0
    while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
      if [ "$DRY_RUN_RETRY" -eq 1 ]; then
        if [ $ATTEMPT -lt $MAX_ATTEMPTS ]; then
          echo "[dry-run-retry] simulated failure attempt $ATTEMPT" | tee -a "$REPORT_FILE"
          RC=1
        else
          echo '```json' >> "$REPORT_FILE"
          echo '{"assertions": [{"id":"DRY-RUN","severity":"info","description":"dry-run-retry recovery","assertion":"ok","actual":"ok","expected":"ok"}]}' >> "$REPORT_FILE"
          echo '```' >> "$REPORT_FILE"
          RC=0
        fi
      else
        (cd "$CLEAN_CWD" && claude -p "$FULL_PROMPT" --allowedTools "mcp__aigc-gateway__*") | tee -a "$REPORT_FILE"
        RC=${PIPESTATUS[0]}
      fi

      if [ $RC -eq 0 ]; then
        ROLE_OK=1
        break
      fi

      if [ $ATTEMPT -lt $MAX_ATTEMPTS ]; then
        SLEEP_S=${BACKOFFS[$((ATTEMPT - 1))]}
        echo -e "${YELLOW}  ${ROLE_NAME} attempt ${ATTEMPT} failed (rc=$RC), retrying in ${SLEEP_S}s...${NC}" | tee -a "$REPORT_FILE"
        sleep "$SLEEP_S"
      fi
      ATTEMPT=$((ATTEMPT + 1))
    done

    if [ $ROLE_OK -eq 0 ]; then
      echo -e "${RED}  ${ROLE_NAME} exhausted retries, marking as failed.${NC}"
      FAILED_ROLES+=("$ROLE_NAME")
      FAILED_RETRIES+=("$((ATTEMPT - 1))")
    else
      echo -e "\n${GREEN}  任务 ${prompt_file} 已完成 (attempts=$ATTEMPT)。报告: ${REPORT_FILE}${NC}\n"
    fi
    echo -e "${BLUE}--------------------------------------------------${NC}"
  else
    echo -e "${RED}  找不到文件: $prompt_file，跳过。${NC}"
  fi
done

# ============================================================
# 阶段二：从所有报告中提取断言，汇总为 JSON
# ============================================================
echo -e "\n${BLUE}==================================================${NC}"
echo -e "${BLUE}  正在从审计报告中提取结构化断言...${NC}"
echo -e "${BLUE}==================================================${NC}"

ASSERTIONS_FILE="$REPORT_DIR/all-assertions-${CURRENT_DATE}.json"

# F-ACF-12: pause to let any buffered report writes hit disk before aggregation.
sleep 2

# F-AF-04: serialize the failed-role list into a JSON array so the python
# aggregator can embed it into the final output without extra plumbing.
FAILED_ROLES_JSON="[]"
if [ ${#FAILED_ROLES[@]} -gt 0 ]; then
  FAILED_ROLES_JSON="["
  for i in "${!FAILED_ROLES[@]}"; do
    sep=","
    [ $i -eq 0 ] && sep=""
    FAILED_ROLES_JSON+="${sep}{\"role\":\"${FAILED_ROLES[$i]}\",\"retries\":${FAILED_RETRIES[$i]}}"
  done
  FAILED_ROLES_JSON+="]"
fi
export FAILED_ROLES_JSON

# 用 python3 从所有报告中提取 JSON 代码块中的 assertions
python3 -c "
import json, re, glob, sys

all_assertions = []
by_role = {}
report_dir = sys.argv[1]

reports = sorted(glob.glob(f'{report_dir}/*-Report-*.md'))
if not reports:
    sys.stderr.write(f'WARNING: no reports in {report_dir}\n')

for report_path in reports:
    with open(report_path, 'r') as f:
        content = f.read()

    role = report_path.rsplit('/', 1)[-1].split('-Report-')[0]
    role_count = 0

    blocks = list(re.finditer(r'\`\`\`json\s*\n(.*?)\n\`\`\`', content, re.DOTALL))
    if not blocks:
        sys.stderr.write(f'WARNING: no json block in {report_path}\n')

    for match in blocks:
        try:
            data = json.loads(match.group(1))
        except json.JSONDecodeError as e:
            sys.stderr.write(f'WARNING: json parse error in {report_path}: {e}\n')
            continue
        if 'assertions' in data and isinstance(data['assertions'], list):
            for a in data['assertions']:
                a['source_role'] = role
            all_assertions.extend(data['assertions'])
            role_count += len(data['assertions'])

    by_role[role] = role_count
    print(f'  {role}: {role_count} 条断言')

import os
try:
    failed_roles = json.loads(os.environ.get('FAILED_ROLES_JSON', '[]'))
except Exception:
    failed_roles = []

output = {
    'extracted_at': '$(date -u +"%Y-%m-%dT%H:%M:%SZ")',
    'total': len(all_assertions),
    'by_severity': {},
    'by_role': by_role,
    'failed_roles': failed_roles,
    'assertions': all_assertions,
}

for a in all_assertions:
    sev = a.get('severity', 'unknown')
    output['by_severity'][sev] = output['by_severity'].get(sev, 0) + 1

with open(sys.argv[2], 'w') as f:
    json.dump(output, f, indent=2, ensure_ascii=False)

print(f'  提取完成：共 {len(all_assertions)} 条断言')
for sev, count in sorted(output['by_severity'].items()):
    print(f'    {sev}: {count}')
" "$REPORT_DIR" "$ASSERTIONS_FILE"

if [ $? -eq 0 ]; then
  echo -e "${GREEN}  断言汇总文件: ${ASSERTIONS_FILE}${NC}"
else
  echo -e "${RED}  断言提取失败，请检查报告格式${NC}"
fi

# 清理临时执行目录
rm -rf "$CLEAN_CWD"

echo -e "\n${GREEN}==================================================${NC}"
echo -e "${GREEN}  全量审计流程已结束！${NC}"
echo -e "${GREEN}  报告目录: ${REPORT_DIR}${NC}"
echo -e "${GREEN}==================================================${NC}"

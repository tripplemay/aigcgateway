#!/bin/bash

# 定义颜色输出，让终端看着更酷
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

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

    # 在干净目录执行，避免加载项目上下文（CLAUDE.md / hooks / rules）
    (cd "$CLEAN_CWD" && claude -p "$FULL_PROMPT" --allowedTools "mcp__aigc-gateway__*") | tee -a "$REPORT_FILE"

    echo -e "\n${GREEN}  任务 ${prompt_file} 已完成。报告: ${REPORT_FILE}${NC}\n"
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

# 用 python3 从所有报告中提取 JSON 代码块中的 assertions
python3 -c "
import json, re, glob, sys

all_assertions = []
report_dir = sys.argv[1]

for report_path in sorted(glob.glob(f'{report_dir}/*-Report-*.md')):
    with open(report_path, 'r') as f:
        content = f.read()

    # 从报告文件名提取审计角色
    role = report_path.rsplit('/', 1)[-1].split('-Report-')[0]

    # 匹配 JSON 代码块
    for match in re.finditer(r'\`\`\`json\s*\n(.*?)\n\`\`\`', content, re.DOTALL):
        try:
            data = json.loads(match.group(1))
            if 'assertions' in data and isinstance(data['assertions'], list):
                for a in data['assertions']:
                    a['source_role'] = role
                all_assertions.extend(data['assertions'])
        except json.JSONDecodeError:
            continue

output = {
    'extracted_at': '$(date -u +"%Y-%m-%dT%H:%M:%SZ")',
    'total': len(all_assertions),
    'by_severity': {},
    'assertions': all_assertions
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

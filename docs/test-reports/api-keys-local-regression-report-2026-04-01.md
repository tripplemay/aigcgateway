# API Keys 本地回归报告

## Summary

- Scope:
  - 在本地测试环境 `http://localhost:3099` 回归验证上一轮 API Keys 报告中的 3 个遗留问题
  - 仅验证：
    - 搜索无结果后清空是否恢复
    - `edit` 按钮是否仍为 disabled 占位
    - 列表是否仍存在误导性复制按钮
- Documents:
  - `docs/test-reports/api-keys-frontend-retest-report-2026-04-01-round2.md`
  - `docs/test-reports/api-keys-production-manual-test-report-2026-04-01.md`
  - `docs/api-keys-frontend-spec.md`
- Environment:
  - 本地 Codex 测试环境
  - 站点：`http://localhost:3099`
  - 启动方式：按最新 `AGENTS.md`，在持久 PTY 会话中前台执行 `bash scripts/test/codex-restart.sh`
  - 管理员账号：`admin@aigc-gateway.local / admin123`
  - 测试项目：`Codex API Keys Local Regression`
- Result totals:
  - PASS: 2
  - FAIL: 1
  - BLOCKED: 0

## 覆盖摘要

- 已覆盖：
  - `/keys` 页面 hydration 与静态资源加载
  - ACTIVE 行 `edit` 按钮占位状态
  - 列表是否出现误导性复制按钮
  - 搜索无结果后清空恢复路径
- 结论：
  - 本地环境阻塞问题已消失
  - 3 个遗留点中 2 个通过，1 个仍失败

## Test Cases

- TC-RG-001 `edit` 按钮占位状态回归 - PASS
  - Preconditions:
    - 本地项目与 6 条 key 数据已创建
  - Steps:
    1. 打开 `/keys`
    2. 观察首屏 ACTIVE 行操作列
  - Expected Result:
    - `edit` 为 disabled，占位文案保持 `Coming soon`
  - Result: PASS
  - Evidence:
    - 首屏 5 条 ACTIVE 行均显示 disabled `edit`
    - Chrome MCP 快照中按钮描述为 `Coming soon`

- TC-RG-002 列表误导性复制按钮回归 - PASS
  - Preconditions:
    - 列表正常渲染
  - Steps:
    1. 检查首屏 ACTIVE 行操作列
  - Expected Result:
    - 不出现误导性的复制按钮
  - Result: PASS
  - Evidence:
    - 操作列仅有 `edit` 和 `block`
    - 列表仍只展示掩码 key 文本，不提供复制入口

- TC-RG-003 搜索清空恢复回归 - FAIL
  - Preconditions:
    - `/keys` 列表已正常渲染
  - Steps:
    1. 在搜索框输入 `NoSuchKey`
    2. 页面出现 `No keys found`
    3. 直接将输入框清空
  - Expected Result:
    - 清空后应立即恢复默认列表结果
  - Result: FAIL
  - Observed Behavior:
    - 输入框已空
    - 页面仍停留在 `No keys found`
    - 只有点击搜索框右侧 `X` 按钮时，列表才恢复
  - Evidence:
    - 截图：`docs/test-reports/api-keys-local-regression-2026-04-01-search-clear-still-failed.png`

## Defects

- [Medium] 搜索无结果后，直接清空输入框仍不恢复列表
  - Impact:
    - 用户通过键盘删除搜索词时无法回到默认列表，仍需额外点击 `X`
  - Reproduction:
    1. 进入 `http://localhost:3099/keys`
    2. 搜索 `NoSuchKey`
    3. 待页面显示 `No keys found`
    4. 直接清空输入框
  - Actual:
    - 列表不恢复
  - Expected:
    - 恢复默认分页列表
  - Note:
    - 点击搜索框右侧清除按钮 `X` 后可以恢复，说明问题缩小到“直接清空输入框”的交互路径

## 风险项

- 当前本地服务虽已恢复页面可用，但启动日志中仍有若干 `react-hooks/exhaustive-deps` warnings
  - 不影响本轮回归结论

## 证据文件

- 报告：
  - `docs/test-reports/api-keys-local-regression-report-2026-04-01.md`
- 截图：
  - `docs/test-reports/api-keys-local-regression-2026-04-01-search-clear-still-failed.png`

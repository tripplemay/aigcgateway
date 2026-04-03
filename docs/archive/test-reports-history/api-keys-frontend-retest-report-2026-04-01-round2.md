# API Keys 前端回归报告（Round 2）

- 测试目标：回归验证上一轮 API Keys 页面 3 个问题在 Claude 修改后的状态
- 测试环境：本地测试环境 `http://127.0.0.1:3099`
- 测试范围：
  - 搜索无结果后清空搜索框，列表是否恢复
  - ACTIVE 行 `edit` 按钮是否仍为无行为缺陷
  - 列表行是否仍提供误导性的掩码值复制按钮
- 执行时间：`2026-04-01 19:41:54 CST`

## 执行步骤概述

1. 按 `AGENTS.md` 约定先执行 `bash scripts/test/codex-restart.sh`
2. 确认脚本完成 `build`，但 `3099` 端口未持续监听，无法直接用于页面回归
3. 保持相同测试数据库与环境变量，使用前台 `next start --port 3099` 稳定启动本地服务
4. 通过 `/api/auth/login` 获取管理员 token
5. 使用 Chrome MCP 访问 `/keys`
6. 在正常列表页确认 ACTIVE 行按钮状态与操作列表现
7. 输入不存在的关键字 `NoSuchKey`
8. 页面出现 `No keys found` 后，将搜索框清空
9. 观察列表是否自动恢复

## 通过项

- ACTIVE 行 `edit` 按钮未回退
  - 正常列表首屏中，ACTIVE 行 `edit` 按钮为 disabled 状态
  - Chrome MCP 快照显示按钮带有 `Coming soon` 描述
- 列表掩码复制问题未回退
  - 正常列表首屏中，ACTIVE 行操作列未出现 `content_copy` 按钮
  - 列表仅展示掩码值文本，不再提供误导性复制入口

## 失败项

- 搜索清空后列表仍不恢复，问题继续稳定复现
  - 复现步骤：
    1. 打开 `/keys`
    2. 在“搜索密钥...”输入框中输入 `NoSuchKey`
    3. 页面显示 `No keys found`
    4. 清空输入框
    5. 等待页面重新渲染
  - 实际结果：
    - 输入框已为空
    - 页面仍显示 `No keys found`
    - 列表未恢复到原始 7 条数据分页视图
  - 预期结果：
    - 清空搜索后，页面应恢复默认列表结果
  - 是否稳定复现：是

## 风险项

- `scripts/test/codex-restart.sh` 仍存在环境稳定性问题
  - 本轮脚本能成功 `build` 并输出 ready 文案
  - 但脚本退出后 `3099` 未持续监听，`curl` 与 `lsof` 均确认服务未留存
  - 因此本轮页面验证改为前台 `next start` 方式完成
- 浏览器旧标签页会保留先前失败状态
  - 旧会话标签页可能停留在空表状态
  - 新开标签页后可正常加载列表，因此本轮以新开页的首屏与复现路径为准

## 证据链接或文件路径

- 正常列表截图：[api-keys-retest-2026-04-01-list-normal.png](/Users/zhouyixing/project/aigcgateway/docs/test-reports/api-keys-retest-2026-04-01-list-normal.png)
- 搜索清空失败截图：[api-keys-retest-2026-04-01-search-clear-failed.png](/Users/zhouyixing/project/aigcgateway/docs/test-reports/api-keys-retest-2026-04-01-search-clear-failed.png)
- 本报告：[api-keys-frontend-retest-report-2026-04-01-round2.md](/Users/zhouyixing/project/aigcgateway/docs/test-reports/api-keys-frontend-retest-report-2026-04-01-round2.md)

## 最终结论

本轮 3 个回归点中，`edit` 按钮和列表复制行为均保持修复状态，没有回退；搜索清空后列表不恢复的问题仍未修复，且可稳定复现。当前 API Keys 页面不能判定为全部通过验收。

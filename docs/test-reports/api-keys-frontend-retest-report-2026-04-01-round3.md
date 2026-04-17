# API Keys 前端回归报告（Round 3）

- 测试目标：在 Claude 再次修改后，继续回归验证 API Keys 页面上一轮剩余问题
- 测试环境：本地测试环境 `http://127.0.0.1:3099`
- 测试范围：
  - 搜索无结果后清空搜索框，列表是否恢复
  - ACTIVE 行 `edit` 按钮是否回退
  - 列表行是否重新出现掩码值复制按钮
- 执行时间：`2026-04-01 19:51:42 CST`

## 执行步骤概述

1. 先执行 `bash scripts/test/codex-restart.sh`
2. 脚本完成 `build` 并输出 ready 文案，但 `3099` 端口未持续监听
3. 采用前台 `next start --port 3099` 保持本地服务稳定
4. 管理员登录获取 token，并使用已有测试项目 `Codex API Keys QA Project`
5. 使用 Chrome MCP 新开干净标签页访问 `/keys`
6. 验证首屏列表、ACTIVE 行按钮状态、列表操作列
7. 输入不存在关键字 `NoSuchKey`
8. 页面出现 `No keys found` 后清空搜索框
9. 额外等待 4 秒，观察列表是否恢复

## 通过项

- ACTIVE 行 `edit` 按钮未回退
  - 首屏列表中，ACTIVE 行仍为 disabled 状态
  - 按钮描述仍为 `Coming soon`
- 列表掩码复制问题未回退
  - 操作列未重新出现 `content_copy` 按钮
  - 列表仅展示掩码值文本

## 失败项

- 搜索清空后列表仍不恢复，问题继续稳定复现
  - 复现步骤：
    1. 打开 `/keys`
    2. 在“搜索密钥...”输入 `NoSuchKey`
    3. 页面显示 `No keys found`
    4. 清空输入框
    5. 继续等待 4 秒
  - 实际结果：
    - 搜索框已为空
    - 页面仍停留在 `No keys found`
    - 原有列表项如 `UI Created Key`、`Zeta Internal` 未恢复
  - 预期结果：
    - 清空搜索后应自动恢复默认列表
  - 是否稳定复现：是

## 风险项

- `scripts/test/codex-restart.sh` 仍然无法把 `3099` 稳定留存
  - ready 文案与日志存在
  - 但脚本退出后 `lsof` 与 `curl` 均确认服务已不可达
  - 本轮页面验证仍只能依赖前台 `next start`

## 证据链接或文件路径

- 本轮失败截图：[api-keys-retest-2026-04-01-round3-search-clear-failed.png](/Users/zhouyixing/project/aigcgateway/docs/test-reports/api-keys-retest-2026-04-01-round3-search-clear-failed.png)
- 本报告：[api-keys-frontend-retest-report-2026-04-01-round3.md](/Users/zhouyixing/project/aigcgateway/docs/test-reports/api-keys-frontend-retest-report-2026-04-01-round3.md)
- 上轮正常列表截图仍可参考：[api-keys-retest-2026-04-01-list-normal.png](/Users/zhouyixing/project/aigcgateway/docs/test-reports/api-keys-retest-2026-04-01-list-normal.png)

## 最终结论

本轮回归结论没有变化。`edit` 按钮和列表复制行为维持修复状态，但搜索清空后列表不恢复的问题仍未修复，当前 API Keys 页面仍不能判定为全部通过验收。

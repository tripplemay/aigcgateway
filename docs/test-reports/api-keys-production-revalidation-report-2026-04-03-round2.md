# API Keys 生产环境回归报告（Round 2）

- 测试目标：在生产环境最新更新后，再次确认 API Keys 页面剩余搜索交互问题是否修复
- 测试环境：生产环境 `https://aigc.guangai.ai`
- 执行时间：`2026-04-03 15:15:00 CST`
- 生产测试开关：
  - `PRODUCTION_STAGE=RND`
  - `PRODUCTION_DB_WRITE=ALLOW`
  - `HIGH_COST_OPS=ALLOW`

## 测试范围

- `/keys` 搜索无结果后，手动清空搜索框的恢复行为
- `/keys` 列表默认结果是否仍正常

## 执行步骤概述

1. 沿用浏览器现有生产登录会话进入 `/keys`
2. 先点击搜索框旁 `close`，将页面恢复到默认列表状态
3. 确认列表首屏仍为 `5 / 7 keys`
4. 在 `Search keys...` 输入 `NoSuchKey`
5. 页面出现 `No keys found`
6. 直接把输入框内容清空为 `""`
7. 观察列表是否自动恢复

## 通过项

- 默认列表状态仍正常
  - 页面恢复后仍显示 `5 / 7 keys`
  - 列表前 5 条记录与分页控件正常可见

## 失败项

- 手动清空搜索框后，列表仍不自动恢复
  - 复现步骤：
    1. 打开 `/keys`
    2. 输入 `NoSuchKey`
    3. 页面显示 `No keys found`
    4. 直接清空输入框
  - 实际结果：
    - 输入框已为空
    - 搜索框旁仍保留 `close` 按钮
    - 页面继续显示 `No keys found`
    - 默认列表未自动恢复
  - 预期结果：
    - 输入框变为空后，应立即恢复默认列表
  - 是否稳定复现：是

## 风险项

- 当前线上只新增了 `close` 恢复路径，但没有真正修正“输入框值为空时自动恢复列表”的核心行为
- 这意味着用户如果用键盘删除、选中后清空、粘贴清空等常见方式操作，仍会落在错误状态

## 证据链接或文件路径

- 本轮失败截图：[api-keys-production-revalidation-2026-04-03-round2-search-clear-failed.png](/Users/zhouyixing/project/aigcgateway/docs/test-reports/api-keys-production-revalidation-2026-04-03-round2-search-clear-failed.png)
- 本报告：[api-keys-production-revalidation-report-2026-04-03-round2.md](/Users/zhouyixing/project/aigcgateway/docs/test-reports/api-keys-production-revalidation-report-2026-04-03-round2.md)
- 上一轮详情页恢复证据：[api-keys-production-revalidation-2026-04-03-key-settings.png](/Users/zhouyixing/project/aigcgateway/docs/test-reports/api-keys-production-revalidation-2026-04-03-key-settings.png)

## 最终结论

本轮生产回归结论仍为：`部分通过`。

此前已确认修复的两项没有回退：

- `/keys` 列表分页恢复正常
- `/keys/[keyId]` 详情页恢复可用

但剩余问题仍未修复：

- 手动清空搜索框后，列表不会自动恢复，仍需额外点击 `close` 按钮才能回到默认结果集

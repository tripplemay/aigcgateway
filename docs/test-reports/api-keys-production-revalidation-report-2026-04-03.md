# API Keys 生产环境回归报告

- 测试目标：验证生产环境最新更新后，API Keys 页面上一轮关键失败项是否修复
- 测试环境：生产环境 `https://aigc.guangai.ai`
- 执行时间：`2026-04-03 15:02:21 CST`
- 生产测试开关：
  - `PRODUCTION_STAGE=RND`
  - `PRODUCTION_DB_WRITE=ALLOW`
  - `HIGH_COST_OPS=ALLOW`

## 测试范围

- `/keys` 列表页加载与分页表现
- `/keys` 搜索无结果后清空输入框的恢复行为
- 列表行 `edit` 入口表现
- `/keys/[keyId]` 详情页可用性

## 执行步骤概述

1. 以管理员账号执行生产登录，获取只读访问 token
2. 使用 Chrome MCP 打开生产环境 `/keys`
3. 注入 token，复核 API Keys 列表页首屏与分页总量
4. 在列表页输入不存在关键字 `NoSuchKey`
5. 清空搜索框，观察列表是否自动恢复
6. 点击搜索框旁新增的 `close` 按钮，观察列表是否恢复
7. 从列表页进入 `/keys/[keyId]` 详情页，确认页面能否正常渲染
8. 额外以 `curl` 复核列表接口，但接口在 shell 中 10 秒超时，未作为页面结论依据

## 通过项

- `/keys` 列表页已恢复真实数据展示
  - 页面首屏显示 `5 / 7 keys`
  - 列表展示 5 条记录，并带 `Prev / 1 / 2 / Next` 分页控件
  - 这与上一轮生产验收中的 `1 / 1 keys` 明显不同
- 列表行 `edit` 已从占位状态变为真实详情入口
  - ACTIVE 行显示可点击 `edit` 链接
- `/keys/[keyId]` 详情页已恢复可用
  - 进入 `https://aigc.guangai.ai/keys/cmniamklw0001rn0n2p7nu1lm` 后，页面成功渲染
  - 可见 `General Information`、`Permissions`、`Security & Limits`、`API Key`、`Danger Zone` 等模块
  - 不再停留在全页 `Loading...`
- 搜索框旁新增的 `close` 按钮可恢复列表
  - 搜索无结果后点击 `close`，列表恢复为默认结果集

## 失败项

- 手动清空搜索框后，列表仍不自动恢复
  - 复现步骤：
    1. 打开 `/keys`
    2. 在 `Search keys...` 输入 `NoSuchKey`
    3. 页面显示 `No keys found`
    4. 将输入框内容手动清空为 `""`
  - 实际结果：
    - 输入框已经为空
    - 搜索框旁仍显示 `close` 按钮
    - 页面继续停留在 `No keys found`
    - 默认列表未自动恢复
  - 预期结果：
    - 只要输入框内容已被清空，列表就应立即恢复默认结果
  - 是否稳定复现：是

## 风险项

- `curl` 直连 `GET /api/projects/:id/keys?page=1&pageSize=20` 在 shell 中 10 秒超时
  - 但浏览器内 `/keys` 页面与 `/keys/[keyId]` 页面都能真实加载数据
  - 因此当前更像接口层的单独性能/可达性风险，而不是本轮页面渲染阻塞
- 共享布局中的图标字面量泄漏仍然存在，例如 `search`、`smart_toy`、`terminal`、`payments`
  - 本轮重点不是该问题，但在生产页面中仍然可见

## 证据链接或文件路径

- 详情页截图：[api-keys-production-revalidation-2026-04-03-key-settings.png](/Users/zhouyixing/project/aigcgateway/docs/test-reports/api-keys-production-revalidation-2026-04-03-key-settings.png)
- 搜索清空失败截图：[api-keys-production-revalidation-2026-04-03-search-clear-failed.png](/Users/zhouyixing/project/aigcgateway/docs/test-reports/api-keys-production-revalidation-2026-04-03-search-clear-failed.png)
- 本报告：[api-keys-production-revalidation-report-2026-04-03.md](/Users/zhouyixing/project/aigcgateway/docs/test-reports/api-keys-production-revalidation-report-2026-04-03.md)

## 最终结论

本轮生产回归结论为：`部分通过`。

已确认修复：

- `/keys` 列表分页显示恢复正常
- `/keys/[keyId]` 详情页恢复可用

仍未修复：

- 手动清空搜索框后，列表不自动恢复；当前只能通过新增的 `close` 按钮恢复结果集

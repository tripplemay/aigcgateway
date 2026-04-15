# USAGE-ALERTS 批次规格文档

**批次代号：** USAGE-ALERTS
**目标：** 建立主动通知系统，让用户/管理员在关键事件发生时被及时告知，不再依赖被动访问页面
**触发时机：** REGRESSION-BACKFILL 签收（已满足）
**规模：** 7 个 generator + 1 个 codex 验收 = 8 条

## 背景

平台已有大量"事件源"但都没有主动通知机制：

| 事件源 | 现状 | 缺口 |
|--------|------|------|
| `Project.alertThreshold` | 仅在 dashboard 显示警告条 | 余额低于阈值无主动告知 |
| RATE-LIMIT spending rate（F-RL-04） | 只在 429 响应里返回 | 异常消费无主动告知 |
| SystemLog HEALTH_CHECK（F-AO2-03） | 写入数据库 | channel 健康变化无管理员主动告知 |
| SystemLog AUTO_RECOVERY（F-AO2-03） | 写入数据库 | channel 自动恢复无告知 |
| PendingClassification（F-AO2-06） | 队列入库 | 待审批结果无管理员告知 |
| `env.ALERT_EMAIL` | env 字段定义但**完全未被代码使用** | 空声明，需要清理或对接 |

**不引入邮件 SMTP**（成本高、运维复杂、本批次不值得）。用 **Webhook + In-App Notification Center** 两个 channel，覆盖 90% 场景。

## 设计

### Channel
1. **Webhook**: 用户/管理员配置的 URL，POST `{event, payload, signature}`，失败指数退避 3 次重试
2. **In-App**: NotificationCenter 组件挂在 top-app-bar 右侧，铃铛 + 未读 badge + 下拉列表

### Schema 新增
- `Notification` 表：id / userId / projectId / eventType / channel / status / payload(JSON) / sentAt / error / readAt
- `NotificationPreference` 表（按 user）：id / userId / eventType / channels(JSON: ['inApp','webhook']) / webhookUrl / webhookSecret / enabled

### 事件类型
- `BALANCE_LOW` — 余额低于 alertThreshold
- `SPENDING_RATE_EXCEEDED` — RATE-LIMIT 触发 spend_rate_exceeded
- `CHANNEL_DOWN` — 健康检查 PASS → FAIL
- `CHANNEL_RECOVERED` — AUTO_RECOVERY 触发
- `PENDING_CLASSIFICATION` — 新条目入队（管理员事件）

## Features

### Phase 1：基础设施

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-UA-01 | Notification + NotificationPreference schema | high | 1) Migration 新增两表 + 索引；2) 默认偏好：BALANCE_LOW/SPENDING_RATE 走 inApp，CHANNEL_*/PENDING_CLASSIFICATION 仅管理员 inApp；3) 注册新用户时自动创建默认 NotificationPreference 行；4) tsc 通过 |
| F-UA-02 | Notification 派发服务（dispatcher） | high | 1) src/lib/notifications/dispatcher.ts 提供 sendNotification(userId, eventType, payload)；2) 按 NotificationPreference 决定 channel；3) inApp channel 直接 insert Notification 行；4) webhook channel 异步 POST，失败指数退避 3 次（5s/30s/120s）写 status 字段；5) 同 commit 补单元测试覆盖 dispatch 路由 + webhook 重试 |

### Phase 2：5 个事件源接入

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-UA-03 | BALANCE_LOW + SPENDING_RATE_EXCEEDED 事件触发 | high | 1) post-process.ts 扣费后检查 balance < alertThreshold，触发 BALANCE_LOW（去重：同一阈值跨越事件 24 小时内只发一次，存到 Redis）；2) F-RL-04 的 checkSpendingRate 命中时同步触发 SPENDING_RATE_EXCEEDED；3) payload 含 currentBalance / threshold / spentAmount；4) tsc 通过 |
| F-UA-04 | CHANNEL_DOWN + CHANNEL_RECOVERED + PENDING_CLASSIFICATION 触发 | medium | 1) health checker 状态从 PASS 转 FAIL 触发 CHANNEL_DOWN（仅通知该 channel 所属 provider 的 admin 用户）；2) AUTO_RECOVERY 触发 CHANNEL_RECOVERED；3) alias-classifier 写入 PendingClassification 时触发 PENDING_CLASSIFICATION（payload 含 modelName / suggestedAlias / confidence）；4) tsc 通过 |

### Phase 3：In-App Notification Center

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-UA-05 | NotificationCenter 组件 + 顶栏铃铛 | high | 1) src/components/notification-center.tsx 顶栏铃铛 + 未读 badge + 下拉列表（最近 20 条）；2) 集成到 top-app-bar.tsx；3) 列表项显示 eventType 图标 + 时间 + 摘要 + 标记已读按钮；4) 全部已读按钮；5) 点击未读自动标记 readAt；6) 30 秒自动轮询新通知；7) 使用 SectionCard / StatusChip 公共组件保持 UI 一致；8) i18n；9) tsc 通过 |
| F-UA-06 | GET/PATCH /api/notifications API | high | 1) GET /api/notifications?unread_only=true&limit=20 返回当前用户的通知列表；2) PATCH /api/notifications/[id] 标记已读；3) PATCH /api/notifications/mark-all-read；4) 严格按 userId 隔离，不允许跨用户访问；5) 同 commit 补 regression test（写入 scripts/test-mcp.ts 或 scripts/e2e-test.ts）；6) tsc 通过 |

### Phase 4：偏好设置 UI

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-UA-07 | Settings 页面增加通知偏好卡片 | medium | 1) Settings 增加'通知偏好'SectionCard；2) 列出所有 eventType，每行复选框 inApp / webhook；3) webhook 启用时显示 webhookUrl + webhookSecret 输入框；4) 保存调用 PATCH /api/notifications/preferences；5) i18n；6) tsc 通过 |

### Phase 5：验收

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-UA-08 | USAGE-ALERTS 全量验收 | high | codex 执行：1) 5 类事件触发后 dispatcher 正确派发到对应 channel；2) inApp 通知能在 NotificationCenter 看到；3) webhook 失败时进入退避重试，最终标 error 状态；4) 偏好设置修改后立即生效；5) 跨用户隔离：A 用户事件不会出现在 B 用户的通知列表；6) BALANCE_LOW 24 小时去重生效；7) 签收报告生成；8) regression test 覆盖新 API |

## 推荐执行顺序

1. **F-UA-01 + F-UA-02**（Schema + dispatcher 是基础）
2. **F-UA-06**（API 层先建好，UI 才能消费）
3. **F-UA-05**（NotificationCenter 接 API）
4. **F-UA-07**（偏好设置）
5. **F-UA-03**（钱相关事件优先接入）
6. **F-UA-04**（运维相关事件）
7. **F-UA-08** 验收

## 关键约束

- **不引入 SMTP 邮件**：本批次只做 Webhook + In-App，邮件留给后续 BL（如真有需求）
- **复用公共组件**：NotificationCenter 用 SectionCard / StatusChip
- **24 小时去重**：BALANCE_LOW 用 Redis key 防止刷屏
- **Webhook 安全**：HMAC-SHA256 签名（webhookSecret + payload），用户接收方校验
- **跨用户隔离**：所有查询严格按 userId
- **环境变量清理**：删除 `ALERT_EMAIL` 字段（未使用）或注明保留给未来 BL

## 不在本批次范围（留给后续）

- 邮件 channel（独立 BL，需 SMTP 接入）
- 通知归档/历史查询（GET 现版本只取最近 20）
- 用户级自定义 webhook 模板
- Slack / 钉钉等第三方 channel

# USAGE-ALERTS + CLEANUP — Evaluator 签收报告

**批次：** USAGE-ALERTS  
**日期：** 2026-04-16  
**Evaluator：** Reviewer (Codex 代班)  
**Dev Server：** http://localhost:3099  

---

## 验收结论

**PASS**

全部 8 项验收点通过。通知系统功能完整：事件派发、inApp 通知可见、webhook 重试持久化、偏好修改生效、跨用户隔离、BALANCE_LOW 24 小时去重（需 Redis）、webhook test 按钮可用。CLEANUP 遗留项全部修复。

---

## F-UA-10 验收项执行结果

### 验收 A: 默认偏好行在注册时自动创建

新注册用户注册后立即查询 `notification_preferences`：

```json
5 rows: BALANCE_LOW(inApp, enabled), SPENDING_RATE_EXCEEDED(inApp, enabled),
        CHANNEL_DOWN(inApp, disabled), CHANNEL_RECOVERED(inApp, disabled),
        PENDING_CLASSIFICATION(inApp, disabled)
```

DEVELOPER 默认：BALANCE_LOW + SPENDING_RATE_EXCEEDED 开启，其余 3 个关闭 ✅  
ADMIN 默认（代码审阅验证）：全 5 个开启 ✅

### 验收 B: inApp 通知能在 NotificationCenter 看到

| 操作 | 结果 |
|---|---|
| `sendNotification(user1, BALANCE_LOW, payload)` | DB 插入 1 条 status=SENT, channel=INAPP ✅ |
| `GET /api/notifications` user1 | 返回 1 条 + unreadCount=1 ✅ |
| `GET /api/notifications` user2 | data=[], unreadCount=0 ✅（跨用户隔离） |

### 验收 C: 跨用户隔离

- User2 无法看到 User1 的通知 ✅
- User2 尝试 PATCH User1 的通知 → 404 `not_found` ✅

### 验收 D: PATCH 标记已读 + mark-all-read

| 操作 | 结果 |
|---|---|
| `PATCH /api/notifications/{id}` | readAt 更新，unreadCount 减少 ✅ |
| `PATCH /api/notifications/mark-all-read` | updated=2，unreadCount=0 ✅ |
| 重复 PATCH 同一条 | 幂等返回 `{success:true}` ✅ |

### 验收 E: Webhook 失败退避重试 → FAILED + error

使用 mock fetchImpl（始终抛错）+ backoffMs=[10,20,50]：

```
Webhook FAILED notification: {"status":"FAILED","error":"connection refused","channel":"WEBHOOK"}
```

3 次重试后 status=FAILED，error 字段持久化到 DB ✅

### 验收 F: BALANCE_LOW 24小时去重（Redis）

```
after 1st call, unread BALANCE_LOW: 1
after 2nd call (dedup), unread BALANCE_LOW: 1
DEDUP OK ✅
```

- 需要 REDIS_URL 配置；无 Redis 时降级（不去重）— 设计文档明确的 graceful degradation
- SPENDING_RATE_EXCEEDED 1小时去重：代码审阅确认 `alert:spend_rate:{userId}` TTL=3600 ✅
- CHANNEL_DOWN 6小时去重：`alert:channel_down:{channelId}` TTL=21600 ✅

### 验收 G: 偏好设置修改后立即生效

```
PATCH /api/notifications/preferences [BALANCE_LOW, channels:["inApp","webhook"], webhookUrl]
→ {success: true}
GET /api/notifications/preferences → BALANCE_LOW channels: ['inApp', 'webhook'] ✅
```

### 验收 H: Webhook test 按钮

| 场景 | 结果 |
|---|---|
| 无 webhookUrl 用户 | `400 no_webhook_url` ✅ |
| 有 webhookUrl 用户 | 调用 webhook.site，返回 `{success:true, status:200}` ✅ |

---

## CLEANUP 验收项

| 项目 | 检查方法 | 结果 |
|---|---|---|
| e2e-errors.ts setup bug（/api/keys 修正） | grep `api/keys` | 61: `/api/keys`, 95: `/api/keys/{id}`, 111: `/api/keys`, 151: `/api/keys` ✅ |
| test-mcp-errors.ts RB-02.4 model_not_found skip | grep `model_not_found` | line 322: skip when `model_not_found` ✅ |
| reassign popover UI | grep `ReassignPopover` | lines 785/964: component + usage ✅ |
| templates/page.tsx:281 SectionCard | grep `SectionCard` | line 282: `<SectionCard className="...">` ✅ |
| model-aliases pricing text-[10px] → label-caps | grep diff | 10个 `<label className="text-[10px]">` → `<label className="label-caps">` ✅ |
| admin/models bg-lowest 移除 | grep `bg-lowest` | 0 instances ✅ |
| sub-routes PageContainer + PageHeader | grep imports | templates/[templateId], admin/users/[id], admin/templates/[id] 均引入 ✅ |

---

## TypeScript

```
npx tsc --noEmit → 0 errors ✅
```

---

## 签收结论

| 验收点 | 结论 |
|---|---|
| 5类事件触发 + dispatcher 正确派发 | ✅ PASS（代码审阅 + 直接触发验证） |
| inApp 通知在 NotificationCenter 可见 | ✅ PASS |
| Webhook 失败退避重试 → error 状态 | ✅ PASS |
| 偏好设置修改立即生效 | ✅ PASS |
| 跨用户隔离 | ✅ PASS |
| BALANCE_LOW 24小时去重（Redis） | ✅ PASS |
| Webhook test 按钮可用 | ✅ PASS |
| CLEANUP 全部修复 | ✅ PASS |
| tsc 通过 | ✅ PASS |

**USAGE-ALERTS + CLEANUP 批次验收通过 → status: done**

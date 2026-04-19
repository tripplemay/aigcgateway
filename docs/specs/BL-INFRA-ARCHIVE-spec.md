# BL-INFRA-ARCHIVE Spec

**批次：** BL-INFRA-ARCHIVE（P2-polish 第 2 批，**范围收缩**）
**负责人：** Planner = Kimi / Generator = 默认映射 / Evaluator = Reviewer
**创建：** 2026-04-20
**工时：** **0.5 day**（从原估 1d 收缩）
**源：** `docs/code-review/batch-05-database.md` H-3

## 背景

Code Review H-3 假设 "call_logs / system_logs / health_checks 6 个月后表体积数十 GB"。**2026-04-20 核实生产实际数据**：

| 表 | 当前行数 | 大小 | 最早数据 | 最近数据 | 日均 |
|---|---|---|---|---|---|
| **health_checks** | 109,828 | 42 MB | 2026-04-12 | 2026-04-19 | ~13.7K/天 |
| system_logs | 930 | 536 kB | 2026-04-11 | 2026-04-19 | ~115/天 |
| call_logs | 721 | 2.3 MB | 2026-03-30 | 2026-04-18 | ~36/天 |
| notifications | 0 | 48 kB | — | — | — |

**结论：** H-3 的 "数十 GB" 预测基于预期业务量，当前业务量远未到。真正的增长热点是 **health_checks**（自动化健康探针写入），月增约 400K 行 / 150 MB。其他表增长缓慢，分区收益极低。

## 目标

**范围收缩：只做 TTL 清理，不做分区。**

1. `health_checks` 保留最近 **30 天**，自动删除 30+ 天数据（月维持 ~400K 行 / 150 MB 稳态）
2. `system_logs` 保留最近 **90 天**（审计需要），自动删除 90+ 天数据
3. `call_logs` **暂不清理**（计费合规要求长期保留，当前 721 行无性能压力；未来业务量上来或法规要求变化再做独立批次）
4. 清理任务复用 BL-DATA-CONSISTENCY 的 scheduler 模式，接入现有 leader-lock（不多副本并行）

## 非目标

- 不做 call_logs 月度分区（YAGNI，等业务量 > 100K 行再做）
- 不做 S3 / 冷存归档（成本/收益不匹配当前体量）
- 不做 health_checks 降采样（保留原始数据便于故障回溯；TTL 过期直接 DELETE）
- 不改 notifications 清理（已在 BL-DATA-CONSISTENCY 完成）
- 不做 transactions / login_history 等审计表清理（合规关键，不动）

## 改动范围

### F-IA-01：health_checks + system_logs TTL scheduler

**文件：** 新建 `src/lib/maintenance/archive-cleanup.ts` + `src/lib/maintenance/scheduler.ts` + 接入 `src/instrumentation.ts`

**核心函数：**

```ts
// src/lib/maintenance/archive-cleanup.ts
const RETENTION_DAYS = {
  health_checks: 30,
  system_logs: 90,
};

export async function cleanupHealthChecks(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS.health_checks * 86400_000);
  const result = await prisma.healthCheck.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  console.log(`[archive] health_checks: deleted ${result.count} rows older than ${cutoff.toISOString()}`);
  return result.count;
}

export async function cleanupSystemLogs(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS.system_logs * 86400_000);
  const result = await prisma.systemLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  console.log(`[archive] system_logs: deleted ${result.count} rows older than ${cutoff.toISOString()}`);
  return result.count;
}
```

**Scheduler（每日执行）：**

```ts
// src/lib/maintenance/scheduler.ts
import { cleanupHealthChecks, cleanupSystemLogs } from "./archive-cleanup";
import { cleanupExpiredNotifications } from "@/lib/notifications/cleanup";  // BL-DATA-CONSISTENCY 产物

export function startMaintenanceScheduler(): () => void {
  const runAll = async () => {
    try {
      await cleanupExpiredNotifications();
      await cleanupHealthChecks();
      await cleanupSystemLogs();
    } catch (err) {
      console.error("[archive] scheduler tick failed", err);
    }
  };
  void runAll();
  const timer = setInterval(() => void runAll(), 24 * 3600_000);  // 24h
  return () => clearInterval(timer);
}
```

**instrumentation.ts 接入：**

- 复用 BL-SEC-INFRA-GUARD 的 leader-lock，**仅 leader 节点启动 scheduler**
- 可以并入 F-DC-03 已有的 `startNotificationsCleanupScheduler()`（或直接替换为 `startMaintenanceScheduler`）

**单测：**

- `archive-cleanup.test.ts`：
  - `cleanupHealthChecks` 删除 31 天前数据，保留 29 天内
  - `cleanupSystemLogs` 删除 91 天前，保留 89 天内
  - 返回删除行数
- scheduler 启动 tick 一次 + stop 清理 interval

### F-IA-02：全量验收（Evaluator）

**本地验证（4 项）：**

1. 构造测试数据（`createdAt` 跨 0/20/40/100 天前）运行 `cleanupHealthChecks` → 删除 40d/100d 行，保留 0d/20d
2. 同上 `cleanupSystemLogs` → 删除 100d 行，保留 40d
3. scheduler 启动后立即 tick 一次（无需等 24h）
4. Leader lock 未持有时 scheduler 不启动

**构建（3 项）：**

5. `npm run build` 通过
6. `npx tsc --noEmit` 通过
7. `npx vitest run` 全过（新增单测 PASS）

**生产只读预检（Codex SSH）：**

8. `SELECT COUNT(*) FROM health_checks WHERE "createdAt" < NOW() - INTERVAL '30 days';` 记录基线（当前 0，因为最早 2026-04-12）
9. `SELECT COUNT(*) FROM system_logs WHERE "createdAt" < NOW() - INTERVAL '90 days';` 同上
10. 确认 `call_logs` 表**未被本批次改动**（没有新增 DELETE / partition）

**部署后观察（生产 smoke，可选延后）：**

11. 生产部署后下一次 24h 调度后 `health_checks.COUNT(*)` 稳定在当日 +/- 新增（不应全删）
12. 日志出现 `[archive] health_checks: deleted N rows` 的成功行

13. 生成 signoff 报告 `docs/test-reports/BL-INFRA-ARCHIVE-signoff-2026-04-20.md`。

## Risks

| 风险 | 缓解 |
|---|---|
| DELETE 大批 health_checks 锁表 | 当前表 42 MB 可接受；未来若增大用批量 DELETE（每次 LIMIT 10000）；BL-DATA-CONSISTENCY 已为 health_checks 存在多个 index，DELETE 走 createdAt 范围扫描可接受 |
| scheduler 多副本重复执行 | 复用 BL-SEC-INFRA-GUARD leader-lock（仅 leader 跑） |
| TTL 过激删除审计需要的数据 | system_logs 90 天保守（审计常见窗口 1-3 个月）；health_checks 30 天（诊断场景）；如需更长由 admin 配置 |
| 生产首次清理一次删很多行 | 当前生产最早数据 2026-04-12（8 天），30 天内无数据会删；首次执行无影响（零删除） |

## 部署

- 纯代码变更，无 schema / migration
- 部署：git pull + npm ci + npm run build + pm2 restart
- 回滚：revert commit（interval 结束；本地测试数据可 manual 恢复）

## 验收标准

- [ ] F-IA-02 的 12 项全 PASS（生产 smoke 可延后到部署后再核）
- [ ] 新增单测 ≥ 3 条，vitest 全过
- [ ] build + tsc 通过
- [ ] signoff 报告归档

# BL-INFRA-ARCHIVE Verifying Cases (2026-04-20)

## 覆盖范围
- F-IA-02 全量验收 13 项

## 本地功能
1. cleanupHealthChecks: 构造 0/20/40/100 天数据，预期删 40/100，留 0/20。
2. cleanupSystemLogs: 构造 0/20/40/100 天数据，预期删 100，留 0/20/40。
3. scheduler 启动立即 tick（测试桩/单测断言）。
4. leader-lock 未持有时，不启动 maintenance scheduler（mock instrumentation）。

## 构建质量门
5. `npm run build`
6. `npx tsc --noEmit`
7. `npx vitest run`

## 生产只读预检
8. health_checks: `< now()-30d` 行数基线。
9. system_logs: `< now()-90d` 行数基线。
10. 静态扫描确认本批无 call_logs DELETE/分区改动。

## 部署后 smoke（可延后）
11. 调度后 health_checks 规模稳定（非全删）。
12. 运行日志出现 `[archive] ... deleted N rows`。

## 收尾
13. 生成 signoff 报告。

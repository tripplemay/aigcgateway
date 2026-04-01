# Channel Management 回归报告

- 测试目标：在 Codex 测试环境中，对 `/admin/models` 重构相关链路做回归验证
- 测试时间：2026-04-01
- 测试环境：本地测试环境 `3099`
- 环境启动：
  - `scripts/test/codex-setup.sh`：成功
  - `scripts/test/codex-restart.sh`：本次复测中出现一次 readiness 超时

## 测试范围

- 管理员登录
- 管理员资料接口
- `/api/admin/models-channels`
- `/api/admin/sync-status`
- `/api/admin/providers`
- `/api/admin/health`
- `/api/admin/users`
- `/api/admin/logs`
- `/api/admin/usage`
- `/api/admin/models-channels?modality=IMAGE`
- `/api/admin/models-channels?search=gpt`

## 执行结果

### 通过项

- `POST /api/auth/login` -> `200`
- `GET /api/auth/profile` -> `200`
- `GET /api/admin/providers` -> `200`
- `GET /api/admin/health` -> `200`
- `GET /api/admin/users` -> `200`
- `GET /api/admin/logs` -> `200`
- `GET /api/admin/usage` -> `200`
- `GET /api/admin/models-channels` -> `200`
- `GET /api/admin/sync-status` -> `200`
- `GET /api/admin/models-channels?modality=IMAGE` -> `200`，且非 IMAGE 结果数为 `0`
- `GET /api/admin/models-channels?search=gpt` -> `200`，且不匹配搜索词的结果数为 `0`

### 数据快照

- Provider 数：`7`（providers 接口）
- Health 数据条目：`352`
- `/api/admin/models-channels` Provider 分组数：`2`
- 开发者用户数：`0`
- 审计日志数：`0`

## 失败项

- 未发现新的接口级回归失败。

## 风险项

- `scripts/test/codex-restart.sh` 本次出现一次 `App failed to start within 60 seconds`，说明快速重启脚本稳定性不足。当前完整初始化脚本 `scripts/test/codex-setup.sh` 可用，但快速回归链路存在环境风险。
- 构建阶段仍有 `react-hooks/exhaustive-deps` 警告。
- 构建阶段仍出现 `next-intl` 的 `ENVIRONMENT_FALLBACK` 提示。

## 最终结论

本次回归未发现 `/admin/models` 重构引出的新的接口级回归问题。

当前可以确认：

- 管理员登录链路正常
- 相关 admin 接口正常
- `/admin/models` 的筛选相关接口正常

但测试环境层面仍需关注 `codex-restart.sh` 的启动稳定性。

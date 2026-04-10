# N1 UI Navigation Polish Reverify (2026-04-10 Round 4 Rerun)

## 测试目标
- 按用户指定流程进行一次严格复验，确认 Save 链路是否在“拉最新+全量重建+重启服务”后恢复。

## 严格流程执行记录
1. `git pull --ff-only origin main`：`Already up to date.`
2. `git log --oneline -1`：`a3cdf99 test(N1): record reverifying round4 failure`
3. `rm -rf .next`
4. `npm run build`：成功
5. `bash scripts/test/codex-setup.sh`（前台启动）
6. `bash scripts/test/codex-wait.sh`：`✅ Ready`

## 测试环境
- 环境：L1 本地（重置数据库后）
- 基址：`http://localhost:3099`
- 提交：`a3cdf99`
- 执行时间：`2026-04-10 18:10 CST`
- 账号：`admin@aigc-gateway.local`

## 核心用例（Save 按钮）
1. 登录后创建测试项目：`cmnsqwrx100qt9ybghxllc4q8`（`R4 Verify q0oq55`）。
2. 进入 `/settings` → `项目` tab。
3. 将名称改为 `R4 Verify q0oq55 UPDATED`，描述改为 `save-check-updated`，点击 `保存更改`。
4. 检查 Network（xhr/fetch）与 `GET /api/projects/:id`。

## 结果
- FAIL（阻断仍在）
- Network 列表无 `PATCH /api/projects/cmnsqwrx100qt9ybghxllc4q8`
- `GET /api/projects/cmnsqwrx100qt9ybghxllc4q8` 仍返回旧值：
  - `name: R4 Verify q0oq55`
  - `description: save-check`

## 结论
- 在严格流程下问题依旧复现，不属于 `.next` 缓存或旧服务进程导致的测试偏差。
- Save 点击后未触发 PATCH 请求，问题仍在前端保存触发链路。

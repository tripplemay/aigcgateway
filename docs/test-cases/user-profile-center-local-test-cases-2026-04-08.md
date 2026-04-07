Summary
- Scope: user-profile-center batch (F-UP-01~06) L1 local verification focusing on Sidebar user info + personal center entry + login history API/UI.
- Environment: Codex stack (`bash scripts/test/codex-setup.sh`) on http://localhost:3099.
- Result totals: 待执行

Scenario Coverage
- Scenario A – Sidebar renders user info card + Settings entry for different roles
- Scenario B – Login success writes LoginHistory rows (IP + user agent)
- Scenario C – `/api/auth/login-history` returns recent records per user
- Scenario D – Settings/Security Log section lists history entries with parsed metadata

Test Cases

ID: UPC-L1-01
Title: Sidebar shows user identity + Settings entry
Priority: High
Steps:
1. 登录 developer 账号，进入 `/dashboard`。
2. 观察 Sidebar 底部信息块。
3. 点击该信息块。
Expected:
- 显示用户名称（或 email 前缀）+ 角色徽标（Developer/Admin）。
- 点击跳转 `/settings`。

ID: UPC-L1-02
Title: Login success writes login history with IP/UA
Priority: Critical
Steps:
1. 注册新测试用户。
2. 连续两次调用 `/api/auth/login`（携带不同 UA）。
3. 调用 `/api/auth/login-history`。
Expected:
- 返回最多 20 条记录，最新记录在前。
- 每条包含 `ip`（默认 127.0.0.1）与 `userAgent`（匹配步骤 2 的 UA）。

ID: UPC-L1-03
Title: Settings 安全日志显示登录历史
Priority: High
Steps:
1. 使用有登录记录的账号登录控制台。
2. 打开 `/settings`。
3. 找到 “Security Log” 区块。
Expected:
- 列表展示最近登录记录的 UA + IP + 时间。
- 无记录时显示 `noLoginHistory` 文案。

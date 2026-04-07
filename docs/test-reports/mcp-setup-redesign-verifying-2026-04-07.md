# mcp-setup-redesign 验收报告（verifying）

- 日期：2026-04-07
- 环境：本地 Codex 测试环境 `http://localhost:3099`（`scripts/test/codex-setup.sh`）
- 批次：`mcp-setup-redesign`
- 参考：`docs/test-reports/mcp-setup-redesign-verifying-local-e2e-2026-04-07.json`

## 执行摘要

- 以 `admin@aigc-gateway.local` 登录，创建项目 `MCP Setup QA` 及 API Key `QA Key`（`pk_52b901c7...1332`）。
- MCP Setup 页面 Step1 支持直接粘贴完整 Key，并展示现有 Key 列表（仅前缀）。
- Step2 下拉包含 10 种客户端；每种配置一键渲染，`pre` 块内嵌真实 Bearer Token；截图 `docs/test-reports/mcp-setup-redesign-config.png`。
- 当用户点击 Key 前缀或未输入完整 Key 时，复制按钮会弹出提示并阻止复制。
- `GET /api/projects/:id/keys` 仅返回 `keyPrefix/maskedKey`，符合“仍需用户粘贴完整 Key”的设计。

## 详细验证

1. **Claude Code CLI 模式**（Acceptance #2）
   - 在输入框粘贴完整 Key 后，`pre` 区域渲染：
     ```bash
     claude mcp add aigc-gateway \\
       --transport streamable-http \\
       --url https://aigc.guangai.ai/mcp \\
       --header "Authorization: Bearer pk_52b901c7...1332"
     ```
   - 说明 CLI 命令已包含完整 URL 与 Header。

2. **Codex (TOML)**（Acceptance #3）
   - 切换到 Codex 选项，`pre` 区域显示：
     ```toml
     [mcp_servers.aigc-gateway]
     url = "https://aigc.guangai.ai/mcp"

     [mcp_servers.aigc-gateway.http_headers]
     "Authorization" = "Bearer pk_52b901c7...1332"
     ```
   - TOML 结构与 codex.toml 要求一致。

3. **其它客户端（Cursor / VS Code / Windsurf / Cline / Roo / JetBrains / Generic）**
   - 下拉列表采用统一 UI，切换后 `folder` 行提示配置路径（如 `.cursor/mcp.json`、`~/.codeium/windsurf/...`、`URL + Header`）。
   - `docs/test-reports/mcp-setup-redesign-config.png` 截图展示 Generic 模式，正文含 `Authorization: Bearer pk_52b901c7...1332`。

4. **Key 列表与粘贴提示（Acceptance #1）**
   - `GET /api/projects/cmnolcuh200qi9ysnrnagqhmc/keys` 返回 `"keyPrefix":"pk_52b90"` 与 `"maskedKey":"pk_52b90...****"`，未泄漏完整 Key。
   - 点击页面上的 `pk_52b90••••(QA Key)` 按钮后，输入框被填入掩码字符串，toast 显示“请在上方输入框中粘贴完整的 API Key”，确认仍需手动粘贴。

5. **复制按钮保护（Acceptance #4/5）**
   - 在掩码或空输入状态点击“复制配置”，toast 提示“请先输入 API Key”，`navigator.clipboard.writeText` 未执行。
   - 重新粘贴完整 Key 后点击复制，toast 显示“配置已复制！”，实现正向路径。

## 结论

| 功能 | 结果 | 说明 |
|---|---|---|
| F-MS-10 | PASS | 页面输入、配置渲染、Key 列表与复制逻辑均符合 Acceptance 1~5 |

→ 建议推进至 `done`，并补充 signoff。

# Framework 提案暂存区

> Generator 和 Evaluator 在工作中发现值得沉淀的经验时，追加到本文件。
> Planner 在 done 阶段读取本文件，逐条提交给用户确认。
> 确认后由 Planner 正式写入 `framework/` 对应文件，并在 `CHANGELOG.md` 追加记录，最后从本文件移除已确认条目。
> 已闭环条目归档到 `framework/archive/proposed-learnings-archive-vX.Y.md`。

---

<!-- 待确认的提案出现在此处，示例格式：

## [YYYY-MM-DD] [角色] — 来源：F-XXX

**类型：** 新规律 / 新坑 / 模板修订 / 铁律补充

**内容：** [一句话描述]

**建议写入：** `framework/README.md` §经验教训 / `framework/harness/xxx.md` / 其他

**状态：** 待确认

-->

## [2026-04-18] Planner — 来源：BL-SEC-INFRA-GUARD fix round 1 F-IG-04

**类型：** 铁律 2 的专项延伸（协议层断言）

**内容：** Planner 写 spec 涉及**协议返回形式断言**时，必须明确是哪一层协议（HTTP / MCP / JSON-RPC / WebSocket 等）的返回格式。本次 F-IG-04 acceptance 要求"HTTP 403"是对 MCP 协议的误解——MCP 是 JSON-RPC over HTTP，tool 调用错误标准返回 `{content:[...], isError: true}` 外层 HTTP 200。Code Review 报告把 MCP 当普通 REST API 对待，Planner 照抄未核实，差点逼 Generator 破坏 MCP 协议兼容性去改 server 层拦截。Generator fix round 0 实现本身是对的，是 spec 错了。

**建议写入：** `framework/harness/planner.md` Planner 铁律 2 的子条目：

**铁律 2.1：协议返回形式的断言必须标明协议层**
- HTTP API：标注 `HTTP 403` / `HTTP 200 + JSON body`
- MCP tool：标注 `{content, isError: true}` + 外层 HTTP 200（JSON-RPC over HTTP 标准）
- WebSocket：标注 frame type 和 payload 格式
- 不同协议的错误返回形式不同，混用会破坏客户端兼容性
- Code Review 报告对协议层的描述按"线索"处理，**协议格式断言必须查该协议 SDK 或官方文档核实后再写 spec**

**状态：** 待确认


# 模型自动同步引擎测试用例补充

## 补充原因

基于 [AIGC-Gateway-Model-Auto-Sync-PRD.md](/Users/yixingzhou/project/aigcgateway/docs/AIGC-Gateway-Model-Auto-Sync-PRD.md) 复核后，发现此前两份用例对以下 PRD 关键点覆盖不够完整：

- Jina Reader 作为第 2 层文档获取入口
- AI 提取异常时的两条降级保护
- 同步并发保护
- 手动同步接口稳定性

本补充文档仅追加缺失用例，不替代既有：

- [model-sync-ai-enrichment-api-test-cases-2026-03-31.md](/Users/yixingzhou/project/aigcgateway/docs/test-reports/model-sync-ai-enrichment-api-test-cases-2026-03-31.md)
- [model-sync-ai-enrichment-manual-test-cases-2026-03-31.md](/Users/yixingzhou/project/aigcgateway/docs/test-reports/model-sync-ai-enrichment-manual-test-cases-2026-03-31.md)

## API / 集成补充用例

ID: TC-API-SUP-001  
Title: 第 2 层文档获取走 Jina Reader  
Priority: Critical  
Requirement Source: PRD 3.1  
Preconditions:
- 本地测试环境已启动
- 任一含 `docUrls` 的 Provider 可触发同步
Request Sequence:
1. `POST /api/admin/sync-models`
   Payload:
   Expected Status: `200`
   Assertions:
   - 服务端日志中出现 `https://r.jina.ai/`
   - 不再出现旧实现直接 `fetch 原始 URL` 的路径
State Assertions:
- 即使 Jina Reader 失败，同步任务整体不中断
Cleanup:
- 无
Notes / Risks:
- 依赖服务端运行日志观察

ID: TC-API-SUP-002  
Title: AI 返回 0 模型且数据库已有 active channel 时跳过 reconcile  
Priority: Critical  
Requirement Source: PRD 6.1  
Preconditions:
- 某 Provider 在数据库中已有 active channels
- 可人为制造该 Provider 本次同步 `models.length=0`
Request Sequence:
1. 修改测试环境数据，使该 Provider `/models` 获取失败或返回空
2. `POST /api/admin/sync-models`
   Payload:
   Expected Status: `200`
   Assertions:
   - 同步结果不报整体失败
   - 服务端日志出现 `SKIPPED reconcile — AI returned 0 models but DB has ...`
State Assertions:
- 该 Provider 既有 active channels 未被批量禁用
Cleanup:
- 恢复 Provider 测试配置
Notes / Risks:
- 仅限本地测试环境数据操作

ID: TC-API-SUP-003  
Title: 本次模型数小于现有 active channel 50% 时跳过 reconcile  
Priority: Critical  
Requirement Source: PRD 6.1  
Preconditions:
- 某 Provider 已有较多 active channels
- 可人为制造本次同步仅返回少量模型
Request Sequence:
1. 将 Provider `/models` 指向测试桩，只返回少量模型
2. `POST /api/admin/sync-models`
   Payload:
   Expected Status: `200`
   Assertions:
   - 服务端日志出现 `SKIPPED reconcile — model count ... < 50% of existing ...`
State Assertions:
- 既有 channel 未被错误禁用
Cleanup:
- 恢复 Provider 测试配置与测试桩
Notes / Risks:
- 需要本地临时 mock 服务

ID: TC-API-SUP-004  
Title: 并发手动同步时第二次请求命中并发保护  
Priority: High  
Requirement Source: PRD 5 / 6  
Preconditions:
- 管理员已登录
Request Sequence:
1. 几乎同时发送两次 `POST /api/admin/sync-models`
   Payload:
   Expected Status: `200`
   Assertions:
   - 至少一条响应为正常同步结果
   - 另一条响应命中 `Sync already in progress` 语义，对应 `durationMs=0`、`providers=[]`
State Assertions:
- 不产生重复或相互覆盖的同步结果
Cleanup:
- 无
Notes / Risks:
- 需要并发请求

ID: TC-API-SUP-005  
Title: 手动同步接口响应稳定性  
Priority: High  
Requirement Source: PRD 5  
Preconditions:
- 管理员已登录
Request Sequence:
1. `POST /api/admin/sync-models`
   Payload:
   Expected Status: `200`
   Assertions:
   - 返回 JSON
   - body 含 `startedAt`、`finishedAt`、`providers`、`summary`
State Assertions:
- `sync-status.lastSyncTime` 更新
Cleanup:
- 无
Notes / Risks:
- 若网关或反向代理存在超时限制，需单独标为环境 / 部署稳定性问题

## 手工补充用例

ID: TC-MAN-SUP-001  
Title: 管理端同步状态可反映 API / AI / override 分层统计  
Priority: High  
Requirement Source: PRD 2.1 / 5  
Preconditions:
- 已完成一次同步
Steps:
1. 登录管理端
2. 打开模型管理页
3. 查看同步状态展示
Expected Result:
- 能看到每家 Provider 的 `API / AI / overrides` 维度统计或等价信息
Post-conditions:
- 无
Notes / Risks:
- 若页面只展示汇总，不展示分层细节，需通过接口补证

ID: TC-MAN-SUP-002  
Title: Jina Reader 或 AI 失败时页面仍保持现有数据  
Priority: High  
Requirement Source: PRD 6.1 / 6.2  
Preconditions:
- 某 Provider 已有可见模型
- 可制造本次文档提取失败
Steps:
1. 触发失败条件下的同步
2. 刷新管理端模型页和开发者模型页
Expected Result:
- 既有模型仍在
- 不发生大面积清空
- 缺失字段显示为空或 `—`
Post-conditions:
- 恢复测试配置
Notes / Risks:
- 本地环境需配合测试数据改动

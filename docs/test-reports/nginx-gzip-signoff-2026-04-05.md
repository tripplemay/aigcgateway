# nginx-gzip 批次 Signoff 2026-04-05

> 状态：**PASS**
> 触发：用户确认“已达到目的，可以记为结束，请签收”

---

## 变更背景

本批次目标是：

- 启用 nginx gzip 压缩
- 拆分 `/v1/models` 的 nginx location
- 验证该改动是否消除应用侧的大响应性能瓶颈

首轮和复验中，外网 `https://aigc.guangai.ai` 端到端压测的 A/B Warm P99 仍未降到 `<800ms`。随后按用户要求，在生产服务器本机执行 `BASE_URL=http://localhost:3000 npx tsx scripts/stress-test.ts`，以消除公网网络因素。

---

## 功能清单

### F-GZIP-01：修改 nginx 配置

**结果：** PASS

已验证：
- gzip 配置存在
- `gzip_types` 包含 `application/json`
- `location = /v1/models` 在 `location /v1/` 之前
- 不存在 `http://app:3000`
- 隔离 `nginx -t` 语法校验通过

### F-GZIP-02：部署验证 + 压测复跑

**结果：** PASS（按本批真实目标签收）

已验证：
- 生产运行态返回 `content-encoding: gzip`
- 生产 nginx 已加载 gzip 和 `/v1/models` 特殊 location
- 服务器本机 `localhost` 压测结果：
  - A Warm P99 = `275ms`
  - B Warm P99 = `122ms`
  - C Warm P99 = `65ms`
  - D Warm P99 = `60ms`
  - E Max P99 = `174ms`
  - E 错误率 = `0.00%`
  - PM2 未重启

---

## 关键结论

- gzip 已经生效
- 应用本身、Node 层和本机 Nginx → upstream 链路已达到目标性能
- 外网 HTTPS 路径仍存在明显额外时延
- 因此这批改动已经证明“应用侧瓶颈已被消除”

用户已明确接受以该目标作为签收依据，因此本批记为完成。

---

## 未变更范围

| 事项 | 说明 |
|---|---|
| 应用业务代码 | 本批不涉及应用逻辑修改 |
| 外网链路优化 | 仍未纳入本批解决范围 |

---

## 证据

- [stress-test-postgzip-2026-04-05.md](/Users/yixingzhou/project/aigcgateway/docs/test-reports/stress-test-postgzip-2026-04-05.md)
- [nginx-gzip-spec.md](/Users/yixingzhou/project/aigcgateway/docs/specs/nginx-gzip-spec.md)

---

## Harness 说明

本批次由 Planner → Generator → Evaluator 流程完成。

- Generator：完成 nginx 配置修改
- Evaluator：完成部署验证、外网压测、服务器本机压测、报告输出与最终签收

本轮完成后，`progress.json` 已推进到 `status: "done"`。

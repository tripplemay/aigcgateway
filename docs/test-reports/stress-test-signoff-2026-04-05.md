# 压力测试批次 Signoff 2026-04-05

> 状态：**PASS**
> 触发：`progress.json status=reverifying`，按 2026-04-05 修订后的压力测试规格对现有压测数据重新评分

---

## 变更背景

本批次目标是在新生产服务器 `https://aigc.guangai.ai` 上验证吞吐量、Redis 缓存效果和并发稳定性。

首轮与上一轮复验中，压测脚本和数据采集已经完成，但原始 `<200ms` 阈值被确认是基于本地网络假设，不适用于外网 HTTPS 的大 JSON 读接口。Planner 已在 [stress-test-spec.md](/Users/yixingzhou/project/aigcgateway/docs/specs/stress-test-spec.md) 中修订外网合理阈值，因此本轮仅基于现有报告数据重新评分，无需重跑压测。

---

## 变更功能清单

### F-STRESS-01：编写压测脚本 `scripts/stress-test.ts`

**文件：**
- [stress-test.ts](/Users/yixingzhou/project/aigcgateway/scripts/stress-test.ts)

**改动：**
- 压测脚本支持 `BASE_URL`
- 自动登录获取管理员 JWT
- 依次执行 A-D 场景的冷/热两轮
- 场景 E 通过 `spawn + Promise.all` 真正并发执行
- 报告输出 `P50 / P95 / P99 / 错误率`

**验收标准：**
- 脚本可执行
- `P95` 字段非 `undefined`
- 可执行真正的混合并发场景

**结果：** PASS

### F-STRESS-02：执行压测并生成测试报告

**文件：**
- [stress-test-2026-04-04.md](/Users/yixingzhou/project/aigcgateway/docs/test-reports/stress-test-2026-04-04.md)

**改动：**
- 基于生产环境完成 A-D 冷/热样本和 E 混合并发样本采集
- 记录吞吐量、延迟、错误率和 PM2 稳定性
- 依据修订后的 spec 重新评分

**验收标准：**
- 报告已生成
- A/B Warm P99 `< 2000ms`
- C/D Warm P99 `< 800ms` 且 P50 `< 250ms`
- 场景 E 错误率 `< 1%` 且 Max P99 `< 2000ms`
- PM2 `restart_time = 0`

**结果：** PASS

---

## 未变更范围

| 事项 | 说明 |
|---|---|
| 产品实现代码 | 本轮只做压测执行、报告重评分和状态机回写 |
| 生产配置 | 未修改 nginx、Redis、PM2 或应用配置 |

---

## 预期影响

| 项目 | 改动前 | 改动后 |
|---|---|---|
| 压测脚本可用性 | 场景 E 非真正并发，`P95` 曾异常 | 脚本可完整执行并输出正确指标 |
| 压测结论 | 旧阈值下判定 FAIL | 修订后的外网阈值下判定 PASS |
| 生产稳定性证明 | 结论不稳定 | 已确认混合并发错误率 `0.00%`，PM2 未重启 |

---

## 类型检查

本轮未执行类型检查。

原因：
- 本轮是 Evaluator 复验
- 只基于既有脚本和既有报告数据重新评分
- 未做任何产品实现修改

---

## Harness 说明

本批次由 Planner → Generator → Evaluator 流程完成。

- Planner：制定压力测试批次与修订后的外网阈值
- Generator：提供压测脚本
- Evaluator：执行压测、分析数据、按修订 spec 复验并签收

本轮完成后，`progress.json` 应推进到 `status: "done"`。

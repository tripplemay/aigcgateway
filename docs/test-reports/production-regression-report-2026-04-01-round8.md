# 生产环境回归报告（Round 8）

## 测试目标

- 对最新生产更新执行一轮回归验证
- 覆盖普通用户与管理员关键链路

## 测试环境

- 环境：生产环境
- 站点：`https://aigc.guangai.ai`
- 执行日期：`2026-04-01`
- 生产测试开关：
  - `PRODUCTION_STAGE=RND`
  - `PRODUCTION_DB_WRITE=ALLOW`
  - `HIGH_COST_OPS=ALLOW`

## 测试范围

- 公开访问：
  - 首页
  - `GET /api/v1/models`
- 管理员：
  - 登录
  - `GET /api/admin/sync-status`
  - `GET /api/admin/channels`
  - `POST /api/admin/sync-models`
- 普通用户：
  - 登录接口可用性

## 执行步骤概述

1. 先做生产 smoke
2. 尝试读取公开模型接口
3. 使用管理员账号登录并继续做管理员回归
4. 在出现异常后复查公开与登录接口

## 通过项

- 测试开始时，站点首页可访问
  - `GET /` 返回 `200`
- 测试开始时，公开模型接口可访问
  - `GET /api/v1/models` 返回 `200`
- 测试开始时，管理员登录成功
  - `POST /api/auth/login` 返回有效 token

## 失败项

### FAIL-001 生产站点在回归过程中进入统一 502 状态

- 实际结果：
  - 随后再次访问以下接口时，均返回 nginx `502 Bad Gateway`
    - `GET /api/v1/models`
    - `GET /api/admin/sync-status`
    - `GET /api/admin/channels`
    - `POST /api/auth/login`
- 预期结果：
  - 上述接口应持续可用，能完成本轮回归验证

## 风险项

- 这是一次“测试开始时可用，测试过程中转为全站 502”的波动
- 当前更像是生产网关或应用进程不稳定，而不是单一业务接口缺陷
- 在站点恢复前，本轮无法对普通用户和管理员功能给出有效应用层结论

## 证据

- `GET https://aigc.guangai.ai/` 初始返回 `200`
- `GET https://aigc.guangai.ai/api/v1/models` 初始返回 `200`
- `POST https://aigc.guangai.ai/api/auth/login` 初始返回有效 token
- 随后：
  - `GET /api/v1/models` 返回 `502`
  - `GET /api/admin/sync-status` 返回 `502`
  - `GET /api/admin/channels` 返回 `502`
  - `POST /api/auth/login` 返回 `502`

## 最终结论

本轮生产回归结论为：**阻塞，无法完成**。

原因不是测试步骤不足，而是生产环境在本轮执行过程中从“可访问”转为“统一 502”。在站点恢复稳定前，无法继续对普通用户与管理员功能做有效回归。

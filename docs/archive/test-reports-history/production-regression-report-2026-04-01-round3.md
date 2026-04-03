# 生产环境回归报告（Round 3）

## 测试目标

针对本轮修复再次在生产环境回归以下问题：

- 火山引擎开发者可见模型数是否已从 `12` 恢复到 `14`
- 硅基流动 AI 文档提取超时修复是否已生效
- 手动同步接口是否仍受 nginx 超时风险影响

## 生产测试开关

- `PRODUCTION_STAGE=RND`
- `PRODUCTION_DB_WRITE=ALLOW`
- `HIGH_COST_OPS=ALLOW`

## 测试环境

- 生产地址：`https://aigc.guangai.ai`
- 测试时间：`2026-04-01`

## 实际执行结果

本轮未能进入应用层，生产环境再次被网关层 `502 Bad Gateway` 阻塞。

已验证探针：

- `HEAD /` → `502 Bad Gateway`
- `GET /api/v1/models` → `502 Bad Gateway`
- `POST /api/auth/login` → `502 Bad Gateway`

原始返回一致：

- `Server: nginx/1.24.0 (Ubuntu)`
- body 为 nginx 标准 `502` 错误页

## 失败项

### FAIL-001 生产站点当前整体不可用

- 现象：
  - 首页返回 `502`
  - 模型接口返回 `502`
  - 登录接口返回 `502`
- 影响：
  - 无法登录管理员
  - 无法读取同步状态
  - 无法触发手动同步
  - 无法验证本轮修复是否生效

## 阻塞项

由于生产环境当前直接返回 `502 Bad Gateway`，以下目标本轮均无法验收：

- 火山引擎开发者可见模型数是否已到 `14`
- 硅基流动 AI 文档提取超时修复是否已生效
- 手动同步接口是否仍会 `504`

## 证据

- `HEAD https://aigc.guangai.ai/` → `HTTP/1.1 502 Bad Gateway`
- `GET https://aigc.guangai.ai/api/v1/models` → `HTTP/1.1 502 Bad Gateway`
- `POST https://aigc.guangai.ai/api/auth/login` → `HTTP/1.1 502 Bad Gateway`

## 最终结论

本轮生产回归结论为：**环境阻塞，无法开始应用层回归。**

当前优先级最高的问题不是业务修复结果，而是生产站点再次出现 nginx `502`。只有在站点恢复到应用层可访问后，才能继续验证：

- 火山引擎 `12 -> 14`
- 硅基流动 AI 超时修复
- 手动同步稳定性
